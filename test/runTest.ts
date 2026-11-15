import { cpSync, readFileSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { runTests } from "@vscode/test-electron"

async function main() {
  const extensionDevelopmentPath = resolve(import.meta.dirname, "../../")
  const extensionTestsPath = resolve(import.meta.dirname, "./suite/index.js")

  // Isolate fixtures and user data per run.
  const runDir = join(tmpdir(), `home-assistant-test-${randomUUID()}`)
  const testWorkspace = join(runDir, "fixtures", "workspace")
  const userDataDir = join(runDir, "user-data")

  cpSync(resolve(extensionDevelopmentPath, "test/fixtures"), join(runDir, "fixtures"), {
    recursive: true
  })

  // Test against the VS Code version declared in package.json (@types/vscode),
  // unless overridden via VSCODE_TEST_VERSION
  const packageJson = JSON.parse(
    readFileSync(resolve(extensionDevelopmentPath, "package.json"), "utf-8")
  ) as { devDependencies: { "@types/vscode": string } }
  const version = process.env.VSCODE_TEST_VERSION ?? packageJson.devDependencies["@types/vscode"]

  try {
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
    process.exitCode = 1
  } finally {
    rmSync(runDir, { recursive: true, force: true })
  }
}

void main()
