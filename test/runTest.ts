import { cpSync, readFileSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { runTests } from "@vscode/test-electron"

async function main() {
  const startTime = Date.now()
  const log = (msg: string) => console.log(`[runTest ${Date.now() - startTime}ms] ${msg}`)

  log("Starting test setup")
  const extensionDevelopmentPath = resolve(import.meta.dirname, "../../")
  const extensionTestsPath = resolve(import.meta.dirname, "./suite/index.js")

  // Isolate fixtures and user data per run.
  const runDir = join(tmpdir(), `home-assistant-test-${randomUUID()}`)
  const testWorkspace = join(runDir, "fixtures", "workspace")
  const userDataDir = join(runDir, "user-data")

  log(`Copying fixtures to ${runDir}`)
  cpSync(resolve(extensionDevelopmentPath, "test/fixtures"), join(runDir, "fixtures"), {
    recursive: true
  })
  log("Fixtures copied")

  // Test against the VS Code version declared in package.json (@types/vscode),
  // unless overridden via VSCODE_TEST_VERSION
  const packageJson = JSON.parse(
    readFileSync(resolve(extensionDevelopmentPath, "package.json"), "utf-8")
  ) as { devDependencies: { "@types/vscode": string } }
  const version = process.env.VSCODE_TEST_VERSION ?? packageJson.devDependencies["@types/vscode"]

  try {
    log("Starting VS Code test runner")
    log(`VS Code version: ${version}`)
    log(`Extension path: ${extensionDevelopmentPath}`)
    log(`Test workspace: ${testWorkspace}`)
    log(`User data dir: ${userDataDir}`)

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
    log("VS Code test runner completed successfully")
  } catch (err) {
    log("Test runner failed")
    console.error("Failed to run tests", err)
    process.exitCode = 1
  } finally {
    log("Cleaning up test directory")
    rmSync(runDir, { recursive: true, force: true })
    log("Cleanup complete")
  }
}

main()
