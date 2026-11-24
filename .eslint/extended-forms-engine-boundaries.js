import path from 'node:path'
import { fileURLToPath } from 'node:url'

// From this file, not context.cwd: ESLint run from a subfolder would otherwise skip every check.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const moduleRoot = path.join(repoRoot, 'src/extended-forms-engine')
const publicEntry = path.join(moduleRoot, 'index.js')
const nodeModules = path.join(repoRoot, 'node_modules')

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      isolated: 'Keep extended-forms-engine independent of application sources and configuration.',
      publicInterface: 'Import extended-forms-engine through its index.js public interface.'
    }
  },
  create(context) {
    const importer = context.filename
    const insideModule = isWithin(importer, moduleRoot)

    /** @param {import('estree').Expression | null | undefined} source */
    function checkSource(source) {
      if (source?.type !== 'Literal' || typeof source.value !== 'string') {
        return
      }
      const specifier = source.value
      if (insideModule && (specifier.startsWith('~') || ['module', 'node:module'].includes(specifier))) {
        context.report({ node: source, messageId: 'isolated' })
        return
      }
      const target = resolveSource(specifier, importer)
      if (!target) {
        return
      }
      if (insideModule && !isWithin(target, moduleRoot) && !isWithin(target, nodeModules)) {
        context.report({ node: source, messageId: 'isolated' })
      } else if (!insideModule && isWithin(target, moduleRoot) && target !== publicEntry) {
        context.report({ node: source, messageId: 'publicInterface' })
      }
    }

    return {
      ImportDeclaration: (node) => checkSource(node.source),
      ExportNamedDeclaration: (node) => checkSource(node.source),
      ExportAllDeclaration: (node) => checkSource(node.source),
      ImportExpression: (node) => checkSource(node.source),
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          const source = node.arguments[0]
          if (source?.type !== 'SpreadElement') {
            checkSource(source)
          }
        }
      }
    }
  }
}

/** @param {string} specifier @param {string} importer */
function resolveSource(specifier, importer) {
  if (specifier.startsWith('~/')) {
    return path.resolve(repoRoot, specifier.slice(2))
  }
  if (specifier.startsWith('file:')) {
    return fileURLToPath(specifier)
  }
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    return path.resolve(path.dirname(importer), specifier)
  }
  return null
}

/** @param {string} file @param {string} root */
function isWithin(file, root) {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
