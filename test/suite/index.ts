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

  // Surface silent async failures so they don't hang the run invisibly.
  process.on("uncaughtException", (err) => {
    console.error("[test-suite] uncaughtException:", err)
  })
  process.on("unhandledRejection", (reason) => {
    console.error("[test-suite] unhandledRejection:", reason)
  })

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
      const runner = mocha.run((failures: number) => {
        clearInterval(heartbeat)
        log(`Test execution completed with ${failures} failures`)
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`))
        } else {
          resolve()
        }
      })

      // Watchdog: if this heartbeat stops, the extension host event loop is
      // blocked synchronously. If it keeps ticking, the hang is async (deadlock).
      const heartbeat = setInterval(() => {
        log(`heartbeat (total: ${runner.total})`)
      }, 2000)

      runner.on("start", () => log("RUNNER start"))
      runner.on("suite", (suite: Mocha.Suite) => {
        if (suite.title) log(`SUITE START: ${suite.title}`)
      })
      runner.on("test", (test: Mocha.Test) => log(`TEST START: ${test.fullTitle()}`))
      runner.on("pass", (test: Mocha.Test) => {
        log(`TEST PASS: ${test.fullTitle()} (${test.duration}ms)`)
      })
      runner.on("fail", (test: Mocha.Test, err: Error) => {
        log(`TEST FAIL: ${test.fullTitle()} - ${err.message}`)
      })
      runner.on("end", () => log("RUNNER end"))
    })
  } catch (err) {
    console.error("Failed to run tests:", err)
    throw err
  }
}
