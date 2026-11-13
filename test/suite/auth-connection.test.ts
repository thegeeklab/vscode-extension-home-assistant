import * as assert from "assert"
import { describeConnectionError } from "../../src/auth/connectionErrors.js"

suite("Connection Error Description Tests", () => {
  test("resolves the hostname errors with a DNS hint", () => {
    const message = describeConnectionError({ code: "ENOTFOUND", message: "getaddrinfo" })
    assert.ok(message.includes("could not be resolved"), message)
    assert.ok(message.includes("mDNS"), message)
  })

  test("resolves connection refused", () => {
    const message = describeConnectionError({ code: "ECONNREFUSED", message: "connect" })
    assert.ok(message.includes("connection refused"), message)
  })

  test("resolves TLS certificate errors with the setting hint", () => {
    const message = describeConnectionError({ code: "SELF_SIGNED_CERT_IN_CHAIN", message: "x" })
    assert.ok(message.includes("TLS certificate problem"), message)
    assert.ok(message.includes("home-assistant.ignoreCertificates"), message)
  })

  test("unwraps an undici error.cause", () => {
    const message = describeConnectionError({
      message: "fetch failed",
      cause: { code: "ETIMEDOUT", message: "connect ETIMEDOUT" }
    })
    assert.ok(message.includes("could not reach the host"), message)
    assert.ok(message.includes("ETIMEDOUT"), message)
  })

  test("falls back to a plain message without a code", () => {
    const message = describeConnectionError({ message: "something broke" })
    assert.strictEqual(message, "something broke")
  })

  test("handles undefined gracefully", () => {
    assert.strictEqual(describeConnectionError(undefined), "Unknown error")
  })
})
