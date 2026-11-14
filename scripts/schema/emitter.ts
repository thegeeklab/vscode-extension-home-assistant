import ts from "typescript"

export type SchemaNode = Record<string, unknown>

/**
 * Type -> JSON Schema emitter. Handles the constructs generic TS-to-schema
 * tools struggle with for the frontend types (`keyof` on translation
 * dictionaries, stubbed external modules) and intentionally drops index
 * signatures so every object validates strictly.
 */
export class Emitter {
  private definitions: Record<string, SchemaNode> = {}
  private processing = new Set<string>()
  private checker: ts.TypeChecker

  constructor(checker: ts.TypeChecker) {
    this.checker = checker
  }

  public getDefinitions(): Record<string, SchemaNode> {
    return this.definitions
  }

  /**
   * Emit the schema for a named type (interface/type alias) referenced by its
   * declaration, registering it under `#/definitions/<name>`.
   */
  public emitNamed(typeNode: ts.Node): SchemaNode {
    const type = this.checker.getTypeAtLocation(typeNode)
    return this.emitType(type, typeNode)
  }

  private emitType(type: ts.Type, node?: ts.Node): SchemaNode {
    const { flags } = type

    // Leaf types never recurse, so they are emitted inline.
    if (flags & ts.TypeFlags.Any || flags & ts.TypeFlags.Unknown) return {}
    if (flags & ts.TypeFlags.Never) return { not: {} }
    if (flags & ts.TypeFlags.Null) return { type: "null" }
    if (flags & ts.TypeFlags.Undefined || flags & ts.TypeFlags.Void) return {}

    if (flags & ts.TypeFlags.String) return { type: "string" }
    if (flags & ts.TypeFlags.Number) return { type: "number" }
    if (flags & ts.TypeFlags.Boolean) return { type: "boolean" }
    if (flags & ts.TypeFlags.BigInt) return { type: "integer" }

    if (flags & ts.TypeFlags.StringLiteral)
      return { type: "string", const: (type as ts.StringLiteralType).value }
    if (flags & ts.TypeFlags.NumberLiteral)
      return { type: "number", const: (type as ts.NumberLiteralType).value }
    if (flags & ts.TypeFlags.BooleanLiteral)
      return { const: this.checker.typeToString(type) === "true" }

    if (flags & ts.TypeFlags.Enum) return this.emitEnum(type as ts.EnumType)
    if (flags & ts.TypeFlags.EnumLiteral) return { const: (type as ts.LiteralType).value }

    // Named structural types (object/union/intersection/array/tuple/...) can be
    // recursive, so guard them here and resolve any cycle to a `$ref`.
    const name = this.namedTypeName(type)
    if (name) {
      // The base card config is the loose union marker upstream; substitute the
      // full card union (registered in main()) so nested `card`/`cards` validate.
      if (name === "LovelaceCardConfig") return { $ref: "#/definitions/Card" }
      if (this.processing.has(name)) return { $ref: `#/definitions/${name}` }
      if (this.definitions[name]) return { $ref: `#/definitions/${name}` }
      this.processing.add(name)
      const def = this.emitStructural(type, node)
      this.processing.delete(name)
      this.definitions[name] = def
      return { $ref: `#/definitions/${name}` }
    }

    return this.emitStructural(type, node)
  }

  private emitStructural(type: ts.Type, node?: ts.Node): SchemaNode {
    const { flags } = type

    if (flags & ts.TypeFlags.Union) {
      return this.emitUnion(type as ts.UnionType)
    }
    if (flags & ts.TypeFlags.Intersection) {
      return { allOf: (type as ts.IntersectionType).types.map((t) => this.emitType(t, node)) }
    }
    // `keyof X`
    if (flags & ts.TypeFlags.Index) {
      return this.emitIndexType(type as ts.IndexType, node)
    }
    // Indexed access / conditional / template literal / mapped: best effort.
    if (
      flags &
      (ts.TypeFlags.IndexedAccess |
        ts.TypeFlags.Conditional |
        ts.TypeFlags.TemplateLiteral |
        ts.TypeFlags.Substitution)
    ) {
      const resolved = this.tryResolveAlias(type)
      if (resolved !== type) return this.emitType(resolved, node)
      if (flags & ts.TypeFlags.TemplateLiteral) return { type: "string" }
      return {}
    }

    if (this.checker.isTupleType(type)) {
      const elements = this.checker.getTypeArguments(type as ts.TypeReference)
      return { type: "array", items: elements.map((t) => this.emitType(t)) }
    }

    if (this.checker.isArrayType(type)) {
      const [elem] = this.checker.getTypeArguments(type as ts.TypeReference)
      return { type: "array", items: this.emitType(elem) }
    }

    if (flags & ts.TypeFlags.Object) {
      return this.emitObjectBody(type)
    }

    return {}
  }

  private emitEnum(type: ts.EnumType): SchemaNode {
    const values = (type as unknown as ts.UnionType).types.map(
      (t) => (t as ts.StringLiteralType).value
    )
    if (values.length === 1) return { const: values[0] }
    return { enum: values }
  }

  private emitIndexType(type: ts.IndexType, _node?: ts.Node): SchemaNode {
    const target = type.type
    if (target.flags & ts.TypeFlags.String) return { type: "string" }
    if (target.flags & ts.TypeFlags.Number) return { type: "number" }
    if (target.flags & ts.TypeFlags.Union) {
      const literals = (target as ts.UnionType).types.filter(
        (t) => t.flags & ts.TypeFlags.StringLiteral
      )
      if (literals.length === (target as ts.UnionType).types.length) {
        return { enum: literals.map((t) => (t as ts.StringLiteralType).value) }
      }
    }
    return { type: "string" }
  }

  private emitUnion(type: ts.UnionType): SchemaNode {
    const types = this.stripNullish(type.types)
    if (types.length === 1) return this.emitType(types[0])
    // TypeScript represents `boolean` as `true | false`.
    if (types.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) {
      return { type: "boolean" }
    }
    const literals = types.filter(
      (t) => t.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)
    )
    if (literals.length === types.length) {
      return {
        enum: literals.map(
          (t) => (t as ts.StringLiteralType).value ?? (t as ts.NumberLiteralType).value
        )
      }
    }
    return { anyOf: types.map((t) => this.emitType(t)) }
  }

  private stripNullish(types: readonly ts.Type[]): ts.Type[] {
    return types.filter(
      (t) =>
        !(t.flags & ts.TypeFlags.Null) &&
        !(t.flags & ts.TypeFlags.Undefined) &&
        !(t.flags & ts.TypeFlags.Never)
    )
  }

  public emitObjectBody(type: ts.Type): SchemaNode {
    const properties: Record<string, SchemaNode> = {}
    const required: string[] = []

    for (const prop of this.checker.getPropertiesOfType(type)) {
      if (prop.getName() === "__index" || prop.getName().startsWith("__")) continue
      const decl = prop.getDeclarations()?.[0]
      const isOptional = !!decl && !!ts.isPropertySignature(decl) && !!decl.questionToken
      const propType = this.checker.getTypeOfSymbol(prop)
      const schema = this.emitType(propType, decl)
      properties[prop.getName()] = this.withDescription(schema, prop)
      if (!isOptional) required.push(prop.getName())
    }

    const body: SchemaNode = { type: "object", properties }
    if (required.length) body["required"] = required
    // Strict: no index signature is emitted, so unknown keys are rejected.
    body["additionalProperties"] = false
    return body
  }

  private withDescription(schema: SchemaNode, symbol: ts.Symbol): SchemaNode {
    const jsdoc = ts.displayPartsToString(symbol.getDocumentationComment(this.checker)).trim()
    if (jsdoc && typeof schema === "object" && schema !== null) {
      return { ...schema, description: jsdoc }
    }
    return schema
  }

  private namedTypeName(type: ts.Type): string | undefined {
    const sym = type.aliasSymbol ?? type.getSymbol()
    if (!sym) return undefined
    const name = sym.getName()
    if (name === "__type" || name.startsWith("__")) return undefined
    if (name === "Array" || name === "ReadonlyArray" || name === "Promise") return undefined
    return name
  }

  private tryResolveAlias(type: ts.Type): ts.Type {
    const alias = type.aliasSymbol
    if (alias) {
      const decl = alias.getDeclarations()?.[0]
      if (decl && (ts.isTypeAliasDeclaration(decl) || ts.isInterfaceDeclaration(decl))) {
        return this.checker.getTypeAtLocation(decl)
      }
    }
    return type
  }
}
