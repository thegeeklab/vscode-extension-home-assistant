// home-assistant-js-websocket's "exports" map has no "types" condition, so
// exports-aware module resolution finds dist/haws.cjs without declarations.
// Point the package root at its bundled type declarations.
declare module "home-assistant-js-websocket" {
  export * from "home-assistant-js-websocket/dist/index.js"
}
