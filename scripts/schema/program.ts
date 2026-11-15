import ts from "typescript"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { CARDS_FILE, FRONTEND_PATH } from "./frontend.ts"
import { isInsideDirectory, resolveModuleFile } from "./util.ts"

const stubCache = new Map<string, ts.ResolvedModule>()

export function createProgram(): ts.Program {
  const rootFiles = [
    join(FRONTEND_PATH, CARDS_FILE),
    join(FRONTEND_PATH, "src/data/lovelace/config/card.ts"),
    join(FRONTEND_PATH, "src/data/lovelace/config/view.ts"),
    join(FRONTEND_PATH, "src/data/lovelace/config/types.ts")
  ]
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strictNullChecks: true,
    skipLibCheck: true,
    resolveJsonModule: false,
    allowJs: false
  }
  const host = ts.createCompilerHost(options)

  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((name) => {
      if (name.startsWith(".")) {
        const resolved = resolveModuleFile(containingFile, name)
        if (resolved) {
          return { resolvedFileName: resolved, isExternalLibraryImport: false }
        }
      }
      // Bare specifier (home-assistant-js-websocket, lit, ...) or *.json etc:
      // resolve to a synthetic `export = any` stub so the type degrades to any.
      const key = name
      const cached = stubCache.get(key)
      if (cached) return cached
      const stub = join(FRONTEND_PATH, "node_modules", ".schema-stubs", `${hash(name)}.d.ts`)
      mkdirSync(dirname(stub), { recursive: true })
      writeFileSync(stub, `declare const mod: any;\nexport = mod;\n`)
      const resolved: ts.ResolvedModule = {
        resolvedFileName: stub,
        isExternalLibraryImport: true
      }
      stubCache.set(key, resolved)
      return resolved
    })

  return ts.createProgram(rootFiles, options, host)
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return `${(h >>> 0).toString(36)}_${s.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`
}

let declarationIndex: Map<string, ts.Node> | undefined

export function findDeclaration(
  sourceFiles: readonly ts.SourceFile[],
  name: string
): ts.Node | undefined {
  if (!declarationIndex) {
    declarationIndex = new Map<string, ts.Node>()
    for (const sf of sourceFiles) {
      // Skip TypeScript library files (lib.*.d.ts) and other non-frontend
      // sources: they contain thousands of irrelevant declarations.
      if (!isInsideDirectory(FRONTEND_PATH, sf.fileName)) continue
      collectDeclarations(sf, declarationIndex)
    }
  }
  return declarationIndex.get(name)
}

function collectDeclarations(node: ts.Node, index: Map<string, ts.Node>): void {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    if (!index.has(node.name.text)) index.set(node.name.text, node)
  }
  node.forEachChild((child) => collectDeclarations(child, index))
}
