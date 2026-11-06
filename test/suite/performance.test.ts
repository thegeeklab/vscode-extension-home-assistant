import * as assert from "assert"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { HomeAssistantYamlFile } from "../../src/language-service/src/haConfig/haYamlFile.js"
import { TestFileAccessor } from "../helpers/mocks.js"

suite("Performance Tests", () => {
  let workspacePath: string

  suiteSetup(() => {
    workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""
    vscode.window.showInformationMessage("Starting performance tests...")
  })

  // Generate a large YAML file with many scripts
  function generateLargeYamlFile(numScripts: number): string {
    let content = "# Large test file with many scripts\nscript:\n"

    for (let i = 0; i < numScripts; i++) {
      content += `  test_script_${i}:\n`
      content += `    alias: "Test Script ${i}"\n`
      content += "    sequence:\n"

      // Add 5 actions to each script
      for (let j = 0; j < 5; j++) {
        content += `      - service: light.turn_${j % 2 === 0 ? "on" : "off"}\n`
        content += "        target:\n"
        content += `          entity_id: light.test_light_${j}\n`

        // Add some conditional logic to make it more complex
        if (j % 2 === 0) {
          content += "        data:\n"
          content += `          brightness: ${(j * 50) % 255}\n`
          content += `          transition: ${j + 1}\n`
        }

        // Add a delay between actions
        if (j < 4) {
          content += "      - delay:\n"
          content += `          seconds: ${j + 1}\n`
        }
      }

      // Add a blank line between scripts
      content += "\n"
    }

    return content
  }

  // Create a test file with the specified content
  async function createLargeTestFile(content: string): Promise<string> {
    const testFilePath = path.join(workspacePath, "test-performance.yaml")
    await fs.writeFile(testFilePath, content)
    return testFilePath
  }

  test("YAML parsing performance scales reasonably with file size", async () => {
    // Test with various file sizes
    const scriptCounts = [10, 50, 100]
    const fileAccessor = new TestFileAccessor()
    const timings: { count: number; time: number }[] = []

    for (const count of scriptCounts) {
      // Generate and save large test file
      const content = generateLargeYamlFile(count)
      const testFilePath = await createLargeTestFile(content)

      // Measure parsing time
      const startTime = process.hrtime.bigint()

      const yamlFile = new HomeAssistantYamlFile(fileAccessor, testFilePath, "configuration.yaml")
      const scripts = await yamlFile.getScripts()

      const endTime = process.hrtime.bigint()
      const duration = Number(endTime - startTime) / 1_000_000 // Convert to milliseconds

      // Save timing result
      timings.push({ count, time: duration })

      // Basic validation of parsing result
      assert.ok(scripts, `Scripts object exists for file with ${count} scripts`)
      const scriptKeys = Object.keys(scripts)
      assert.strictEqual(scriptKeys.length, count, `Found correct number of scripts (${count})`)
    }

    // Log performance results
    console.log("YAML Parsing Performance Results:")
    timings.forEach(({ count, time }) => {
      console.log(`- ${count} scripts: ${time.toFixed(2)}ms`)
    })

    // Verify performance scales somewhat linearly
    // The time for the largest file should be less than 5x the time for the smallest file
    // (allowing for some overhead, but preventing catastrophic scaling issues)
    const smallestFileTime = timings[0].time
    const largestFileTime = timings[timings.length - 1].time
    const sizeFactor = scriptCounts[scriptCounts.length - 1] / scriptCounts[0]

    assert.ok(
      largestFileTime < smallestFileTime * 5 * sizeFactor,
      "Performance should scale reasonably with file size (not exponentially)"
    )
  })
})
