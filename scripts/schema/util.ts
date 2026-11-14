import { statSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"

// Candidate suffixes used to resolve a relative import specifier to a source
// file. Shared by the compiler host (program.ts) and card discovery
// (discovery.ts) so the two never disagree about which file an import maps to.
const MODULE_CANDIDATES = [".ts", ".tsx", ".d.ts", "/index.ts"] as const

export function isInsideDirectory(dir: string, target: string): boolean {
  const rel = relative(resolve(dir), resolve(target))
  return !rel.startsWith("..") && !isAbsolute(rel)
}

export function resolveModuleFile(containingFile: string, specifier: string): string | undefined {
  const base = resolve(dirname(containingFile), specifier)
  for (const candidate of MODULE_CANDIDATES) {
    const path = `${base}${candidate}`
    try {
      if (statSync(path).isFile()) return path
    } catch {
      // Not a file; try the next candidate.
    }
  }
  return undefined
}
