import * as assert from "assert"
import * as vscode from "vscode"
import * as path from "path"
import { HomeAssistantYamlFile } from "../../src/language-service/src/haConfig/haYamlFile.js"
import { TestFileAccessor } from "../helpers/mocks.js"
import * as fs from "fs/promises"

suite("YAML Position Tracking Tests", () => {
  let workspacePath: string

  suiteSetup(() => {
    workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""
    vscode.window.showInformationMessage("Starting YAML position tracking tests...")
  })

  test("Can parse YAML files with correct positions", async () => {
    const testFilePath = path.join(workspacePath, "test-position-tracking.yaml")

    // Ensure the test file exists
    assert.ok(
      await fs.access(testFilePath).then(
        () => true,
        () => false
      ),
      "Test file exists"
    )

    const fileAccessor = new TestFileAccessor()
    const yamlFile = new HomeAssistantYamlFile(fileAccessor, testFilePath, "configuration.yaml")

    // Get scripts to trigger parsing
    const scripts = await yamlFile.getScripts()

    // Verify script detection
    assert.ok(scripts, "Scripts object exists")
    const scriptKeys = Object.keys(scripts)
    assert.ok(scriptKeys.length >= 3, `Found at least 3 scripts: ${scriptKeys.join(", ")}`)

    // Verify expected scripts exist
    assert.ok(scriptKeys.includes("test_script_1"), "test_script_1 script found")
    assert.ok(scriptKeys.includes("test_script_2"), "test_script_2 script found")
    assert.ok(scriptKeys.includes("another_script"), "another_script script found")

    // Verify positions are not [0,0] (which would indicate position tracking failed)
    for (const [scriptId, scriptInfo] of Object.entries(scripts)) {
      const hasValidPosition = scriptInfo.start[0] > 0 || scriptInfo.start[1] > 0
      assert.ok(
        hasValidPosition,
        `Script "${scriptId}" has valid position: [${scriptInfo.start.join(", ")}]`
      )
    }

    // Verify specific positions based on the YAML structure
    assert.deepStrictEqual(
      scripts.test_script_1.start,
      [5, 2],
      "test_script_1 has correct position"
    )
    assert.deepStrictEqual(
      scripts.test_script_2.start,
      [18, 2],
      "test_script_2 has correct position"
    )
    assert.deepStrictEqual(
      scripts.another_script.start,
      [62, 2],
      "another_script has correct position"
    )
  })

  test("Can handle different script formats", async () => {
    const testFilePath = path.join(workspacePath, "test-position-tracking.yaml")
    const fileAccessor = new TestFileAccessor()
    const yamlFile = new HomeAssistantYamlFile(fileAccessor, testFilePath, "configuration.yaml")

    // Get scripts
    const scripts = await yamlFile.getScripts()

    // Verify script format detection works for both regular and direct formats
    assert.ok(scripts.test_script_1, "Regular format script detected")
    assert.ok(scripts.another_script, "Direct format script detected")
  })
})
