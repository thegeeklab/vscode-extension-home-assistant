import * as path from "path"
import Mocha from "mocha"
import { glob } from "glob"

// Suppress SIGPIPE errors that can crash the renderer process in CI environments.
// This happens when spawning processes that fail immediately.
process.on("SIGPIPE", () => {})

export async function run(): Promise<void> {
  const startTime = Date.now()
  const log = (msg: string) => console.log(`[test-suite ${Date.now() - startTime}ms] ${msg}`)

  log("Initializing Mocha test suite")

  // Create the Mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 30000
  })

  const testsRoot = path.resolve(import.meta.dirname, "..")
  log(`Tests root: ${testsRoot}`)

  // Find all test files
  const files = await glob("**/**.test.js", { cwd: testsRoot })
  log(`Found ${files.length} test files: ${files.join(", ")}`)

  // Add files to the test suite
  files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)))

  try {
    // Run the tests
    log("Starting test execution")
    return new Promise<void>((resolve, reject) => {
      mocha.run((failures: number) => {
        log(`Test execution completed with ${failures} failures`)
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`))
        } else {
          resolve()
        }
      })
    })
  } catch (err) {
    console.error("Failed to run tests:", err)
    throw err
  }
}
