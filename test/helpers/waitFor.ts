import * as vscode from "vscode"

export interface WaitOptions {
  timeoutMs?: number
  intervalMs?: number
  settleMs?: number
  message?: string
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeoutMs = 8000, intervalMs = 100, message = "condition" } = options
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }
    await delay(intervalMs)
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${message}`)
}

export async function waitForValue<T>(
  getValue: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  options: WaitOptions = {}
): Promise<T> {
  const { timeoutMs = 8000, intervalMs = 100, message = "condition" } = options
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = await getValue()
    if (predicate(value)) {
      return value
    }
    await delay(intervalMs)
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${message}`)
}

function diagnosticSignature(diagnostics: vscode.Diagnostic[]): string {
  return diagnostics
    .map((d) => `${d.range.start.line}:${d.range.start.character}:${d.message}`)
    .join("|")
}

export async function waitForDiagnostics(
  document: vscode.TextDocument,
  predicate: (diagnostics: vscode.Diagnostic[]) => boolean,
  options: WaitOptions = {}
): Promise<vscode.Diagnostic[]> {
  const { timeoutMs = 8000, intervalMs = 100, settleMs = 0, message = "diagnostics" } = options
  const deadline = Date.now() + timeoutMs
  let diagnostics: vscode.Diagnostic[]
  let lastSignature: string | undefined
  let stableSince = Date.now()

  while (Date.now() < deadline) {
    diagnostics = vscode.languages.getDiagnostics(document.uri)
    const currentSignature = diagnosticSignature(diagnostics)
    if (currentSignature !== lastSignature) {
      lastSignature = currentSignature
      stableSince = Date.now()
    }

    if (predicate(diagnostics) && Date.now() - stableSince >= settleMs) {
      return diagnostics
    }

    await delay(intervalMs)
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${message}`)
}
