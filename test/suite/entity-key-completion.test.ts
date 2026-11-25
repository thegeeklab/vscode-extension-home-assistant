import * as assert from "assert"
import { TextDocument } from "vscode-languageserver-textdocument"
import { CompletionItem, Position } from "vscode-languageserver-protocol"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { createMockLanguageService, MockFileAccessor, MockHaConnection } from "../helpers/mocks.js"

function entityItem(label: string): CompletionItem {
  const item = CompletionItem.create(label)
  item.insertText = label
  item.data = { isEntity: true, entityId: label }
  return item
}

function findPosition(content: string, needle: string): Position {
  const lines = content.split("\n")
  const lineIndex = lines.findIndex((line) => line.includes(needle))
  assert.ok(lineIndex >= 0, `line containing "${needle}" not found`)
  const character = lines[lineIndex].indexOf(needle) + needle.length
  return Position.create(lineIndex, character)
}

suite("Entity ID completion as mapping key", () => {
  let languageService: HomeAssistantLanguageService

  const entityCompletions: CompletionItem[] = [
    entityItem("light.dining_room"),
    entityItem("switch.kitchen")
  ]

  suiteSetup(async () => {
    const connection = new MockHaConnection({ entityCompletions })
    languageService = await createMockLanguageService(connection, new MockFileAccessor())
  })

  const content = [
    "emulated_hue:",
    "  entities:",
    "    light.din",
    "    switch.kitchen:",
    "      name: Kitchen Switch"
  ].join("\n")

  const document = TextDocument.create("file:///test-emulated-hue.yaml", "yaml", 1, content)

  test("suggests entities for keys under emulated_hue.entities", async () => {
    const position = findPosition(content, "light.din")
    const result = await languageService.onCompletion(document, position)

    const labels = result.items.map((item) => item.label)
    assert.ok(labels.includes("light.dining_room"), "should suggest light.dining_room")
    assert.ok(labels.includes("switch.kitchen"), "should suggest switch.kitchen")
  })

  test("inserts a trailing colon for entity keys", async () => {
    const position = findPosition(content, "light.din")
    const result = await languageService.onCompletion(document, position)

    const diningRoom = result.items.find((item) => item.label === "light.dining_room")
    assert.ok(diningRoom, "should contain light.dining_room")
    assert.strictEqual(
      diningRoom.insertText,
      "light.dining_room:",
      "should insert a trailing colon"
    )
  })

  test("suggests entities for a key after an existing entity key block", async () => {
    const siblingContent = [
      "emulated_hue:",
      "  entities:",
      "    switch.kitchen:",
      "      name: Kitchen Switch",
      "    light.din"
    ].join("\n")
    const siblingDocument = TextDocument.create(
      "file:///test-emulated-hue-sibling.yaml",
      "yaml",
      1,
      siblingContent
    )
    const position = findPosition(siblingContent, "light.din")
    const result = await languageService.onCompletion(siblingDocument, position)

    const diningRoom = result.items.find((item) => item.label === "light.dining_room")
    assert.ok(diningRoom, "should suggest light.dining_room for a sibling key")
    assert.strictEqual(
      diningRoom.insertText,
      "light.dining_room:",
      "should insert a trailing colon for a sibling key"
    )
  })

  test("does not suggest entities for a nested option key", async () => {
    const position = findPosition(content, "name")
    const result = await languageService.onCompletion(document, position)

    const labels = result.items.map((item) => item.label)
    assert.ok(!labels.includes("light.dining_room"), "should not suggest entities for `name`")
  })

  test("keeps entity values without a trailing colon", async () => {
    const valueContent = [
      "automation:",
      "  - alias: Value Test",
      "    trigger:",
      "      - platform: state",
      "        entity_id: lig"
    ].join("\n")
    const valueDocument = TextDocument.create(
      "file:///test-entity-value.yaml",
      "yaml",
      1,
      valueContent
    )
    const position = findPosition(valueContent, "entity_id: lig")
    const result = await languageService.onCompletion(valueDocument, position)

    const diningRoom = result.items.find((item) => item.label === "light.dining_room")
    assert.ok(diningRoom, "should suggest light.dining_room for entity_id values")
    assert.strictEqual(diningRoom.insertText, "light.dining_room", "should not add a colon")
  })

  test("keeps entity list items without a trailing colon", async () => {
    const listContent = [
      "automation:",
      "  - alias: List Test",
      "    action:",
      "      - service: light.turn_on",
      "        target:",
      "          entities:",
      "            - light.kitchen",
      "            - lig"
    ].join("\n")
    const listDocument = TextDocument.create(
      "file:///test-entity-list.yaml",
      "yaml",
      1,
      listContent
    )
    const position = findPosition(listContent, "- lig")
    const result = await languageService.onCompletion(listDocument, position)

    const kitchen = result.items.find((item) => item.label === "switch.kitchen")
    assert.ok(kitchen, "should suggest switch.kitchen for list items")
    assert.strictEqual(kitchen.insertText, "switch.kitchen", "should not add a colon")
  })
})

suite("Service completion regression", () => {
  let languageService: HomeAssistantLanguageService

  const serviceCompletions: CompletionItem[] = [
    (() => {
      const item = CompletionItem.create("light.turn_on")
      item.insertText = "light.turn_on"
      item.data = { isService: true }
      return item
    })()
  ]

  suiteSetup(async () => {
    const connection = new MockHaConnection({ serviceCompletions })
    languageService = await createMockLanguageService(connection, new MockFileAccessor())
  })

  test("provides service completions after a service key", async () => {
    const serviceContent = [
      "automation:",
      "  - alias: Service Test",
      "    action:",
      "      - service: lig"
    ].join("\n")
    const serviceDocument = TextDocument.create(
      "file:///test-service-completion.yaml",
      "yaml",
      1,
      serviceContent
    )
    const position = findPosition(serviceContent, "service: lig")
    const result = await languageService.onCompletion(serviceDocument, position)

    const labels = result.items.map((item) => item.label)
    assert.ok(labels.includes("light.turn_on"), "should suggest light.turn_on")
  })
})
