import { readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { runTests } from "@vscode/test-electron"

async function main() {
  try {
    const extensionDevelopmentPath = resolve(import.meta.dirname, "../../")
    const extensionTestsPath = resolve(import.meta.dirname, "./suite/index.js")
    const testWorkspace = resolve(extensionDevelopmentPath, "test/fixtures/workspace")
    const userDataDir = join(tmpdir(), "home-assistant-test")

    // Clean up stale user data from previous test runs
    rmSync(userDataDir, { recursive: true, force: true })

    // Test against the VS Code version declared in package.json (@types/vscode),
    // unless overridden via VSCODE_TEST_VERSION
    const packageJson = JSON.parse(
      readFileSync(resolve(extensionDevelopmentPath, "package.json"), "utf-8")
    ) as { devDependencies: { "@types/vscode": string } }
    const version = process.env.VSCODE_TEST_VERSION ?? packageJson.devDependencies["@types/vscode"]

    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        "--new-window",
        "--disable-extensions",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-crash-reporter",
        "--user-data-dir",
        userDataDir
      ]
    })
  } catch (err) {
    console.error("Failed to run tests", err)
    process.exit(1)
  }
}

main()
