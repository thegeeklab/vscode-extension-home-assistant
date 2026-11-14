import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isInsideDirectory, resolveModuleFile } from "./util.ts"

test("isInsideDirectory accepts nested paths and rejects escapes", () => {
  assert.equal(isInsideDirectory("/repo/src", "/repo/src/a.ts"), true)
  assert.equal(isInsideDirectory("/repo/src", "/repo/src/deep/nested.ts"), true)
  assert.equal(isInsideDirectory("/repo/src", "/repo/other.ts"), false)
  assert.equal(isInsideDirectory("/repo/src", "/repo/src/../outside.ts"), false)
})

test("resolveModuleFile resolves .ts, .tsx, .d.ts and index.ts candidates", () => {
  const dir = mkdtempSync(join(tmpdir(), "schema-util-"))
  try {
    mkdirSync(join(dir, "card", "indexed"), { recursive: true })
    writeFileSync(join(dir, "card", "plain.ts"), "")
    writeFileSync(join(dir, "card", "component.tsx"), "")
    writeFileSync(join(dir, "card", "declaration.d.ts"), "")
    writeFileSync(join(dir, "card", "indexed", "index.ts"), "")

    const containing = join(dir, "card", "main.ts")
    assert.equal(resolveModuleFile(containing, "./plain"), join(dir, "card", "plain.ts"))
    assert.equal(resolveModuleFile(containing, "./component"), join(dir, "card", "component.tsx"))
    assert.equal(
      resolveModuleFile(containing, "./declaration"),
      join(dir, "card", "declaration.d.ts")
    )
    assert.equal(
      resolveModuleFile(containing, "./indexed"),
      join(dir, "card", "indexed", "index.ts")
    )
    assert.equal(resolveModuleFile(containing, "./missing"), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
