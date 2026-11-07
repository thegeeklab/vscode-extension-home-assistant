import * as path from "path"
import Mocha from "mocha"
import { glob } from "glob"

// Suppress SIGPIPE errors that can crash the renderer process in CI environments.
// This happens when spawning processes that fail immediately.
process.on("SIGPIPE", () => {})

// Custom reporter that logs each suite/test as it starts (CI-friendly)
class DebugReporter {
  private startTime: number

  constructor(runner: Mocha.Runner) {
    this.startTime = Date.now()
    const log = (msg: string) => console.log(`[${Date.now() - this.startTime}ms] ${msg}`)

    runner.on("suite", (suite: Mocha.Suite) => {
      if (suite.title) {
        log(`SUITE START: ${suite.title}`)
      }
    })
    runner.on("test", (test: Mocha.Test) => {
      log(`TEST START: ${test.fullTitle()}`)
    })
    runner.on("pass", (test: Mocha.Test) => {
      log(`TEST PASS: ${test.fullTitle()} (${test.duration}ms)`)
    })
    runner.on("fail", (test: Mocha.Test, err: Error) => {
      log(`TEST FAIL: ${test.fullTitle()} - ${err.message}`)
    })
  }
}

export async function run(): Promise<void> {
  const startTime = Date.now()
  const log = (msg: string) => console.log(`[test-suite ${Date.now() - startTime}ms] ${msg}`)

  log("Initializing Mocha test suite")

  // Create the Mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 30000,
    reporter: DebugReporter as any
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
