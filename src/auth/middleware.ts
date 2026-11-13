import { MessageSignature } from "vscode-jsonrpc"
import {
  ConfigurationRequest,
  DidChangeConfigurationNotification,
  DidChangeConfigurationParams,
  LSPAny
} from "vscode-languageserver-protocol"
import { Middleware } from "vscode-languageclient"
import * as vscode from "vscode"
import { AuthManager } from "./manager.js"

/**
 * Language client middleware that injects the Home Assistant token and instance
 * URL (stored in SecretStorage) into the configuration exchanged with the
 * language server. The token and URL are intentionally kept out of
 * `vscode.workspace.getConfiguration`, so the regular configuration sync never
 * carries them; this middleware adds them back on the wire.
 */
export class AuthMiddleware {
  private static outputChannel: vscode.OutputChannel

  private constructor(private readonly context: vscode.ExtensionContext) {}

  private static getOutputChannel(): vscode.OutputChannel {
    if (!AuthMiddleware.outputChannel) {
      AuthMiddleware.outputChannel = vscode.window.createOutputChannel("Home Assistant Auth")
    }
    return AuthMiddleware.outputChannel
  }

  private static log(message: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").replace(/\..+/, "")
    const formattedMessage = `[${timestamp}] ${message}`
    console.log(formattedMessage)
    AuthMiddleware.getOutputChannel().appendLine(formattedMessage)
  }

  /**
   * Build the middleware to pass via `LanguageClientOptions.middleware`.
   */
  public static create(context: vscode.ExtensionContext): Middleware {
    const middleware = new AuthMiddleware(context)
    return {
      workspace: {
        configuration: middleware.handleConfigurationRequest
      },
      sendNotification: middleware.handleSendNotification
    }
  }

  /**
   * Pull model: inject credentials into the result of a `workspace/configuration`
   * request issued by the server.
   */
  private handleConfigurationRequest: ConfigurationRequest.MiddlewareSignature = async (
    params,
    token,
    next
  ) => {
    AuthMiddleware.log("Handling configuration request")
    const result = await next(params, token)
    if (Array.isArray(result)) {
      await this.injectCredentialsIntoItems(result)
    }
    return result
  }

  /**
   * Push model: inject credentials into outgoing `workspace/didChangeConfiguration`
   * notifications before they are delivered to the server.
   */
  private handleSendNotification: Middleware["sendNotification"] = async (type, next, params) => {
    if (AuthMiddleware.matches(type, DidChangeConfigurationNotification.type)) {
      AuthMiddleware.log("Handling configuration notification")
      await this.injectCredentialsIntoNotification(params as DidChangeConfigurationParams)
    }
    return next(type, params)
  }

  private async injectCredentialsIntoItems(items: LSPAny[]): Promise<void> {
    for (const item of items) {
      if (!item || typeof item !== "object" || !("home-assistant" in item)) {
        continue
      }

      const [token, url] = await Promise.all([
        AuthManager.getToken(this.context),
        AuthManager.getUrl(this.context)
      ])

      if (!item["home-assistant"]) {
        item["home-assistant"] = {}
      }

      const haSettings = item["home-assistant"] as Record<string, LSPAny>
      if (token) {
        AuthMiddleware.log(`Injecting token (length: ${token.length}) into configuration`)
        haSettings.longLivedAccessToken = token
      } else {
        AuthMiddleware.log("WARNING: No token found for configuration item")
      }

      if (url) {
        AuthMiddleware.log(`Injecting URL (${url}) into configuration`)
        haSettings.hostUrl = url
      }
    }
  }

  private async injectCredentialsIntoNotification(
    params: DidChangeConfigurationParams
  ): Promise<void> {
    if (!params.settings) {
      return
    }

    const settings = params.settings as Record<string, LSPAny>
    if (!settings["home-assistant"]) {
      settings["home-assistant"] = {}
      AuthMiddleware.log("Created missing home-assistant settings object in notification")
    }

    const haSettings = settings["home-assistant"] as Record<string, LSPAny>
    const [token, url] = await Promise.all([
      AuthManager.getToken(this.context),
      AuthManager.getUrl(this.context)
    ])

    if (token) {
      AuthMiddleware.log(`Injecting token (length: ${token.length}) into notification`)
      haSettings.longLivedAccessToken = token
    } else {
      AuthMiddleware.log("WARNING: No token found for notification")
    }

    if (url) {
      AuthMiddleware.log(`Injecting URL (${url}) into notification`)
      haSettings.hostUrl = url
    }
  }

  private static matches(type: string | MessageSignature, expected: MessageSignature): boolean {
    return (typeof type === "string" ? type : type.method) === expected.method
  }
}
