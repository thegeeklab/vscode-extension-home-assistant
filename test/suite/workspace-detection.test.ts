import * as assert from "assert"
import * as path from "path"
import * as vscode from "vscode"
import {
  getHomeAssistantWorkspaceFolders,
  isHomeAssistantWorkspaceFolder
} from "../../src/extension.js"

suite("Home Assistant Workspace Detection Tests", () => {
  let fixturesRoot: string

  suiteSetup(() => {
    const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""
    fixturesRoot = path.dirname(workspacePath)
  })

  test("Detects a workspace via the homeassistant: key", async () => {
    assert.strictEqual(
      await isHomeAssistantWorkspaceFolder(path.join(fixturesRoot, "workspace")),
      true
    )
  })

  test("Detects a workspace via the .storage folder", async () => {
    assert.strictEqual(
      await isHomeAssistantWorkspaceFolder(path.join(fixturesRoot, "ha-detection")),
      true
    )
  })

  test("Does not detect a non-Home-Assistant workspace", async () => {
    assert.strictEqual(
      await isHomeAssistantWorkspaceFolder(path.join(fixturesRoot, "non-ha-detection")),
      false
    )
  })

  test("Detects the open workspace as a Home Assistant workspace", async () => {
    const folders = await getHomeAssistantWorkspaceFolders()
    assert.strictEqual(folders.length, 1, "Expected one Home Assistant workspace folder")
  })
})
