import * as assert from "assert"
import { TextDocument } from "vscode-languageserver-textdocument"
import { CompletionItem, MarkupContent, Position } from "vscode-languageserver-protocol"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { createMockLanguageService, MockFileAccessor, MockHaConnection } from "../helpers/mocks.js"

function selectorItem(label: string, isTrigger: boolean): CompletionItem {
  const item = CompletionItem.create(label)
  item.data = isTrigger ? { isTrigger: true } : { isCondition: true }
  return item
}

function findPosition(content: string, needle: string): Position {
  const lines = content.split("\n")
  const lineIndex = lines.findIndex((line) => line.includes(needle))
  assert.ok(lineIndex >= 0, `line containing "${needle}" not found`)
  const character = lines[lineIndex].indexOf(needle) + needle.length
  return Position.create(lineIndex, character)
}

suite("Selector Completion with Mock Data", () => {
  let languageService: HomeAssistantLanguageService

  const triggerCompletions: CompletionItem[] = [
    selectorItem("light.turned_on", true),
    selectorItem("sun.sunrise", true),
    selectorItem("calendar.event_started", true)
  ]

  const conditionCompletions: CompletionItem[] = [
    selectorItem("light.is_on", false),
    selectorItem("temperature.is_value", false)
  ]

  suiteSetup(async () => {
    const connection = new MockHaConnection({
      triggerCompletions,
      conditionCompletions,
      selectorDescriptions: {
        "light.turned_on": {
          fields: {
            transition: { required: false, example: 2 }
          }
        }
      }
    })
    languageService = await createMockLanguageService(connection, new MockFileAccessor())
  })

  const completionContent = [
    "automation:",
    "  - alias: Selector Test",
    "    trigger:",
    "      - trigger:",
    "    condition:",
    "      - condition:",
    "    action:",
    "      - action: light.turn_on",
    "        target:",
    "          entity_id: light.living_room"
  ].join("\n")

  const completionDocument = TextDocument.create(
    "file:///test-selector-completion.yaml",
    "yaml",
    1,
    completionContent
  )

  const triggerValuePosition = findPosition(completionContent, "- trigger:")
  const conditionValuePosition = findPosition(completionContent, "- condition:")

  test("Trigger selector completions are returned for trigger values", async () => {
    const result = await languageService.onCompletion(completionDocument, triggerValuePosition)

    const labels = result.items.map((item) => item.label)
    assert.ok(labels.includes("light.turned_on"), "should include light.turned_on trigger")
    assert.ok(labels.includes("sun.sunrise"), "should include sun.sunrise trigger")
    assert.ok(
      labels.includes("calendar.event_started"),
      "should include calendar.event_started trigger"
    )
  })

  test("Condition selector completions are returned for condition values", async () => {
    const result = await languageService.onCompletion(completionDocument, conditionValuePosition)

    const labels = result.items.map((item) => item.label)
    assert.ok(labels.includes("light.is_on"), "should include light.is_on condition")
    assert.ok(
      labels.includes("temperature.is_value"),
      "should include temperature.is_value condition"
    )
  })

  test("Trigger and condition completions do not leak across keys", async () => {
    const triggerResult = await languageService.onCompletion(
      completionDocument,
      triggerValuePosition
    )
    const triggerLabels = triggerResult.items.map((item) => item.label)

    const conditionResult = await languageService.onCompletion(
      completionDocument,
      conditionValuePosition
    )
    const conditionLabels = conditionResult.items.map((item) => item.label)

    assert.ok(
      !triggerLabels.includes("light.is_on"),
      "trigger completions must not include conditions"
    )
    assert.ok(
      !conditionLabels.includes("light.turned_on"),
      "condition completions must not include triggers"
    )
  })

  test("Selector hover info is returned for a known trigger selector", async () => {
    const hoverContent = [
      "automation:",
      "  - alias: Selector Hover Test",
      "    trigger:",
      "      - trigger: light.turned_on"
    ].join("\n")

    const hoverDocument = TextDocument.create(
      "file:///test-selector-hover.yaml",
      "yaml",
      1,
      hoverContent
    )

    const hover = await languageService.onHover(
      hoverDocument,
      findPosition(hoverContent, "light.turned_on")
    )

    assert.ok(hover, "should provide hover info for a known trigger selector")
    if (hover) {
      const contents = hover.contents as MarkupContent
      assert.ok(
        contents.value.includes("light.turned_on"),
        "hover info should mention the selector ID"
      )
    }
  })

  test("No hover info is returned for an unknown selector", async () => {
    const hoverContent = [
      "automation:",
      "  - alias: Selector Hover Test",
      "    trigger:",
      "      - trigger: light.unknown_selector"
    ].join("\n")

    const hoverDocument = TextDocument.create(
      "file:///test-selector-hover-unknown.yaml",
      "yaml",
      1,
      hoverContent
    )

    const hover = await languageService.onHover(
      hoverDocument,
      findPosition(hoverContent, "light.unknown_selector")
    )

    assert.strictEqual(hover, null, "should not provide hover info for an unknown selector")
  })
})
