import * as assert from "assert"
import * as vscode from "vscode"
import * as path from "path"
import { EXTENSION_ID } from "../helpers/constants.js"
import { waitForDiagnostics } from "../helpers/waitFor.js"

// Test entity validation functionality
suite("Entity Validation", () => {
  let workspacePath: string

  suiteSetup(async () => {
    workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""

    // Activate the extension
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate()

    vscode.window.showInformationMessage("Starting entity validation tests...")
  })

  test("Entity validation file can be opened", async () => {
    // Open the entity validation test file
    const testPath = path.join(workspacePath, "test-entity-validation.yaml")
    const document = await vscode.workspace.openTextDocument(testPath)
    await vscode.window.showTextDocument(document)

    // Verify the document is opened
    assert.ok(document, "Entity validation test document is opened")
    assert.ok(
      document.languageId === "yaml" || document.languageId === "home-assistant",
      `Document is recognized as YAML or Home Assistant (got: ${document.languageId})`
    )

    // Wait for the language server to produce entity diagnostics
    const diagnostics = await waitForDiagnostics(
      document,
      (ds) => ds.some((d) => d.source === "home-assistant" && d.code === "unknown-entity"),
      { message: "entity diagnostics for entity validation file" }
    )

    const entityDiagnostics = diagnostics.filter(
      (d) =>
        d.source === "home-assistant" &&
        (d.code === "unknown-entity" || d.message.includes("does not exist"))
    )

    assert.ok(
      entityDiagnostics.length > 0,
      `Expected entity validation diagnostics, got ${entityDiagnostics.length}`
    )

    // Close the document
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  test("Entity validation handles different entity formats", async () => {
    // Create a temporary test document with various entity formats
    const testContent = `
# Test various entity ID formats
automation:
  - alias: "Entity Test"
    trigger:
      platform: state
      entity_id: sensor.test_sensor
    action:
      - service: light.turn_on
        entity_id: light.test_light
      - service: switch.turn_off
        target:
          entity_id:
            - switch.test_switch1
            - switch.test_switch2
`

    const document = await vscode.workspace.openTextDocument({
      content: testContent,
      language: "home-assistant"
    })

    await vscode.window.showTextDocument(document)

    // Verify the document has the expected content
    assert.ok(document.getText().includes("sensor.test_sensor"), "Document contains test entity")
    assert.ok(document.getText().includes("entity_id:"), "Document contains entity_id properties")

    // Close the document
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  test("Entity validation skips commented lines", async () => {
    // Create a test document with commented entity IDs
    const testContent = `
# This is a comment with entity_id: sensor.commented_sensor
automation:
  - alias: "Comment Test"
    trigger:
      platform: state
      entity_id: sensor.real_sensor
    # entity_id: sensor.commented_in_middle
    action:
      - service: light.turn_on
        # This commented line should be ignored: entity_id: light.commented_light
        entity_id: light.real_light
      # - service: switch.turn_off
      #   entity_id: switch.commented_switch
`

    const document = await vscode.workspace.openTextDocument({
      content: testContent,
      language: "home-assistant"
    })

    await vscode.window.showTextDocument(document)

    // Wait for the language server to flag the real (non-commented) entities
    const diagnostics = await waitForDiagnostics(
      document,
      (ds) => ds.some((d) => d.source === "home-assistant" && d.code === "unknown-entity"),
      { message: "entity diagnostics for comment test" }
    )

    // Check that commented entity IDs don't generate diagnostics
    const entityDiagnostics = diagnostics.filter(
      (d) =>
        d.source === "home-assistant" &&
        (d.code === "unknown-entity" || d.message.includes("does not exist"))
    )

    // Verify that only non-commented entity IDs generate diagnostics
    for (const diagnostic of entityDiagnostics) {
      const line = document.lineAt(diagnostic.range.start.line).text
      assert.ok(!line.trim().startsWith("#"), `Diagnostic found on commented line: ${line.trim()}`)
    }

    // Close the document
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })
})
