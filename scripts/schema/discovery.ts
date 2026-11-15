import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CARDS_FILE, CARD_ELEMENTS, FRONTEND_PATH, VIEW_ELEMENTS } from "./frontend.ts"
import { isInsideDirectory, resolveModuleFile } from "./util.ts"

// Object key token: a quoted string ("alarm-panel") or a bareword (area).
// Shared between card and view discovery so both stay in sync.
const KEY_TOKEN = '(?:"([^"]+)"|([A-Za-z0-9_-]+))'

export interface CardEntry {
  type: string
  interfaceName: string
}

export interface CardDiscoveryResult {
  cards: CardEntry[]
  // Cards that could not be matched to a config interface that exists
  // upstream. These indicate a regression (renamed/removed interface or a
  // stale override) and gate `--strict`.
  unmatched: string[]
}

export function discoverCards(): CardDiscoveryResult {
  const elementsText = readFileSync(join(FRONTEND_PATH, CARD_ELEMENTS), "utf-8")
  // Matches both quoted ("alarm-panel") and bareword (area) keys, and
  // multi-line lazy imports (newlines are covered by \s*).
  const lazyImport = new RegExp(
    String.raw`${KEY_TOKEN}\s*:\s*\(\)\s*=>\s*import\(["']([^"']+)["']\)`,
    "g"
  )
  const entries: CardEntry[] = []
  const unmatched: string[] = []
  let m: RegExpExecArray | null
  const known = new Set(findInterfaceNames(join(FRONTEND_PATH, CARDS_FILE)))

  // Cards whose config interface cannot be derived from `setConfig(config: X)`
  // because it is inherited through a generic base class or an untyped param.
  const overrides: Record<string, string> = {
    "horizontal-stack": "StackCardConfig",
    "vertical-stack": "StackCardConfig",
    "shopping-list": "TodoListCardConfig",
    "entity-button": "ButtonCardConfig"
  }

  const resolveInterface = (elementFile: string): string | undefined => {
    if (!existsSync(elementFile)) return undefined
    const sm = /setConfig\(config:\s*([A-Za-z0-9_]+)\)/.exec(readFileSync(elementFile, "utf-8"))
    return sm?.[1]
  }

  const push = (type: string, interfaceName: string | undefined): void => {
    const resolved = interfaceName ?? overrides[type]
    if (!resolved) {
      // System card (e.g. `setConfig(_config: any)`) that has no derivable
      // config interface and is not user-configurable.
      console.warn(`Skipping card "${type}": no config interface found`)
      return
    }
    if (!known.has(resolved)) {
      console.warn(`Skipping card "${type}": config interface "${resolved}" not found upstream`)
      unmatched.push(type)
      return
    }
    entries.push({ type, interfaceName: resolved })
  }

  // Eagerly loaded cards live in ALWAYS_LOADED_TYPES; their element file follows
  // the `hui-<type>-card.ts` convention. `section` is a view type, not a card.
  const alwaysLoaded = /ALWAYS_LOADED_TYPES\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(elementsText)
  if (alwaysLoaded) {
    for (const q of alwaysLoaded[1].matchAll(/"([^"]+)"/g)) {
      const [, type] = q
      if (type === "section") continue
      const elementFile = join(FRONTEND_PATH, "src/panels/lovelace/cards", `hui-${type}-card.ts`)
      push(type, resolveInterface(elementFile))
    }
  }

  while ((m = lazyImport.exec(elementsText)) !== null) {
    const [, quoted, bareword, importPath] = m
    const type = quoted ?? bareword
    const elementFile = resolveModuleFile(join(FRONTEND_PATH, CARD_ELEMENTS), importPath)
    if (!elementFile || !isInsideDirectory(FRONTEND_PATH, elementFile)) {
      console.warn(
        `Skipping card "${type}": import path cannot be resolved inside the frontend checkout`
      )
      unmatched.push(type)
      continue
    }
    push(type, resolveInterface(elementFile))
  }

  return { cards: entries, unmatched }
}

export function discoverViewTypes(): string[] {
  const text = readFileSync(join(FRONTEND_PATH, VIEW_ELEMENTS), "utf-8")
  const types: string[] = []
  const always = /ALWAYS_LOADED_LAYOUTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(text)
  if (always) {
    for (const q of always[1].matchAll(/"([^"]+)"/g)) {
      types.push(q[1])
    }
  }
  const lazy = /LAZY_LOAD_LAYOUTS\s*=\s*\{([\s\S]*?)\}/.exec(text)
  if (lazy) {
    // Match both quoted ("sections") and bareword (masonry) keys, consistent
    // with card discovery above.
    for (const m of lazy[1].matchAll(new RegExp(String.raw`^\s*${KEY_TOKEN}\s*:`, "gm"))) {
      types.push(m[1] ?? m[2])
    }
  }
  return types
}

function findInterfaceNames(file: string): string[] {
  const text = readFileSync(file, "utf-8")
  const names: string[] = []
  for (const m of text.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g)) {
    names.push(m[1])
  }
  return names
}
