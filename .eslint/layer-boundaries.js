import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
    const root = context.cwd
    const moduleRoot = path.join(root, 'src/extended-forms-engine')
    const publicEntry = path.join(moduleRoot, 'index.js')
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
      const target = resolveSource(specifier, importer, root)
      if (!target) {
        return
      }
      if (insideModule && !isWithin(target, moduleRoot) && !isWithin(target, path.join(root, 'node_modules'))) {
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

/** @param {string} specifier @param {string} importer @param {string} root */
function resolveSource(specifier, importer, root) {
  if (specifier.startsWith('~/')) {
    return path.resolve(root, specifier.slice(2))
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
