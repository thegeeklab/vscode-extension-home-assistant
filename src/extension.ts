import * as path from "path"
import * as fs from "fs/promises"
import * as vscode from "vscode"
import { LanguageClientOptions } from "vscode-languageclient"
import { LanguageClient, ServerOptions, TransportKind } from "vscode-languageclient/node"
import { AuthManager } from "./auth/manager.js"
import { AuthMiddleware } from "./auth/middleware.js"
import { manageAuth, testConnection } from "./auth/commands.js"
import { debugAuthSettings } from "./auth/debug.js"
import { repairAuthConfiguration } from "./auth/repair.js"
import { HomeAssistantStatusBar } from "./status/statusBar.js"
import { registerReloadCommands } from "./commands/reloadCommands.js"

const documentSelector = [
  { language: "home-assistant", scheme: "file" },
  { language: "home-assistant", scheme: "untitled" }
]

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("Home Assistant Extension has been activated!")

  // Initialize status bar
  const statusBar = new HomeAssistantStatusBar(context)
  context.subscriptions.push(statusBar)

  // Attempt to migrate token from settings to SecretStorage if needed
  try {
    const migratedToken = await AuthManager.migrateTokenFromSettings(context)
    if (migratedToken) {
      console.log("Successfully migrated token from settings to SecretStorage")
    }

    // Attempt to migrate Home Assistant instance URL from settings to SecretStorage if needed
    const migratedUrl = await AuthManager.migrateUrlFromSettings(context)
    if (migratedUrl) {
      console.log(
        "Successfully migrated Home Assistant instance URL from settings to SecretStorage"
      )
    }
  } catch (error) {
    console.error("Failed to migrate credentials:", error)
  }

  const serverModule = path.join(context.extensionPath, "out", "src", "server", "server.js")

  const debugOptions = { execArgv: ["--nolazy", "--inspect=6003"] }

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  }

  // Create file system watcher and register for disposal to prevent memory leaks
  const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.?(e)y?(a)ml")
  context.subscriptions.push(fileWatcher)

  // Pre-fetch credentials before starting the client. The language client evaluates
  // initializationOptions synchronously (an async function would be passed without
  // being awaited and serialized to {}), so the token and URL must be resolved up front.
  let initialToken = ""
  let initialUrl = ""
  try {
    const [token, url] = await Promise.all([
      AuthManager.getToken(context),
      AuthManager.getUrl(context)
    ])
    initialToken = token || ""
    initialUrl = url || ""
  } catch (error) {
    console.error("Failed to pre-fetch Home Assistant credentials:", error)
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector,
    middleware: AuthMiddleware.create(context),
    synchronize: {
      configurationSection: "home-assistant",
      fileEvents: fileWatcher
    },
    initializationOptions: () => {
      const config = vscode.workspace.getConfiguration("home-assistant")

      console.log("Setting up initialization options for Home Assistant language server")
      console.log(`Token available: ${initialToken ? "Yes" : "No"}`)
      console.log(`Home Assistant instance URL available: ${initialUrl ? "Yes" : "No"}`)

      // Use SecretStorage values first, then fallback to settings
      return {
        "home-assistant": {
          longLivedAccessToken: initialToken,
          hostUrl: initialUrl || config.get<string>("hostUrl") || "",
          ignoreCertificates: !!config.get<boolean>("ignoreCertificates"),
          devMockConnection: !!config.get<boolean>("devMockConnection")
        }
      }
    }
  }

  const client = new LanguageClient(
    "home-assistant",
    "Home Assistant Language Server",
    serverOptions,
    clientOptions
  )

  // is this really needed?
  vscode.languages.setLanguageConfiguration("home-assistant", {
    wordPattern: /("(?:[^\\"]*(?:\\.)?)*"?)|[^\s{}[\],:]+/
  })

  // Register the file association handler before starting the client. The server
  // emits "ha_files_discovered" shortly after initialize, and registering the
  // handler after client.start() (plus auth/config setup) would miss that
  // notification entirely.
  registerHomeAssistantFileAssociation(context, client)

  try {
    // Start the client
    await client.start()
    context.subscriptions.push({ dispose: () => client.stop() })
  } catch (error: unknown) {
    console.error("Failed to start the client:", error)
    if (error instanceof Error) {
      void vscode.window.showErrorMessage(
        `Failed to start Home Assistant Language Server: ${error.message}`
      )
    }
  }

  // Register all notification handlers and add them to subscriptions to prevent memory leaks
  context.subscriptions.push(
    client.onNotification("no-config", async (): Promise<void> => {
      const config = vscode.workspace.getConfiguration("home-assistant")
      if (config.get<boolean>("devMockConnection")) {
        console.log("'no-config' notification ignored because devMockConnection is enabled.")
        return
      }
      if (await AuthManager.hasCredentials(context)) {
        console.log(
          "'no-config' notification received from server, but credentials (token and/or Home Assistant instance URL) found in SecretStorage. Ignoring pop-up."
        )
        return
      }
      const manageAuthCommand = "Manage Authentication"
      const optionClicked = await vscode.window.showInformationMessage(
        "No Home Assistant authentication (token and/or Home Assistant instance URL) found. Please set authentication.",
        manageAuthCommand
      )
      if (optionClicked === manageAuthCommand) {
        await vscode.commands.executeCommand("home-assistant.manageAuth")
      }

      // Update status bar to show disconnected state
      statusBar.checkConnectionStatus()
    })
  )

  // Add handler for connection established event
  context.subscriptions.push(
    client.onNotification(
      "ha_connected",
      async (data: { name?: string; version?: string }): Promise<void> => {
        console.log("Home Assistant connection established notification received")
        // Get instance information if available
        const instanceInfo = {
          name: data.name || "Home Assistant",
          version: data.version
        }
        // Update status bar with connection information
        statusBar.setConnectionStatus("connected", instanceInfo)
      }
    )
  )

  // Add handler for connection error event
  context.subscriptions.push(
    client.onNotification(
      "ha_connection_error",
      async (data: { error?: string }): Promise<void> => {
        console.log(
          `Home Assistant connection error notification received: ${data.error || "Unknown error"}`
        )
        // Update status bar to show error state
        statusBar.setConnectionStatus("error")
      }
    )
  )

  context.subscriptions.push(
    client.onNotification("configuration_check_completed", async (result) => {
      if (result && result.result === "valid") {
        await vscode.window.showInformationMessage(
          "Home Assistant Configuration Checked, result: 'Valid'!"
        )
      } else {
        await vscode.window.showErrorMessage(
          `Home Assistant Configuration check resulted in an error: ${result.error}`
        )
      }
    })
  )

  let haOutputChannel: vscode.OutputChannel
  context.subscriptions.push(
    client.onNotification("get_error_log_completed", (result) => {
      if (!haOutputChannel) {
        haOutputChannel = vscode.window.createOutputChannel("Home Assistant Error Log")
        // Register the output channel for disposal to prevent memory leaks
        context.subscriptions.push(haOutputChannel)
      }
      haOutputChannel.appendLine(result)
      haOutputChannel.show()
    })
  )

  let haTemplateRendererChannel: vscode.OutputChannel
  context.subscriptions.push(
    client.onNotification("render_template_completed", (result) => {
      if (!haTemplateRendererChannel) {
        haTemplateRendererChannel = vscode.window.createOutputChannel(
          "Home Assistant Template Renderer"
        )
        // Register the output channel for disposal to prevent memory leaks
        context.subscriptions.push(haTemplateRendererChannel)
      }
      haTemplateRendererChannel.clear()
      haTemplateRendererChannel.appendLine(result)
      haTemplateRendererChannel.show()
    })
  )

  const commandMappings = [
    new CommandMappings("home-assistant.reloadAll", "homeassistant", "reload_all"),
    new CommandMappings("home-assistant.scriptReload", "script", "reload"),
    new CommandMappings("home-assistant.groupReload", "group", "reload"),
    new CommandMappings(
      "home-assistant.homeassistantReloadCoreConfig",
      "homeassistant",
      "reload_core_config"
    ),
    new CommandMappings("home-assistant.homeassistantRestart", "homeassistant", "restart"),
    new CommandMappings("home-assistant.automationReload", "automation", "reload"),
    new CommandMappings("home-assistant.conversationReload", "conversation", "reload"),
    new CommandMappings("home-assistant.sceneReload", "scene", "reload"),
    new CommandMappings("home-assistant.themeReload", "frontend", "reload_themes"),
    new CommandMappings("home-assistant.homekitReload", "homekit", "reload"),
    new CommandMappings("home-assistant.filesizeReload", "filesize", "reload"),
    new CommandMappings("home-assistant.minMaxReload", "min_max", "reload"),
    new CommandMappings("home-assistant.genericThermostatReload", "generic_thermostat", "reload"),
    new CommandMappings("home-assistant.genericCameraReload", "generic", "reload"),
    new CommandMappings("home-assistant.pingReload", "ping", "reload"),
    new CommandMappings("home-assistant.trendReload", "trend", "reload"),
    new CommandMappings("home-assistant.historyStatsReload", "history_stats", "reload"),
    new CommandMappings("home-assistant.universalReload", "universal", "reload"),
    new CommandMappings("home-assistant.statisticsReload", "statistics", "reload"),
    new CommandMappings("home-assistant.filterReload", "filter", "reload"),
    new CommandMappings("home-assistant.restReload", "rest", "reload"),
    new CommandMappings("home-assistant.commandLineReload", "command_line", "reload"),
    new CommandMappings("home-assistant.bayesianReload", "bayesian", "reload"),
    new CommandMappings("home-assistant.telegramReload", "telegram", "reload"),
    new CommandMappings("home-assistant.smtpReload", "smtp", "reload"),
    new CommandMappings("home-assistant.mqttReload", "mqtt", "reload"),
    new CommandMappings("home-assistant.rpioGpioReload", "rpi_gpio", "reload"),
    new CommandMappings("home-assistant.knxReload", "knx", "reload"),
    new CommandMappings("home-assistant.templateReload", "template", "reload"),
    new CommandMappings(
      "home-assistant.customTemplatesReload",
      "homeassistant",
      "reload_custom_templates"
    ),
    new CommandMappings("home-assistant.hassioAddonRestartGitPull", "hassio", "addon_restart", {
      addon: "core_git_pull"
    }),
    new CommandMappings("home-assistant.hassioHostReboot", "hassio", "host_reboot")
  ]

  // Register all reload commands from the reloadCommands module
  registerReloadCommands(context, commandMappings, client)

  // Register restart and reboot commands
  const restartCommands = commandMappings.filter((mapping) => {
    const commandId = mapping.commandId.toLowerCase()
    return commandId.includes("restart") || commandId.includes("reboot")
  })

  restartCommands.forEach((mapping) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(mapping.commandId, async (_) => {
        await client.sendRequest("callService", {
          domain: mapping.domain,
          service: mapping.service,
          serviceData: mapping.serviceData
        })
        await vscode.window.showInformationMessage(
          `Home Assistant service ${mapping.domain}.${mapping.service} called!`
        )
      })
    )
  })

  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.homeassistantCheckConfig", async () => {
      await client.sendRequest("checkConfig")
    })
  )
  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.getErrorLog", async () => {
      await client.sendRequest("getErrorLog")
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.renderTemplate", async () => {
      const editor = vscode.window.activeTextEditor
      const selectedText = editor.document.getText(editor.selection)
      await client.sendRequest("renderTemplate", { template: selectedText })
    })
  )

  // Register command to open Home Assistant in browser
  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.openInBrowser", async () => {
      await statusBar.openInBrowser()
    })
  )

  // Register the token management command with status bar update
  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.manageAuth", async () => {
      await manageAuth(context)
      // Update status bar after auth changes
      statusBar.checkConnectionStatus()
    })
  )

  // Register the debug token command
  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.debugAuth", () => debugAuthSettings(context))
  )

  // Register the token repair command with status bar update
  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.repairAuth", async () => {
      await repairAuthConfiguration(context)
      // Update status bar after repair
      statusBar.checkConnectionStatus()
    })
  )

  // Register the test connection command with status bar update
  context.subscriptions.push(
    vscode.commands.registerCommand("home-assistant.testConnection", async () => {
      await testConnection(context)
      // Update status bar after connection test
      statusBar.checkConnectionStatus()
    })
  )

  // Listen for configuration changes that might affect the connection
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      const haConfigChanged = event.affectsConfiguration("home-assistant")

      if (haConfigChanged) {
        console.log("Home Assistant configuration changed, updating status bar")
        statusBar.checkConnectionStatus()
      }
    })
  )

  // Initial check for credentials
  if (!(await AuthManager.hasCredentials(context))) {
    // Delay the message slightly to avoid race conditions with other startup messages
    setTimeout(() => {
      const manageAuthCommandText = "Manage Authentication"
      vscode.window
        .showInformationMessage(
          "Welcome to the Home Assistant VS Code Extension! To get started, please set your Home Assistant token and instance URL.",
          manageAuthCommandText
        )
        .then((selection) => {
          if (selection === manageAuthCommandText) {
            vscode.commands.executeCommand("home-assistant.manageAuth")
          }
        })
    }, 1000)
  } else {
    // Check status bar connection if we have credentials
    statusBar.checkConnectionStatus()
  }
}

export async function deactivate(): Promise<void> {}

export class CommandMappings {
  constructor(
    public commandId: string,
    public domain: string,
    public service: string,
    public serviceData?: {
      [key: string]: any
    }
  ) {}
}

const YAML_FILE_EXTENSIONS = [".yaml", ".yml"]

/**
 * Associates the YAML files the server reports as part of the Home Assistant
 * configuration with the home-assistant language. The server determines the exact
 * file set by walking the !include graph from configuration.yaml, so unrelated
 * repo-level YAML (e.g. CI config) is never associated. The association is applied
 * in memory only and never written to settings.json.
 */
function registerHomeAssistantFileAssociation(
  context: vscode.ExtensionContext,
  client: LanguageClient
): void {
  const config = vscode.workspace.getConfiguration("home-assistant")
  if (config.get<boolean>("disableAutomaticFileAssociation", false)) {
    console.log(
      "Automatic file association is disabled by user setting - skipping file associations"
    )
    return
  }

  const homeAssistantFiles = new Set<string>()
  let filesDiscovered = false

  const syncDocument = async (document: vscode.TextDocument): Promise<void> => {
    if (document.uri.scheme !== "file") {
      return
    }

    const filePath = document.uri.fsPath
    const lowerFilePath = filePath.toLowerCase()
    if (!YAML_FILE_EXTENSIONS.some((extension) => lowerFilePath.endsWith(extension))) {
      return
    }

    const targetLanguage = (await isHomeAssistantFile(filePath, homeAssistantFiles))
      ? "home-assistant"
      : "yaml"

    if (document.languageId === targetLanguage) {
      return
    }

    // Do not revert a file away from home-assistant before the server has reported the
    // discovered file set; an empty set would otherwise revert every YAML file.
    if (targetLanguage === "yaml" && !filesDiscovered) {
      return
    }

    try {
      await vscode.languages.setTextDocumentLanguage(document, targetLanguage)
    } catch (error) {
      console.error(`Failed to set language for ${filePath}: ${error}`)
    }
  }

  const syncOpenDocuments = async (): Promise<void> => {
    for (const document of vscode.workspace.textDocuments) {
      await syncDocument(document)
    }
  }

  // Sync documents opened afterwards (associating config files and reverting any
  // YAML file that is not part of the configuration, e.g. from a stale association).
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      void syncDocument(document)
    })
  )

  // The server publishes the discovered Home Assistant files on initial discovery and
  // whenever the include graph changes. Sync open documents each time.
  context.subscriptions.push(
    client.onNotification("ha_files_discovered", (data: { files?: string[] }) => {
      homeAssistantFiles.clear()
      for (const file of data.files ?? []) {
        homeAssistantFiles.add(file)
      }
      filesDiscovered = true
      void syncOpenDocuments()
    })
  )
}

async function isHomeAssistantFile(
  filePath: string,
  homeAssistantFiles: Set<string>
): Promise<boolean> {
  if (homeAssistantFiles.has(filePath)) {
    return true
  }

  try {
    return homeAssistantFiles.has(await fs.realpath(filePath))
  } catch {
    return false
  }
}
