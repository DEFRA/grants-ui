import 'nunjucks'

// Nunjucks 3.2.4 exposes these AST members, but @types/nunjucks omits them.
declare module 'nunjucks' {
  namespace nodes {
    class Node {
      constructor(lineno?: number, colno?: number, ...fields: unknown[])
      typename: string
      value?: unknown
      findAll<T extends Node>(
        type: new (lineno?: number, colno?: number, ...fields: unknown[]) => T,
        results?: T[]
      ): T[]
    }

    class Literal extends Node {
      value: unknown
    }

    class Include extends Node {
      template: Node | null
    }

    class Import extends Node {
      template: Node | null
    }

    class FromImport extends Node {
      template: Node | null
    }

    class Extends extends Node {
      template: Node | null
    }
  }

  namespace parser {
    function parse(source: string): nodes.Node
  }
}
