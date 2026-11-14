import { mkdirSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { applyDescriptions, checkStaleDescriptions, loadDescriptions } from "./descriptions.ts"
import { discoverCards, discoverViewTypes } from "./discovery.ts"
import { Emitter, type SchemaNode } from "./emitter.ts"
import { DASHBOARD_CONFIG, VIEW_CONFIG, ensureFrontend } from "./frontend.ts"
import { createProgram, findDeclaration } from "./program.ts"

const OUT_DIR = resolve(
  process.env.OUT_DIR ??
    join(import.meta.dirname, "..", "..", "src", "language-service", "src", "schemas", "json")
)

export function generateLovelaceSchemas(strict: boolean): number {
  ensureFrontend()
  const program = createProgram()
  const checker = program.getTypeChecker()
  const sourceFiles = program.getSourceFiles()
  const emitter = new Emitter(checker)

  // --- Cards ---------------------------------------------------------------
  const { cards, unmatched } = discoverCards()
  const descriptions = loadDescriptions()
  console.log(`Discovered ${cards.length} cards`)

  const generatedCardProps = new Map<string, Set<string>>()
  const cardRefs: SchemaNode[] = []
  for (const card of cards) {
    const decl = findDeclaration(sourceFiles, card.interfaceName)
    if (!decl) {
      console.warn(`Skipping card "${card.type}": interface ${card.interfaceName} not found`)
      unmatched.push(card.type)
      continue
    }
    // Key by card type (not interface) so several types sharing one interface
    // (e.g. horizontal/vertical-stack -> StackCardConfig) stay distinct.
    const defName = `Card_${card.type.replace(/[^A-Za-z0-9]/g, "_")}`
    const body = emitter.emitObjectBody(checker.getTypeAtLocation(decl))
    // Override the inherited `type: string` with a const discriminator.
    const properties = body["properties"] as Record<string, SchemaNode>
    properties["type"] = { type: "string", const: card.type }
    const required = (body["required"] as string[] | undefined) ?? []
    if (!required.includes("type")) required.unshift("type")
    body["required"] = required

    applyDescriptions(properties, descriptions.cards[card.type])
    generatedCardProps.set(card.type, new Set(Object.keys(properties)))

    emitter.getDefinitions()[defName] = body
    cardRefs.push({ $ref: `#/definitions/${defName}` })
  }

  // `custom:*` cards stay permissive.
  emitter.getDefinitions()["Card_custom"] = {
    type: "object",
    additionalProperties: true,
    properties: {
      type: { type: "string", pattern: "^custom:" }
    },
    required: ["type"]
  }
  cardRefs.push({ $ref: "#/definitions/Card_custom" })

  // The full card union, referenced by nested `card`/`cards` properties.
  emitter.getDefinitions()["Card"] = { anyOf: cardRefs }

  writeSchema("lovelace-cards.json", {
    $schema: "http://json-schema.org/draft-07/schema#",
    anyOf: cardRefs,
    definitions: emitter.getDefinitions()
  })

  // --- Views ---------------------------------------------------------------
  const viewTypes = discoverViewTypes()
  const viewDecl = findDeclaration(sourceFiles, VIEW_CONFIG)
  const generatedViewProps = new Set<string>()
  if (viewDecl) {
    emitter.emitNamed(viewDecl)
    const viewDef = emitter.getDefinitions()[VIEW_CONFIG]
    if (viewDef) {
      const viewProps = viewDef["properties"] as Record<string, SchemaNode>
      for (const prop of Object.keys(viewProps)) generatedViewProps.add(prop)
      viewProps["type"] = {
        anyOf: [{ enum: viewTypes }, { type: "string", pattern: "^custom:" }]
      }
      generatedViewProps.add("type")
      applyDescriptions(viewProps, descriptions.views)
    }
    writeSchema("lovelace-views.json", {
      $schema: "http://json-schema.org/draft-07/schema#",
      $ref: `#/definitions/${VIEW_CONFIG}`,
      definitions: emitter.getDefinitions()
    })
  } else {
    console.warn(`View config interface ${VIEW_CONFIG} not found`)
  }

  // --- Dashboard -----------------------------------------------------------
  const dashboardDecl = findDeclaration(sourceFiles, DASHBOARD_CONFIG)
  const generatedDashboardProps = new Set<string>()
  if (dashboardDecl) {
    emitter.emitNamed(dashboardDecl)
    const dashboardDef = emitter.getDefinitions()[DASHBOARD_CONFIG]
    if (dashboardDef) {
      const dashboardProps = dashboardDef["properties"] as Record<string, SchemaNode>
      for (const prop of Object.keys(dashboardProps)) generatedDashboardProps.add(prop)
      applyDescriptions(dashboardProps, descriptions.dashboard)
    }
    writeSchema("lovelace-dashboard.json", {
      $schema: "http://json-schema.org/draft-07/schema#",
      $ref: `#/definitions/${DASHBOARD_CONFIG}`,
      definitions: emitter.getDefinitions()
    })
  } else {
    console.warn(`Dashboard config interface ${DASHBOARD_CONFIG} not found`)
  }

  const stale = checkStaleDescriptions(
    descriptions,
    cards,
    generatedCardProps,
    generatedViewProps,
    generatedDashboardProps
  )
  const issues = stale + unmatched.length
  if (strict && issues > 0) {
    const parts: string[] = []
    if (stale > 0) parts.push(`${stale} stale description(s)`)
    if (unmatched.length > 0) parts.push(`${unmatched.length} unmatched card(s)`)
    console.error(
      `Found ${parts.join(" and ")}. ` +
        "Update scripts/schema/lovelace-descriptions.json or fix card discovery, then re-run."
    )
  }
  return issues
}

function writeSchema(filename: string, schema: SchemaNode): void {
  mkdirSync(OUT_DIR, { recursive: true })
  const target = join(OUT_DIR, filename)
  writeFileSync(target, `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`Wrote ${relative(process.cwd(), target)}`)
}
