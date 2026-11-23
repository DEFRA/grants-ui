import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ESLint } from 'eslint'
import nunjucks from 'nunjucks'
import { compileAsync, compileStringAsync, NodePackageImporter } from 'sass-embedded'
import stylelint from 'stylelint'
import { sassPaths, templatePaths } from '../src/extended-forms-engine/index.js'
import { viewPaths } from '../src/config/nunjucks/view-paths.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const moduleRoot = path.join(projectRoot, 'src/extended-forms-engine')
const [componentRoot] = templatePaths
const nodeModules = path.join(projectRoot, 'node_modules')
const govukRoot = path.join(nodeModules, 'govuk-frontend/dist/govuk')
const canonicalModuleRoot = await fs.realpath(moduleRoot)
const canonicalNodeModules = await fs.realpath(nodeModules)
const canonicalGovukRoot = await fs.realpath(govukRoot)
const eslint = new ESLint({ cwd: projectRoot, cache: false })
const boundaryRules = ['grants-ui/layer-boundaries', 'no-restricted-syntax']
const templateTypes = [nunjucks.nodes.Include, nunjucks.nodes.Import, nunjucks.nodes.FromImport, nunjucks.nodes.Extends]
const templateFile = path.join(componentRoot, 'heading/macro.njk')
const applicationFile = path.join(projectRoot, 'src/config/nunjucks/view-paths.js')
const sassOptions = {
  loadPaths: [...sassPaths, nodeModules],
  importers: [new NodePackageImporter(projectRoot)],
  quietDeps: true
}

describe('extended forms engine JavaScript isolation', () => {
  it.each([
    ['internal import', "import './component-helpers.js'"],
    ['internal re-export', "export { createComponentRenderer } from './component-helpers.js'"],
    ['internal dynamic import', "import('./component-helpers.js')"],
    ['Node built-in', "import path from 'node:path'"],
    ['npm package', "import nunjucks from 'nunjucks'"]
  ])('allows %s', async (_name, source) => {
    const [result] = await eslint.lintText(source, {
      filePath: path.join(moduleRoot, 'test-helpers/isolation.test.js')
    })
    expect(result.fatalErrorCount).toBe(0)
    expect(result.messages.filter(({ ruleId }) => boundaryRules.includes(ruleId))).toEqual([])
  })

  it.each([
    ['relative escape', "import '../../config/nunjucks/view-paths.js'", 'grants-ui/layer-boundaries'],
    ['absolute application import', `import '${applicationFile}'`, 'grants-ui/layer-boundaries'],
    ['application alias', "import '~/src/config/nunjucks/view-paths.js'", 'grants-ui/layer-boundaries'],
    ['root file', "export { default } from '../../../eslint.config.js'", 'grants-ui/layer-boundaries'],
    ['external re-export', "export * from '../../config/nunjucks/view-paths.js'", 'grants-ui/layer-boundaries'],
    ['lookalike directory', "import '../../extended-forms-engine-other/helper.js'", 'grants-ui/layer-boundaries'],
    ['dynamic escape', "import('../../config/nunjucks/view-paths.js')", 'grants-ui/layer-boundaries'],
    ['computed import', 'import(name)', 'no-restricted-syntax'],
    ['template literal import', `import(\`./\${name}.js\`)`, 'no-restricted-syntax'],
    ['CommonJS require', "require('node:fs')", 'no-restricted-syntax'],
    ['aliased require', "const load = require; load('node:fs')", 'no-restricted-syntax'],
    ['module require', "module.require('node:fs')", 'no-restricted-syntax'],
    ['computed require', "module['require']('node:fs')", 'no-restricted-syntax'],
    ['loader factory', "import { createRequire as load } from 'node:module'", 'grants-ui/layer-boundaries'],
    ['bare loader factory', "import { createRequire } from 'module'", 'grants-ui/layer-boundaries'],
    ['file URL', `import '${pathToFileURL(applicationFile).href}'`, 'no-restricted-syntax'],
    ['data URL', "import 'data:text/javascript,export default 1'", 'no-restricted-syntax'],
    ['HTTP URL', "import 'http://example.test/module.js'", 'no-restricted-syntax'],
    ['HTTPS URL', "import 'https://example.test/module.js'", 'no-restricted-syntax']
  ])('rejects %s in production and test sources', async (_name, source, ruleId) => {
    for (const filename of ['isolation.js', 'isolation.test.js']) {
      const [result] = await eslint.lintText(source, {
        filePath: path.join(moduleRoot, 'test-helpers', filename)
      })
      expect(result.fatalErrorCount).toBe(0)
      expect(result.messages.map((message) => message.ruleId)).toContain(ruleId)
    }
  })

  it.each([
    "import { templatePaths } from '~/src/extended-forms-engine/index.js'",
    "export { templatePaths } from '../../extended-forms-engine/index.js'",
    "import('../../extended-forms-engine/index.js')"
  ])('allows consumers to use the public interface: %s', async (source) => {
    const [result] = await eslint.lintText(source, { filePath: applicationFile })
    expect(result.fatalErrorCount).toBe(0)
    expect(result.messages.filter(({ ruleId }) => boundaryRules.includes(ruleId))).toEqual([])
  })

  it.each([
    "import '~/src/extended-forms-engine/test-helpers/component-helpers.js'",
    "export * from '../../extended-forms-engine/test-helpers/component-helpers.js'",
    "import('../../extended-forms-engine/test-helpers/component-helpers.js')",
    `import '${path.join(moduleRoot, 'test-helpers/component-helpers.js')}'`,
    `import '${pathToFileURL(path.join(moduleRoot, 'test-helpers/component-helpers.js')).href}'`,
    "require('../../extended-forms-engine/test-helpers/component-helpers.js')"
  ])('rejects consumer deep imports: %s', async (source) => {
    for (const filePath of [applicationFile, applicationFile.replace('.js', '.test.js')]) {
      const [result] = await eslint.lintText(source, { filePath })
      expect(result.fatalErrorCount).toBe(0)
      expect(result.messages.map(({ ruleId }) => ruleId)).toContain('grants-ui/layer-boundaries')
    }
  })
})

describe('extended forms engine template isolation', () => {
  it('resolves every module template dependency without application view paths', async () => {
    const files = await walk(moduleRoot, (file) => /\.(njk|html)$/.test(file))
    const visited = new Set()
    for (const file of files) {
      await inspectTemplate(file, visited)
    }
    expect([...visited].sort()).toEqual((await Promise.all(files.map((file) => fs.realpath(file)))).sort())
  })

  it('keeps module template names unique across application search paths', async () => {
    const templates = await walk(componentRoot, (file) => /\.(njk|html)$/.test(file))
    const applicationPaths = viewPaths.filter((directory) => !templatePaths.includes(directory))
    const collisions = []
    for (const template of templates) {
      const name = path.relative(componentRoot, template)
      for (const directory of applicationPaths) {
        const candidate = path.join(directory, name)
        if (
          await fs.stat(candidate).then(
            () => true,
            () => false
          )
        ) {
          collisions.push(candidate)
        }
      }
    }
    expect(collisions).toEqual([])
  })

  it.each([
    ['{% include "./template.njk" %}', path.join(componentRoot, 'heading/template.njk')],
    ['{% import "help-panel/macro.njk" as help %}', path.join(componentRoot, 'help-panel/macro.njk')],
    [
      '{% from "govuk/components/button/macro.njk" import govukButton %}',
      path.join(govukRoot, 'components/button/macro.njk')
    ]
  ])('resolves literal template dependency %s', async (source, target) => {
    expect(await resolveTemplateDependencies(source, templateFile)).toEqual([await fs.realpath(target)])
  })

  it.each([
    ['{% extends "layouts/page.njk" %}', 'Missing template dependency: layouts/page.njk'],
    [
      '{% include "~/src/server/common/templates/layouts/page.njk" %}',
      'Rejected template dependency: ~/src/server/common/templates/layouts/page.njk'
    ],
    [
      '{% include "../../../server/common/templates/layouts/page.njk" %}',
      'Rejected template dependency: ../../../server/common/templates/layouts/page.njk'
    ],
    [`{% include "${applicationFile}" %}`, `Rejected template dependency: ${applicationFile}`],
    ['{% include templateName %}', 'Non-literal template dependency: templateName'],
    ['{% if false %}{% include templateName %}{% endif %}', 'Non-literal template dependency: templateName'],
    ['{% include templateName ignore missing %}', 'Non-literal template dependency: templateName'],
    ['{% include "missing.njk" ignore missing %}', 'Missing template dependency: missing.njk'],
    ['{% include "govuk/../../application.njk" %}', 'Rejected template dependency: govuk/../../application.njk']
  ])('rejects template dependency %s', async (source, message) => {
    await expect(resolveTemplateDependencies(source, templateFile)).rejects.toThrow(message)
  })
})

describe('extended forms engine Sass isolation', () => {
  it('compiles every module stylesheet using only module and npm dependencies', async () => {
    const files = await walk(moduleRoot, (file) => file.endsWith('.scss'))
    for (const file of files) {
      const result = await compileAsync(file, sassOptions)
      const dependencies = await validateLoadedUrls(result.loadedUrls)
      expect(dependencies).toContain(await fs.realpath(file))
      const lint = await lintCssImports(result.css)
      expect(lint.errored).toBe(false)
    }
  })

  it('rejects an application stylesheet even when Sass can compile it', async () => {
    const applicationStyle = path.join(projectRoot, 'src/client/stylesheets/variables/_colours.scss')
    const result = await compileStringAsync(`@use "${applicationStyle}";`, {
      ...sassOptions,
      url: pathToFileURL(path.join(componentRoot, 'heading/_heading.scss'))
    })
    await expect(validateLoadedUrls(result.loadedUrls)).rejects.toThrow(
      `Loaded Sass dependency outside extended-forms-engine: ${applicationStyle}`
    )
  })

  it('rejects residual CSS imports not represented in Sass loadedUrls', async () => {
    const lint = await lintCssImports('@import "/public/application.css";')
    expect(lint.errored).toBe(true)
    expect(lint.results[0].warnings).toEqual([
      expect.objectContaining({ rule: 'at-rule-disallowed-list', text: expect.stringContaining('import') })
    ])
  })
})

async function walk(directory, filter) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(file, filter)))
    } else if (filter(file)) {
      files.push(file)
    }
  }
  return files
}

async function inspectTemplate(file, visited) {
  const canonicalFile = await fs.realpath(file)
  if (!isContained(canonicalFile, canonicalModuleRoot)) {
    throw new Error(`Template outside extended-forms-engine: ${file}`)
  }
  if (visited.has(canonicalFile)) {
    return
  }
  visited.add(canonicalFile)
  const dependencies = await resolveTemplateDependencies(await fs.readFile(file, 'utf8'), file)
  for (const dependency of dependencies) {
    if (isContained(dependency, canonicalModuleRoot)) {
      await inspectTemplate(dependency, visited)
    }
  }
}

async function resolveTemplateDependencies(source, importer) {
  const ast = nunjucks.parser.parse(source)
  const dependencies = []
  for (const Type of templateTypes) {
    for (const node of ast.findAll(Type)) {
      const template = node.template
      if (!(template instanceof nunjucks.nodes.Literal) || typeof template.value !== 'string') {
        throw new Error(`Non-literal template dependency: ${template?.value ?? template?.typename}`)
      }
      dependencies.push(await resolveTemplate(template.value, importer))
    }
  }
  return dependencies
}

async function resolveTemplate(name, importer) {
  if (path.isAbsolute(name) || name.startsWith('~')) {
    throw new Error(`Rejected template dependency: ${name}`)
  }
  const isGovuk = name.startsWith('govuk/')
  const relative = name.startsWith('./') || name.startsWith('../')
  const root = isGovuk ? govukRoot : relative ? path.dirname(importer) : componentRoot
  const target = path.resolve(root, isGovuk ? name.slice('govuk/'.length) : name)
  if (!isContained(target, isGovuk ? govukRoot : moduleRoot)) {
    throw new Error(`Rejected template dependency: ${name}`)
  }
  let canonicalTarget
  try {
    canonicalTarget = await fs.realpath(target)
  } catch (error) {
    throw new Error(`Missing template dependency: ${name}`, { cause: error })
  }
  if (!isContained(canonicalTarget, isGovuk ? canonicalGovukRoot : canonicalModuleRoot)) {
    throw new Error(`Rejected template dependency: ${name}`)
  }
  return canonicalTarget
}

async function validateLoadedUrls(urls) {
  const dependencies = []
  for (const url of urls) {
    if (url.protocol !== 'file:') {
      continue
    }
    const file = fileURLToPath(url)
    const canonicalFile = await fs.realpath(file)
    if (!isContained(canonicalFile, canonicalModuleRoot) && !isContained(canonicalFile, canonicalNodeModules)) {
      throw new Error(`Loaded Sass dependency outside extended-forms-engine: ${file}`)
    }
    dependencies.push(canonicalFile)
  }
  return dependencies
}

function lintCssImports(css) {
  return stylelint.lint({
    code: css,
    cache: false,
    config: { rules: { 'at-rule-disallowed-list': ['import'] } }
  })
}

function isContained(file, root) {
  const relative = path.relative(root, file)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
