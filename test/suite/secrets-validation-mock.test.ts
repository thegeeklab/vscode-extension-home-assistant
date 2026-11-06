import * as assert from "assert"
import { TextDocument } from "vscode-languageserver-textdocument"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { createMockLanguageService, MockFileAccessor, MockHaConnection } from "../helpers/mocks.js"

suite("Secrets Validation Mock Tests", () => {
  let languageService: HomeAssistantLanguageService

  setup(async () => {
    // Mock secrets.yaml content with some test secrets
    const mockSecretsContent = `
# Test secrets file
database_password: "supersecret123"
api_key: "abc123def456"
wifi_password: "mypassword"
mqtt_user: "homeassistant"
mqtt_password: "mqttpass"
`

    languageService = await createMockLanguageService(
      new MockHaConnection(),
      new MockFileAccessor(mockSecretsContent)
    )
  })

  test("Secrets validation identifies unknown secrets", async () => {
    const testContent = `
automation:
  - alias: "Test Secrets Validation"
    trigger:
      - platform: state
        entity_id: light.kitchen
    action:
      - service: notify.email
        data:
          message: "Motion detected"
          target: !secret api_key              # This exists
      - service: mqtt.publish
        data:
          topic: "home/status"
          payload: "online"
          username: !secret mqtt_user          # This exists
          password: !secret unknown_secret     # This doesn't exist
          
script:
  test_script:
    sequence:
      - service: shell_command.backup
        data:
          password: !secret database_password  # This exists
      - service: notify.telegram
        data:
          api_key: !secret invalid_key         # This doesn't exist
`

    const document = TextDocument.create(
      "file:///test-secrets-validation.yaml",
      "yaml",
      1,
      testContent
    )

    const diagnostics = await languageService.getDiagnostics(document)

    const secretsDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-secret"
    )

    console.log(`Found ${secretsDiagnostics.length} secrets validation diagnostics:`)
    for (const diagnostic of secretsDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(
      secretsDiagnostics.length,
      2,
      `Expected 2 unknown secret diagnostics, got ${secretsDiagnostics.length}`
    )

    const expectedUnknownSecrets = ["unknown_secret", "invalid_key"]

    const foundUnknownSecrets = secretsDiagnostics
      .map((d) => {
        const match = d.message.match(/Secret '([^']+)'/)
        return match ? match[1] : null
      })
      .filter((s) => s !== null)

    for (const expectedSecret of expectedUnknownSecrets) {
      assert.ok(
        foundUnknownSecrets.includes(expectedSecret),
        `Expected to find diagnostic for unknown secret '${expectedSecret}'`
      )
    }

    const knownSecrets = ["api_key", "mqtt_user", "database_password"]
    for (const knownSecret of knownSecrets) {
      assert.ok(
        !foundUnknownSecrets.includes(knownSecret),
        `Known secret '${knownSecret}' should not generate a diagnostic`
      )
    }
  })

  test("Secrets validation skips templates and nested secrets", async () => {
    const testContent = `
automation:
  - alias: "Test Templates and Nested"
    trigger:
      - platform: state
        entity_id: light.kitchen
    action:
      - service: notify.email
        data:
          # Template secret, should be skipped
          api_key: "{{ states('input_text.api_key') }}"
      - service: shell_command.test
        data:
          # Unknown secret, should be flagged
          password: !secret nonexistent_secret
          # Valid secret, should not be flagged  
          user: !secret mqtt_user
`

    const document = TextDocument.create("file:///test-templates.yaml", "yaml", 1, testContent)

    const diagnostics = await languageService.getDiagnostics(document)
    const secretsDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-secret"
    )

    console.log(
      `Found ${secretsDiagnostics.length} secrets validation diagnostics for templates test:`
    )
    for (const diagnostic of secretsDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(
      secretsDiagnostics.length,
      1,
      "Should only flag unknown secrets, not templates"
    )

    const foundSecret = secretsDiagnostics[0].message.match(/Secret '([^']+)'/)?.[1]
    assert.strictEqual(foundSecret, "nonexistent_secret", "Should flag the unknown secret")
  })

  test("Secrets validation handles invalid secret names gracefully", async () => {
    const testContent = `
automation:
  - alias: "Test Invalid Secret Names"
    trigger:
      - platform: state
        entity_id: light.kitchen
    action:
      - service: test.service
        data:
          # Invalid secret name format (has spaces, special chars)
          key1: !secret "invalid secret with spaces"
          # Valid format but unknown secret
          key2: !secret valid_but_unknown
          # Valid and known secret
          key3: !secret api_key
`

    const document = TextDocument.create("file:///test-invalid-names.yaml", "yaml", 1, testContent)

    const diagnostics = await languageService.getDiagnostics(document)
    const secretsDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-secret"
    )

    console.log(
      `Found ${secretsDiagnostics.length} secrets validation diagnostics for invalid names test:`
    )
    for (const diagnostic of secretsDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(
      secretsDiagnostics.length,
      1,
      "Should only flag valid format unknown secrets"
    )

    const foundSecret = secretsDiagnostics[0].message.match(/Secret '([^']+)'/)?.[1]
    assert.strictEqual(
      foundSecret,
      "valid_but_unknown",
      "Should flag the valid but unknown secret"
    )
  })

  test("Secrets validation skips commented lines", async () => {
    const testContent = `
# This is a comment with !secret commented_secret
automation:
  - alias: "Comment Test"
    trigger:
      - platform: state
        entity_id: sensor.test
    # api_key: !secret commented_in_middle
    action:
      - service: notify.email
        data:
          # This commented line should be ignored: password: !secret commented_password
          message: "Test"
          title: "Alert"
      # - service: other
      #   data:
      #     token: !secret commented_unknown_secret
`

    const document = TextDocument.create(
      "file:///test-secrets-comments.yaml",
      "yaml",
      1,
      testContent
    )

    const diagnostics = await languageService.getDiagnostics(document)

    const secretsDiagnostics = diagnostics.filter(
      (d) => d.source === "home-assistant" && d.code === "unknown-secret"
    )

    console.log(
      `Found ${secretsDiagnostics.length} secrets validation diagnostics for comment test:`
    )
    for (const diagnostic of secretsDiagnostics) {
      console.log(`  - Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
    }

    assert.strictEqual(secretsDiagnostics.length, 0, "Should not flag secrets in commented lines")
  })
})
