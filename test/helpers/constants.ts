import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../package.json"), "utf-8")
) as { publisher: string; name: string }

export const EXTENSION_ID = `${packageJson.publisher}.${packageJson.name}`
