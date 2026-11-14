import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CardEntry } from "./discovery.ts"
import type { SchemaNode } from "./emitter.ts"

// Human-curated hover descriptions keyed by schema section, card type and
// property. Structure (property names/types) is generated from the frontend;
// these strings are stable metadata that upstream types do not carry.
const DESCRIPTIONS_FILE = join(import.meta.dirname, "lovelace-descriptions.json")

export interface Descriptions {
  cards: Record<string, Record<string, string>>
  views: Record<string, string>
  dashboard: Record<string, string>
}

export function loadDescriptions(): Descriptions {
  if (!existsSync(DESCRIPTIONS_FILE)) {
    console.warn(`Descriptions overlay not found at ${DESCRIPTIONS_FILE}`)
    return { cards: {}, views: {}, dashboard: {} }
  }
  return JSON.parse(readFileSync(DESCRIPTIONS_FILE, "utf-8")) as Descriptions
}

// Apply curated descriptions to already-emitted properties, leaving property
// nodes untouched when there is no description.
export function applyDescriptions(
  properties: Record<string, SchemaNode>,
  overrides?: Record<string, string>
): void {
  if (!overrides) return
  for (const [prop, desc] of Object.entries(overrides)) {
    const node = properties[prop]
    if (node && typeof node === "object") {
      node["description"] = desc
    }
  }
}

// Warn when the curated overlay references a card or property that no longer
// exists in the generated schema, so stale descriptions are easy to spot.
// Returns the number of stale entries.
export function checkStaleDescriptions(
  descriptions: Descriptions,
  cards: CardEntry[],
  generatedCardProps: Map<string, Set<string>>,
  generatedViewProps: Set<string>,
  generatedDashboardProps: Set<string>
): number {
  const cardTypes = new Set(cards.map((c) => c.type))
  let stale = 0
  for (const [cardType, props] of Object.entries(descriptions.cards)) {
    if (!cardTypes.has(cardType)) {
      console.warn(`Stale description: unknown card type "${cardType}"`)
      stale++
      continue
    }
    const generated = generatedCardProps.get(cardType) ?? new Set<string>()
    for (const prop of Object.keys(props)) {
      if (!generated.has(prop)) {
        console.warn(`Stale description: "${cardType}.${prop}" no longer exists upstream`)
        stale++
      }
    }
  }
  for (const prop of Object.keys(descriptions.views)) {
    if (!generatedViewProps.has(prop)) {
      console.warn(`Stale description: "views.${prop}" no longer exists upstream`)
      stale++
    }
  }
  for (const prop of Object.keys(descriptions.dashboard)) {
    if (!generatedDashboardProps.has(prop)) {
      console.warn(`Stale description: "dashboard.${prop}" no longer exists upstream`)
      stale++
    }
  }
  if (stale > 0) {
    console.warn(
      `${stale} stale description(s) found; update scripts/schema/lovelace-descriptions.json`
    )
  }
  return stale
}
