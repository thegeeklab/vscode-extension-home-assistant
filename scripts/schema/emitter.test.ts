import { test } from "node:test"
import assert from "node:assert/strict"
import ts from "typescript"
import { Emitter, type SchemaNode } from "./emitter.ts"

const TEST_FILE = "/__schema-test__.ts"

interface ObjectDefinition {
  type: string
  properties: Record<string, SchemaNode>
  required?: string[]
  additionalProperties: boolean
}

function makeProgram(source: string): { program: ts.Program; checker: ts.TypeChecker } {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    strictNullChecks: true,
    skipLibCheck: true
  }
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  host.fileExists = (f) => f === TEST_FILE || fileExists(f)
  host.readFile = (f) => (f === TEST_FILE ? source : readFile(f))
  host.getSourceFile = (f, lang, onError, shouldCreateNew) =>
    f === TEST_FILE
      ? ts.createSourceFile(f, source, lang, true)
      : getSourceFile(f, lang, onError, shouldCreateNew)
  const program = ts.createProgram([TEST_FILE], options, host)
  return { program, checker: program.getTypeChecker() }
}

function findAlias(program: ts.Program, name: string): ts.TypeAliasDeclaration {
  for (const sf of program.getSourceFiles()) {
    if (sf.fileName !== TEST_FILE) continue
    for (const stmt of sf.statements) {
      if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name) return stmt
    }
  }
  throw new Error(`type alias ${name} not found`)
}

test("recursive object type resolves to a $ref cycle instead of recursing", () => {
  const { program, checker } = makeProgram("type Node = { name: string; child?: Node }")
  const emitter = new Emitter(checker)
  assert.deepEqual(emitter.emitNamed(findAlias(program, "Node")), { $ref: "#/definitions/Node" })
  const def = emitter.getDefinitions().Node as unknown as ObjectDefinition
  assert.deepEqual(def.properties.child, { $ref: "#/definitions/Node" })
})

test("recursive array type does not recurse unbounded", () => {
  const { program, checker } = makeProgram("type A = A[]")
  const emitter = new Emitter(checker)
  assert.deepEqual(emitter.emitNamed(findAlias(program, "A")), { $ref: "#/definitions/A" })
  assert.deepEqual(emitter.getDefinitions().A, {
    type: "array",
    items: { $ref: "#/definitions/A" }
  })
})

test("recursive union type is guarded", () => {
  const { program, checker } = makeProgram("type Json = string | Json[]")
  const emitter = new Emitter(checker)
  assert.deepEqual(emitter.emitNamed(findAlias(program, "Json")), { $ref: "#/definitions/Json" })
  const def = emitter.getDefinitions().Json as unknown as { anyOf: SchemaNode[] }
  assert.equal(def.anyOf.length, 2)
  assert.ok(def.anyOf.some((e) => e.type === "string"))
  assert.ok(
    def.anyOf.some(
      (e) =>
        e.type === "array" && (e as { items?: SchemaNode }).items?.$ref === "#/definitions/Json"
    )
  )
})
