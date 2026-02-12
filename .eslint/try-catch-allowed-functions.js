/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Include or exclude specific function calls inside try/catch blocks',
      category: 'Best Practices',
      recommended: true
    },
    schema: [
      {
        type: 'object',
        properties: {
          include: {
            type: 'array',
            items: { type: 'string' }
          },
          exclude: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      noLogInCatch: '{{functionName}} is not allowed within catch blocks.'
    }
  },
  create: tryCatchAllowedFunctions
}

function tryCatchAllowedFunctions(context) {
  const { options } = context
  const { include = [], exclude = [] } = options[0] || {}

  /**
   * Check if a function name matches any pattern in the list (exact match or object method pattern)
   * @param {string} functionName
   * @param {string[]} list
   * @returns {boolean}
   */
  function isInList(functionName, list) {
    return list.some((pattern) => {
      if (pattern === functionName) {
        return true
      }

      if (pattern.includes('.')) {
        const [objName, methodName] = pattern.split('.')
        return functionName === `${objName}.${methodName}`
      }

      return false
    })
  }

  /**
   * Determine if a function call is allowed based on the include/exclude lists
   * @param {string} functionName
   * @returns {boolean}
   */
  function isAllowed(functionName) {
    if (include.length > 0) {
      return isInList(functionName, include)
    }

    if (exclude.length > 0) {
      return !isInList(functionName, exclude)
    }

    return true
  }

  /**
   * Extract the function name from a CallExpression node
   * @param node
   * @returns {string|null}
   */
  function getFunctionName(node) {
    if (node.type !== 'CallExpression') {
      return null
    }

    const { callee } = node

    if (callee.type === 'Identifier') {
      return callee.name
    }

    if (callee.type === 'MemberExpression') {
      const object = callee.object.name || ''
      const property = callee.property.name || ''

      if (object && property) {
        return `${object}.${property}`
      }
    }

    return null
  }

  return {
    CatchClause(node) {
      const blockStatements = node.body.body || []
      const processNode = (statement) => {
        if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
          const functionName = getFunctionName(statement.expression)

          if (functionName && !isAllowed(functionName)) {
            context.report({
              node: statement,
              messageId: 'noLogInCatch',
              data: {
                functionName
              }
            })
          }
        }

        if (statement.type === 'IfStatement') {
          if (statement.consequent) {
            if (statement.consequent.type === 'BlockStatement') {
              statement.consequent.body.forEach(processNode)
            } else {
              processNode(statement.consequent)
            }
          }

          if (statement.alternate) {
            if (statement.alternate.type === 'BlockStatement') {
              statement.alternate.body.forEach(processNode)
            } else {
              processNode(statement.alternate)
            }
          }
        }
      }

      blockStatements.forEach(processNode)
    }
  }
}
