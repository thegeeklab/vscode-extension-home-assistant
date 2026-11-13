import { MessageConnection } from "vscode-jsonrpc"
import {
  ConfigurationRequest,
  DidChangeConfigurationNotification,
  DidChangeConfigurationParams
} from "vscode-languageserver-protocol"
import * as vscode from "vscode"
import { AuthManager } from "./manager.js"

/**
 * Middleware to intercept configuration requests and inject token and URL from SecretStorage
 */
export class AuthMiddleware {
  private static outputChannel: vscode.OutputChannel
  private constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get or create debug output channel
   */
  private static getOutputChannel(): vscode.OutputChannel {
    if (!AuthMiddleware.outputChannel) {
      AuthMiddleware.outputChannel = vscode.window.createOutputChannel("Home Assistant Auth")
    }
    return AuthMiddleware.outputChannel
  }

  /**
   * Log a debug message with timestamp
   */
  private static log(message: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").replace(/\..+/, "")
    const formattedMessage = `[${timestamp}] ${message}`
    console.log(formattedMessage)
    AuthMiddleware.getOutputChannel().appendLine(formattedMessage)
  }

  /**
   * Install the auth middleware on a language client connection
   * @param context Extension context
   * @param connection The client's message connection
   */
  public static async install(
    context: vscode.ExtensionContext,
    connection: MessageConnection
  ): Promise<void> {
    const middleware = new AuthMiddleware(context)

    AuthMiddleware.log("Installing auth middleware on connection")

    // Override the original request handler
    const originalSendRequest = connection.sendRequest
    connection.sendRequest = async function (type: any, ...params: any[]): Promise<any> {
      const typeStr = typeof type === "string" ? type : type?.method || String(type)
      AuthMiddleware.log(`Sending request type: ${typeStr}`)

      if (type === ConfigurationRequest.type) {
        return middleware.handleConfigurationRequest(
          originalSendRequest.bind(connection),
          type,
          ...params
        )
      }

      return originalSendRequest.apply(connection, [type, ...params])
    }

    // Override the original notification handler
    const originalSendNotification = connection.sendNotification
    connection.sendNotification = async function (type: any, ...params: any[]): Promise<void> {
      const typeStr = typeof type === "string" ? type : type?.method || String(type)
      AuthMiddleware.log(`Sending notification type: ${typeStr}`)

      if (type === DidChangeConfigurationNotification.type) {
        return middleware.handleDidChangeConfigurationNotification(
          originalSendNotification.bind(connection),
          type,
          ...params
        )
      }

      return originalSendNotification.apply(connection, [type, ...params])
    }

    AuthMiddleware.log("Auth middleware successfully installed")

    // Immediately send configuration update with the token and URL
    await middleware.sendInitialConfiguration(connection)
  }

  /**
   * Send initial configuration with token and URL to ensure it's available immediately
   */
  private async sendInitialConfiguration(connection: MessageConnection): Promise<void> {
    try {
      AuthMiddleware.log("Sending initial configuration with token and URL")

      // AuthManager resolves token (environment > SecretStorage) and URL (environment > workspace settings > SecretStorage)
      const token = await AuthManager.getToken(this.context)
      const hostUrl = await AuthManager.getUrl(this.context)

      if (!token) {
        AuthMiddleware.log("No token available for initial configuration")
        return
      }

      if (!hostUrl) {
        AuthMiddleware.log("No server URL available for initial configuration")
        return
      }

      const config = vscode.workspace.getConfiguration("home-assistant")

      // Create configuration object
      const settings = {
        "home-assistant": {
          longLivedAccessToken: token,
          hostUrl,
          ignoreCertificates: config.get<boolean>("ignoreCertificates") || false,
          // Adding a timestamp to ensure the configuration is seen as "new" by the server
          configTimestamp: Date.now()
        }
      }

      // Send configuration notification
      AuthMiddleware.log(
        `Sending initial configuration with token (length: ${token.length}) and URL (${hostUrl})`
      )

      // Create notification params
      const params: DidChangeConfigurationParams = {
        settings
      }

      // Send notification
      await connection.sendNotification(DidChangeConfigurationNotification.type, params)
      AuthMiddleware.log("Initial configuration with token and URL sent")
    } catch (error) {
      AuthMiddleware.log(`Error sending initial configuration: ${error.message}`)
    }
  }

  /**
   * Handle configuration request and inject token and URL from SecretStorage
   */
  private async handleConfigurationRequest(
    originalSendRequest: (type: any, ...params: any[]) => Promise<any>,
    type: any,
    ...params: any[]
  ): Promise<any> {
    AuthMiddleware.log("Handling configuration request")
    const result = await originalSendRequest(type, ...params)

    if (Array.isArray(result)) {
      for (const item of result) {
        if (item && typeof item === "object" && "home-assistant" in item) {
          const token = await AuthManager.getToken(this.context)
          const url = await AuthManager.getUrl(this.context)

          if (!item["home-assistant"]) {
            item["home-assistant"] = {}
          }

          if (token) {
            AuthMiddleware.log(`Injecting token (length: ${token.length}) into configuration`)
            item["home-assistant"].longLivedAccessToken = token
          } else {
            AuthMiddleware.log("WARNING: No token found for configuration item")
          }

          if (url) {
            AuthMiddleware.log(`Injecting URL (${url}) into configuration`)
            item["home-assistant"].hostUrl = url
          }
        }
      }
    }
    return result
  }

  /**
   * Handle configuration notification and inject token and URL from SecretStorage
   */
  private async handleDidChangeConfigurationNotification(
    originalSendNotification: (type: any, ...params: any[]) => Promise<void>,
    type: any,
    ...params: any[]
  ): Promise<void> {
    AuthMiddleware.log("Handling configuration notification")

    if (params.length > 0) {
      const notification = params[0] as DidChangeConfigurationParams
      if (notification && notification.settings) {
        // Ensure the home-assistant settings object exists
        if (!notification.settings["home-assistant"]) {
          notification.settings["home-assistant"] = {}
          AuthMiddleware.log("Created missing home-assistant settings object in notification")
        }

        // AuthManager resolves token (environment > SecretStorage) and URL (environment > workspace settings > SecretStorage)
        const token = await AuthManager.getToken(this.context)
        const url = await AuthManager.getUrl(this.context)

        if (token) {
          AuthMiddleware.log(`Injecting token (length: ${token.length}) into notification`)
          notification.settings["home-assistant"].longLivedAccessToken = token
        } else {
          AuthMiddleware.log("WARNING: No token found for notification")
        }

        if (url) {
          AuthMiddleware.log(`Injecting URL (${url}) into notification`)
          notification.settings["home-assistant"].hostUrl = url
        }
      }
    }

    return originalSendNotification(type, ...params)
  }
}
