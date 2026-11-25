import * as assert from "assert"
import { Position } from "vscode-languageserver-protocol"

export function findPosition(content: string, needle: string): Position {
  const lines = content.split("\n")
  const lineIndex = lines.findIndex((line) => line.includes(needle))
  assert.ok(lineIndex >= 0, `line containing "${needle}" not found`)
  const character = lines[lineIndex].indexOf(needle) + needle.length
  return Position.create(lineIndex, character)
}
