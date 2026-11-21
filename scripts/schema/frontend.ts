import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export const FRONTEND_REPO = "https://github.com/home-assistant/frontend.git"
// Pinned to a release tag (managed by Renovate, see renovate.json) so schema
// generation and the stale-description CI gate are deterministic.
export const FRONTEND_REF = process.env.FRONTEND_REF ?? "20261028.8"
export const FRONTEND_PATH = resolve(
  process.env.FRONTEND_PATH ?? join(import.meta.dirname, "..", ".frontend")
)

export const CARDS_FILE = "src/panels/lovelace/cards/types.ts"
export const CARD_ELEMENTS = "src/panels/lovelace/create-element/create-card-element.ts"
export const VIEW_ELEMENTS = "src/panels/lovelace/create-element/create-view-element.ts"
export const VIEW_CONFIG = "LovelaceViewConfig"
export const DASHBOARD_CONFIG = "LovelaceConfig"

// Records the ref that was cloned so `ensureFrontend` can detect a stale cache
// after `FRONTEND_REF` is bumped (e.g. by Renovate).
const MARKER_FILE = join(FRONTEND_PATH, ".schema-ref")

export function ensureFrontend(): void {
  if (existsSync(join(FRONTEND_PATH, CARDS_FILE)) && checkoutMatchesRef()) {
    console.log(`Using frontend checkout at ${FRONTEND_PATH}`)
    return
  }
  const existedBefore = existsSync(FRONTEND_PATH)
  if (existedBefore) {
    rmSync(FRONTEND_PATH, { recursive: true, force: true })
  }
  mkdirSync(dirname(FRONTEND_PATH), { recursive: true })
  console.log(`Cloning ${FRONTEND_REPO}@${FRONTEND_REF} (sparse) ...`)
  try {
    execFileSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        FRONTEND_REF,
        "--filter=blob:none",
        "--sparse",
        FRONTEND_REPO,
        FRONTEND_PATH
      ],
      { stdio: "inherit" }
    )
    execFileSync(
      "git",
      [
        "-C",
        FRONTEND_PATH,
        "sparse-checkout",
        "set",
        "--no-cone",
        "src",
        "/package.json",
        "/tsconfig.json"
      ],
      {
        stdio: "inherit"
      }
    )
  } catch (error) {
    if (!existedBefore) {
      rmSync(FRONTEND_PATH, { recursive: true, force: true })
    }
    throw error
  }
  writeFileSync(MARKER_FILE, `${FRONTEND_REF}\n`)
}

// A missing marker means the path was supplied by the user (FRONTEND_PATH) and
// its ref is their responsibility, so it is reused as-is.
function checkoutMatchesRef(): boolean {
  try {
    return readFileSync(MARKER_FILE, "utf-8").trim() === FRONTEND_REF
  } catch {
    return true
  }
}
