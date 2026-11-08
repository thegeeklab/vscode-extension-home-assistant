import * as assert from "assert"
import { TextDocument } from "vscode-languageserver-textdocument"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { createMockLanguageService, MockFileAccessor, MockHaConnection } from "../helpers/mocks.js"

suite("Entity Validation with Mock Data", () => {
  let languageService: HomeAssistantLanguageService

  suiteSetup(async () => {
    const connection = new MockHaConnection({
      entities: {
        "light.kitchen": {
          entity_id: "light.kitchen",
          state: "off",
          attributes: {
            friendly_name: "Kitchen Light"
          },
          last_changed: "2023-01-01T00:00:00.000Z",
          last_updated: "2023-01-01T00:00:00.000Z",
          context: {
            id: "test",
            parent_id: null,
            user_id: null
          }
        },
        "light.living_room": {
          entity_id: "light.living_room",
          state: "on",
          attributes: {
            friendly_name: "Living Room Light"
          },
          last_changed: "2023-01-01T00:00:00.000Z",
          last_updated: "2023-01-01T00:00:00.000Z",
          context: {
            id: "test",
            parent_id: null,
            user_id: null
          }
        },
        "binary_sensor.motion": {
          entity_id: "binary_sensor.motion",
          state: "off",
          attributes: {
            friendly_name: "Motion Sensor"
          },
          last_changed: "2023-01-01T00:00:00.000Z",
          last_updated: "2023-01-01T00:00:00.000Z",
          context: {
            id: "test",
            parent_id: null,
            user_id: null
          }
        }
      }
    })

    languageService = await createMockLanguageService(connection, new MockFileAccessor())
  })

  test("Entity validation identifies unknown entities", async () => {
    // Create a test document with both known and unknown entities
    const testContent = `
automation:
  - alias: "Test Entity Validation"
    trigger:
      - platform: state
        entity_id: light.kitchen              # This exists
    condition:
      - condition: state
        entity_id: light.non_existing         # This doesn't exist
    action:
      - service: light.turn_on
        entity_id: light.living_room          # This exists
      - service: light.turn_off
        entity_id: sensor.non_existing        # This doesn't exist
        
# Test with array syntax
script:
  test_script:
    sequence:
      - service: homeassistant.turn_off
        entity_id: 
          - light.kitchen                     # This exists
          - light.fake_entity                 # This doesn't exist
          
# Test with inline array
group:
  test_group:
    entities: [light.living_room, switch.non_existing]  # One exists, one doesn't
`

    const document = TextDocument.create(
      "file:///test-entity-validation.yaml",
      "yaml",
      1,
      testContent
    )

    // Get diagnostics from language service (this will call our validation)
    const diagnostics = await languageService.getDiagnostics(document)

    // Filter for entity validation diagnostics
    const entityDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-entity"
    )

    console.log(`Found ${entityDiagnostics.length} entity validation diagnostics:`)
    for (const diagnostic of entityDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    // We should have exactly 4 unknown entity diagnostics
    assert.strictEqual(
      entityDiagnostics.length,
      4,
      `Expected 4 unknown entity diagnostics, got ${entityDiagnostics.length}`
    )

    // Check that the diagnostics are for the correct entities
    const expectedUnknownEntities = [
      "light.non_existing",
      "sensor.non_existing",
      "light.fake_entity",
      "switch.non_existing"
    ]

    const foundUnknownEntities = entityDiagnostics
      .map((d) => {
        const match = (d.message as string).match(/Entity '([^']+)'/)
        return match ? match[1] : null
      })
      .filter((e) => e !== null)

    for (const expectedEntity of expectedUnknownEntities) {
      assert.ok(
        foundUnknownEntities.includes(expectedEntity),
        `Expected to find diagnostic for unknown entity '${expectedEntity}'`
      )
    }

    // Verify that known entities don't generate diagnostics
    const knownEntities = ["light.kitchen", "light.living_room", "binary_sensor.motion"]
    for (const knownEntity of knownEntities) {
      assert.ok(
        !foundUnknownEntities.includes(knownEntity),
        `Known entity '${knownEntity}' should not generate a diagnostic`
      )
    }
  })

  test("Entity validation skips templates and secrets", async () => {
    const testContent = `
automation:
  - alias: "Test Templates and Secrets"
    trigger:
      - platform: state
        entity_id: "{{ states.sensor.template_entity.entity_id }}"  # Template, should be skipped
    condition:
      - condition: state
        entity_id: !secret my_entity_id                             # Secret, should be skipped
    action:
      - service: light.turn_on
        entity_id: light.unknown_entity                             # Unknown entity, should be flagged
`

    const document = TextDocument.create(
      "file:///test-templates-secrets.yaml",
      "yaml",
      1,
      testContent
    )

    const diagnostics = await languageService.getDiagnostics(document)
    const entityDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-entity"
    )

    console.log(
      `Found ${entityDiagnostics.length} entity validation diagnostics for templates/secrets test:`
    )
    for (const diagnostic of entityDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    // Should only have 1 diagnostic for the unknown entity, not for templates or secrets
    assert.strictEqual(
      entityDiagnostics.length,
      1,
      "Should only flag unknown entities, not templates or secrets"
    )

    const foundEntity = (entityDiagnostics[0].message as string).match(/Entity '([^']+)'/)?.[1]
    assert.strictEqual(foundEntity, "light.unknown_entity", "Should flag the unknown entity")
  })

  test("Entity validation handles malformed entity IDs gracefully", async () => {
    const testContent = `
automation:
  - alias: "Test Malformed Entities"
    trigger:
      - platform: state
        entity_id: not_a_valid_entity_format        # Invalid format, should be skipped
    action:
      - service: light.turn_on
        entity_id: "just_a_string"                  # Invalid format, should be skipped
      - service: light.turn_off
        entity_id: light.valid_but_unknown          # Valid format but unknown, should be flagged
`

    const document = TextDocument.create("file:///test-malformed.yaml", "yaml", 1, testContent)

    const diagnostics = await languageService.getDiagnostics(document)
    const entityDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-entity"
    )

    console.log(
      `Found ${entityDiagnostics.length} entity validation diagnostics for malformed test:`
    )
    for (const diagnostic of entityDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    // Should only have 1 diagnostic for the valid but unknown entity
    assert.strictEqual(
      entityDiagnostics.length,
      1,
      "Should only flag valid format unknown entities"
    )

    const foundEntity = (entityDiagnostics[0].message as string).match(/Entity '([^']+)'/)?.[1]
    assert.strictEqual(
      foundEntity,
      "light.valid_but_unknown",
      "Should flag the valid but unknown entity"
    )
  })

  test("Entity validation does not flag list items under unrelated properties", async () => {
    const testContent = `
automation:
  - trigger:
      - platform: state
        entity_id:
          - light.kitchen
    action:
      - action: script.do_thing
        data:
          payload:
            - light.fake_entity
`

    const document = TextDocument.create("file:///test-scope.yaml", "yaml", 1, testContent)

    const diagnostics = await languageService.getDiagnostics(document)
    const entityDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-entity"
    )

    assert.strictEqual(
      entityDiagnostics.length,
      0,
      `List items under unrelated properties should not be treated as entities, got ${JSON.stringify(
        entityDiagnostics.map((d) => d.message)
      )}`
    )
  })

  test("Entity validation handles null-value sequence items in entity lists", async () => {
    const testContent = `
automation:
  - trigger:
      - platform: state
        entity_id:
          -
          - light.fake_entity
`

    const document = TextDocument.create("file:///test-null-item.yaml", "yaml", 1, testContent)

    const diagnostics = await languageService.getDiagnostics(document)
    const entityDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-entity"
    )

    assert.strictEqual(
      entityDiagnostics.length,
      1,
      `A null-value sequence item should not break entity list detection, got ${JSON.stringify(
        entityDiagnostics.map((d) => d.message)
      )}`
    )

    const foundEntity = (entityDiagnostics[0].message as string).match(/Entity '([^']+)'/)?.[1]
    assert.strictEqual(foundEntity, "light.fake_entity", "Should flag the unknown entity")
  })

  test("Entity validation distinguishes disabled entities from missing ones", async () => {
    const connection = new MockHaConnection({
      entities: {},
      entityRegistry: {
        "switch.disabled_switch": {
          entity_id: "switch.disabled_switch",
          disabled_by: "user"
        }
      }
    })

    const disabledService = await createMockLanguageService(connection, new MockFileAccessor())

    const testContent = `
automation:
  - alias: "Disabled entity test"
    action:
      - action: switch.turn_on
        entity_id: switch.disabled_switch
`

    const document = TextDocument.create("file:///test-disabled.yaml", "yaml", 1, testContent)

    const diagnostics = await disabledService.getDiagnostics(document)

    const disabledDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "disabled-entity"
    )
    const unknownDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-entity"
    )

    assert.strictEqual(
      disabledDiagnostics.length,
      1,
      "Disabled entity should produce a disabled-entity diagnostic"
    )
    assert.strictEqual(
      unknownDiagnostics.length,
      0,
      "Disabled entity should not produce an unknown-entity diagnostic"
    )
  })
})
