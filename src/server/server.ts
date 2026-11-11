import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  ServerCapabilities,
  TextDocumentSyncKind,
  Diagnostic,
  FileChangeType
} from "vscode-languageserver/node"
import { TextDocument } from "vscode-languageserver-textdocument"
import * as fs from "fs/promises"
import { getLanguageService } from "yaml-language-server"
import { HaConnection } from "../language-service/src/home-assistant/haConnection.js"
import { ConfigurationService } from "../language-service/src/configuration.js"
import { HomeAssistantConfiguration } from "../language-service/src/haConfig/haConfig.js"
import { HomeAssistantLanguageService } from "../language-service/src/haLanguageService.js"
import { SchemaServiceForIncludes } from "../language-service/src/schemas/schemaService.js"
import { IncludeDefinitionProvider } from "../language-service/src/definition/includes.js"
import { ScriptDefinitionProvider } from "../language-service/src/definition/scripts.js"
import { SecretsDefinitionProvider } from "../language-service/src/definition/secrets.js"
import { VsCodeFileAccessor } from "./fileAccessor.js"

const connection = createConnection(ProposedFeatures.all, undefined, undefined)

console.log = connection.console.log.bind(connection.console)
console.warn = connection.window.showWarningMessage.bind(connection.window)
console.error = connection.window.showErrorMessage.bind(connection.window)

const documents = new TextDocuments(TextDocument)
documents.listen(connection)

connection.onInitialize(async (params) => {
  connection.console.log(
    `[Home Assistant Language Server(${process.pid})] Started and initialize received`
  )

  // Check if initialization contains the token in custom data
  const haConfig = params.initializationOptions && params.initializationOptions["home-assistant"]

  if (haConfig) {
    // Extract token
    if (haConfig.longLivedAccessToken) {
      const token = haConfig.longLivedAccessToken
      console.log(`Token provided in initialization options (length: ${token.length})`)
      process.env.HASS_TOKEN = token // Set as environment variable for backup
    } else {
      console.log("No token provided in initialization options")
    }

    // Extract Home Assistant instance URL
    if (haConfig.hostUrl) {
      console.log(
        `Home Assistant instance URL provided in initialization options: ${haConfig.hostUrl}`
      )
      process.env.HASS_SERVER = haConfig.hostUrl
    } else {
      console.log("No Home Assistant instance URL provided in initialization options")
    }

    if (haConfig.devMockConnection) {
      console.log("Dev mock connection enabled via initialization options")
      process.env.HASS_DEV_MOCK = "1"
    }
  } else {
    console.log("No Home Assistant configuration in initialization options")
  }

  const configurationService = new ConfigurationService()
  const haConnection = new HaConnection(configurationService)
  const fileAccessor = new VsCodeFileAccessor(params.rootUri, documents)
  const haConfigInstance = new HomeAssistantConfiguration(fileAccessor)

  const definitionProviders = [
    new IncludeDefinitionProvider(fileAccessor),
    new ScriptDefinitionProvider(haConfigInstance),
    new SecretsDefinitionProvider(fileAccessor)
  ]

  const yamlLanguageService = getLanguageService({
    schemaRequestService: async () => "",
    workspaceContext: null,
    telemetry: undefined
  })

  const sendDiagnostics = (uri: string, diagnostics: Diagnostic[]) => {
    connection.sendDiagnostics({
      uri,
      diagnostics
    })
  }

  const sendDiscoveredFiles = async () => {
    try {
      const results = await Promise.allSettled(
        haConfigInstance.getAllFiles().map((fileInfo) => fs.realpath(fileInfo.filename))
      )
      // An !include may reference a file that does not exist yet; skip rejected entries.
      const files = results
        .filter(
          (result): result is PromiseFulfilledResult<string> => result.status === "fulfilled"
        )
        .map((result) => result.value)
      connection.sendNotification("ha_files_discovered", { files })
    } catch (e) {
      console.error(`Failed to send the discovered files to the client: ${e}`)
    }
  }

  const discoverFilesAndUpdateSchemas = async () => {
    try {
      console.log("Discovering files and updating schemas...")
      await haConfigInstance.discoverFiles()

      // Publish the discovered file list before applying schemas so the client can
      // associate documents even when schema application fails. Only publish after
      // discovery succeeds; publishing on a failed discovery would send an empty or
      // stale list and cause the client to revert files to the "yaml" language.
      await sendDiscoveredFiles()
    } catch (e) {
      console.error(`Unexpected error during file discovery: ${e}`)
    }

    try {
      await homeAssistantLanguageService.findAndApplySchemas()
      console.log("Files discovered and schemas updated successfully")
    } catch (e) {
      console.error(`Unexpected error during schema configuration: ${e}`)
    }
  }

  const homeAssistantLanguageService = new HomeAssistantLanguageService(
    yamlLanguageService,
    haConfigInstance,
    haConnection,
    definitionProviders,
    await SchemaServiceForIncludes.create(),
    sendDiagnostics,
    async () => {
      for (const d of documents.all()) {
        const diagnostics = await homeAssistantLanguageService.getDiagnostics(d)
        sendDiagnostics(d.uri, diagnostics)
      }
    },
    () => {
      void sendDiscoveredFiles()
    },
    configurationService
  )

  // Setup handlers to notify client about connection status
  haConnection.onConnectionEstablished = (info) => {
    console.log("Home Assistant connection established, notifying client")
    connection.sendNotification("ha_connected", info)
    // Re-validate open documents now that registry data is available
    void (async () => {
      for (const d of documents.all()) {
        try {
          const diagnostics = await homeAssistantLanguageService.getDiagnostics(d)
          sendDiagnostics(d.uri, diagnostics)
        } catch (error) {
          console.error(`Failed to refresh diagnostics for ${d.uri}: ${error}`)
        }
      }
    })()
  }

  haConnection.onConnectionFailed = (error) => {
    console.log("Home Assistant connection failed, notifying client")
    connection.sendNotification("ha_connection_error", { error: error || "Unknown error" })
  }

  if (configurationService.devMockConnection) {
    void haConnection.tryConnect()
  }

  documents.onDidChangeContent((e) => homeAssistantLanguageService.onDocumentChange(e.document))
  documents.onDidOpen((e) => homeAssistantLanguageService.onDocumentOpen(e.document))
  documents.onDidClose((e) => {
    // Remove closed documents from file collection to prevent memory leaks
    haConfigInstance.removeFile(e.document.uri)
  })

  let onDidSaveDebounce: NodeJS.Timeout
  documents.onDidSave((e) => {
    clearTimeout(onDidSaveDebounce)

    // Only rediscover files if the saved document is likely to contain includes
    // or is a root configuration file. This significantly improves performance
    // for large Home Assistant configurations.
    const { uri } = e.document
    const isRootConfigFile =
      uri.endsWith("configuration.yaml") ||
      uri.endsWith("ui-lovelace.yaml") ||
      uri.endsWith("automations.yaml")
    const isInBlueprintsFolder = uri.includes("/blueprints/") || uri.includes("\\blueprints\\")

    // Check if the document content contains include directives
    const hasIncludes = e.document
      .getText()
      .match(/!include(_dir_list|_dir_named|_dir_merge_list|_dir_merge_named)?/)

    // Only trigger rediscovery for files that could affect the schema
    if (isRootConfigFile || isInBlueprintsFolder || hasIncludes) {
      // Use a longer debounce timeout to reduce unnecessary rediscoveries
      // This helps when users save multiple files in quick succession
      onDidSaveDebounce = setTimeout(discoverFilesAndUpdateSchemas, 1000)
    }
  })

  // Refresh the discovered file set when YAML files are created or deleted, so
  // files added to (or removed from) an !include_dir are picked up without
  // requiring a save of the root configuration file.
  let onDidChangeWatchedFilesDebounce: NodeJS.Timeout
  connection.onDidChangeWatchedFiles((params) => {
    const isRelevantYamlEvent = params.changes.some((change) => {
      const isYaml = change.uri.endsWith(".yaml") || change.uri.endsWith(".yml")
      const isCreateOrDelete =
        change.type === FileChangeType.Created || change.type === FileChangeType.Deleted
      return isYaml && isCreateOrDelete
    })

    if (!isRelevantYamlEvent) {
      return
    }

    clearTimeout(onDidChangeWatchedFilesDebounce)
    onDidChangeWatchedFilesDebounce = setTimeout(discoverFilesAndUpdateSchemas, 1000)
  })

  connection.onDocumentSymbol((p) =>
    homeAssistantLanguageService.onDocumentSymbol(documents.get(p.textDocument.uri))
  )
  connection.onDocumentFormatting((p) =>
    homeAssistantLanguageService.onDocumentFormatting(documents.get(p.textDocument.uri), p.options)
  )
  connection.onCompletion((p) =>
    homeAssistantLanguageService.onCompletion(documents.get(p.textDocument.uri), p.position)
  )
  connection.onCompletionResolve((p) => homeAssistantLanguageService.onCompletionResolve(p))
  connection.onHover((p) =>
    homeAssistantLanguageService.onHover(documents.get(p.textDocument.uri), p.position)
  )
  connection.onDefinition((p) =>
    homeAssistantLanguageService.onDefinition(documents.get(p.textDocument.uri), p.position)
  )

  connection.onDidChangeConfiguration(async (config) => {
    console.log("Received configuration change from VS Code")

    // Check for token in incoming configuration before applying changes
    const haConfig = config.settings && config.settings["home-assistant"]
    if (haConfig) {
      if (haConfig.longLivedAccessToken) {
        const token = haConfig.longLivedAccessToken
        console.log(`Token received in configuration update (length: ${token.length})`)
      } else {
        console.log("No token in configuration update")
      }

      if (haConfig.hostUrl) {
        console.log(`Home Assistant instance URL in configuration update: ${haConfig.hostUrl}`)
      } else {
        console.log("No Home Assistant instance URL in configuration update")
      }
    } else {
      console.log("No Home Assistant configuration in update")
    }

    // Update the configuration service with the new settings
    configurationService.updateConfiguration(config)

    // Notify connection handler to update connection if needed
    await haConnection.notifyConfigUpdate()

    // Check configuration status after update
    if (!configurationService.isConfigured) {
      console.log("Configuration incomplete after update, sending no-config notification")
      connection.sendNotification("no-config")
    } else {
      console.log("Configuration is valid after update")
    }
  })

  connection.onRequest(
    "callService",
    (args: { domain: string; service: string; serviceData?: any }) => {
      void haConnection.callService(args.domain, args.service, args.serviceData)
    }
  )

  connection.onRequest("checkConfig", async (_) => {
    const result = await haConnection.callApi("post", "config/core/check_config")
    connection.sendNotification("configuration_check_completed", result)
  })
  connection.onRequest("getErrorLog", async (_) => {
    const result = await haConnection.callApi("get", "error_log")
    connection.sendNotification("get_error_log_completed", result)
  })
  connection.onRequest("renderTemplate", async (args: { template: string }) => {
    const timePrefix = `[${new Date().toLocaleTimeString()}] `
    let outputString = `${timePrefix}Rendering template:\n${args.template}\n\n`

    try {
      const result = await haConnection.callApi("post", "template", {
        template: args.template,
        strict: true
      })

      // Check if the result is an error object
      if (result && typeof result === "object") {
        if (result.error) {
          // Direct error message
          outputString += `Error:\n${result.error}`
        } else if (result.message) {
          // Error message in message field
          outputString += `Error:\n${result.message}`
        } else if (Object.keys(result).length > 0) {
          // For other types of error objects, get a formatted representation
          const errorMessage = JSON.stringify(result, null, 2)
          outputString += `Error:\n${errorMessage}`
        } else {
          // Just a string representation as fallback
          outputString += `Result:\n${result}`
        }
      } else {
        outputString += `Result:\n${result}`
      }
    } catch (error) {
      // Handle API errors or exceptions
      let errorMessage = "Unknown error occurred"

      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === "object" && error !== null) {
        try {
          // Try to convert error object to a readable string
          errorMessage = JSON.stringify(error, null, 2)
        } catch {
          // If JSON conversion fails, try to extract properties
          if ("message" in error) {
            errorMessage = error.message
          } else if ("toString" in error && typeof error.toString === "function") {
            errorMessage = error.toString()
          }
        }
      } else if (typeof error === "string") {
        errorMessage = error
      }

      outputString += `Error:\n${errorMessage}`
    }

    connection.sendNotification("render_template_completed", outputString)
  })

  // fire and forget
  setTimeout(discoverFilesAndUpdateSchemas, 0)

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: { triggerCharacters: [" "], resolveProvider: true },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      definitionProvider: true
    } as ServerCapabilities
  }
})

connection.listen()
