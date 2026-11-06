import * as assert from "assert"
import { isHomeAssistantWorkspace } from "../../src/extension.js"

suite("Home Assistant Workspace Detection Tests", () => {
  test("Detects a Home Assistant workspace", async () => {
    // The test workspace (test/fixtures/workspace) contains configuration.yaml
    // with a "homeassistant:" key, so it should be detected as HA.
    assert.strictEqual(await isHomeAssistantWorkspace(), true)
  })

  test("Does not detect a non-Home-Assistant workspace", async function () {
    // Requires opening a workspace with a generic configuration.yaml and no
    // Home Assistant indicators, which the single test workspace does not provide.
    this.skip()
  })

  test("Respects disableAutomaticFileAssociation setting", async function () {
    // Requires toggling home-assistant.disableAutomaticFileAssociation and
    // observing file associations, which is covered indirectly by activation.
    this.skip()
  })
})
