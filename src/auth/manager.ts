import * as vscode from "vscode"

/**
 * AuthManager class to handle Home Assistant tokens and Home Assistant instance URL securely using VS Code SecretStorage
 */
export class AuthManager {
  public static readonly TOKEN_KEY = "home-assistant.token"
  public static readonly URL_KEY = "home-assistant.url"

  /**
   * Get the stored token with priority: environment > SecretStorage.
   * Tokens are secrets and must not be read from workspace/folder settings,
   * which are commonly committed to version control.
   * @param context Extension context
   * @returns The stored token or undefined if not found
   */
  public static async getToken(context: vscode.ExtensionContext): Promise<string | undefined> {
    // Priority 1: environment variables (set by the Home Assistant Supervisor add-on)
    const envToken = process.env.HASS_TOKEN || process.env.SUPERVISOR_TOKEN
    if (envToken) {
      return envToken
    }

    // Priority 2: SecretStorage (global)
    return context.secrets.get(AuthManager.TOKEN_KEY)
  }

  /**
   * Store a token in SecretStorage
   * @param context Extension context
   * @param token Token to store
   */
  public static async storeToken(context: vscode.ExtensionContext, token: string): Promise<void> {
    await context.secrets.store(AuthManager.TOKEN_KEY, token)
  }

  /**
   * Delete the stored token from SecretStorage
   * @param context Extension context
   */
  public static async deleteToken(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(AuthManager.TOKEN_KEY)
  }

  /**
   * Get the stored URL with priority: environment > workspace settings > SecretStorage
   * @param context Extension context
   * @returns The stored URL or undefined if not found
   */
  public static async getUrl(context: vscode.ExtensionContext): Promise<string | undefined> {
    // Priority 1: environment variables
    const envUrl =
      process.env.HASS_SERVER ||
      (process.env.SUPERVISOR_TOKEN ? "http://supervisor/core" : undefined)
    if (envUrl) {
      return envUrl
    }

    // Priority 2: workspace/folder settings (per-project credentials)
    const config = vscode.workspace.getConfiguration("home-assistant")
    const inspection = config.inspect<string>("hostUrl")
    const workspaceUrl = inspection?.workspaceFolderValue || inspection?.workspaceValue
    if (workspaceUrl) {
      return workspaceUrl
    }

    // Priority 3: SecretStorage (global)
    return context.secrets.get(AuthManager.URL_KEY)
  }

  /**
   * Store a URL in SecretStorage
   * @param context Extension context
   * @param url URL to store
   */
  public static async storeUrl(context: vscode.ExtensionContext, url: string): Promise<void> {
    await context.secrets.store(AuthManager.URL_KEY, url)
  }

  /**
   * Delete the stored URL from SecretStorage
   * @param context Extension context
   */
  public static async deleteUrl(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(AuthManager.URL_KEY)
  }

  /**
   * Check if both token and URL are stored in SecretStorage or environment variables.
   * @param context Extension context
   * @returns True if both token and URL are found, false otherwise.
   */
  public static async hasCredentials(context: vscode.ExtensionContext): Promise<boolean> {
    const token = await AuthManager.getToken(context)
    const url = await AuthManager.getUrl(context)
    return !!token && !!url
  }

  /**
   * Migrate token from global settings.json to SecretStorage.
   * @param context Extension context
   * @returns true if a token was migrated, false otherwise
   */
  public static async migrateTokenFromSettings(
    context: vscode.ExtensionContext
  ): Promise<boolean> {
    const config = vscode.workspace.getConfiguration("home-assistant")
    const inspection = config.inspect<string>("longLivedAccessToken")
    const token = inspection?.globalValue

    // If there's no token in global settings, nothing to migrate
    if (!token) {
      return false
    }

    try {
      // Store in SecretStorage
      await AuthManager.storeToken(context, token)

      // Clear from global settings only
      await config.update("longLivedAccessToken", undefined, vscode.ConfigurationTarget.Global)

      // Inform user
      vscode.window.showInformationMessage(
        "Your Home Assistant access token has been securely migrated to VS Code's SecretStorage. It is no longer stored in your global settings.json file."
      )

      return true
    } catch (error) {
      console.error("Failed to migrate token to SecretStorage:", error)
      return false
    }
  }

  /**
   * Migrate Home Assistant instance URL from global settings.json to SecretStorage.
   * Workspace/folder settings are intentionally left in place.
   * @param context Extension context
   * @returns true if a URL was migrated, false otherwise
   */
  public static async migrateUrlFromSettings(context: vscode.ExtensionContext): Promise<boolean> {
    const config = vscode.workspace.getConfiguration("home-assistant")
    const inspection = config.inspect<string>("hostUrl")
    const url = inspection?.globalValue

    // If there's no URL in global settings, nothing to migrate
    if (!url) {
      return false
    }

    try {
      // Store in SecretStorage
      await AuthManager.storeUrl(context, url)

      // Clear from global settings only
      await config.update("hostUrl", undefined, vscode.ConfigurationTarget.Global)

      // Inform user
      vscode.window.showInformationMessage(
        "Your Home Assistant instance URL has been securely migrated to VS Code's SecretStorage. It is no longer stored in your global settings.json file."
      )

      return true
    } catch (error) {
      console.error("Failed to migrate URL to SecretStorage:", error)
      return false
    }
  }

  /**
   * Get token UI helper that uses the priority: environment > SecretStorage.
   * Also validates the Home Assistant instance URL is set.
   * @param context Extension context
   * @returns The token or undefined if not found
   */
  public static async getTokenWithUI(
    context: vscode.ExtensionContext
  ): Promise<string | undefined> {
    // Get URL with priority: environment > workspace settings > SecretStorage
    let hostUrl = await AuthManager.getUrl(context)

    // If no URL from any source, migrate global settings then re-check
    if (!hostUrl) {
      const config = vscode.workspace.getConfiguration("home-assistant")
      const inspection = config.inspect<string>("hostUrl")
      if (inspection?.globalValue) {
        await AuthManager.migrateUrlFromSettings(context)
        hostUrl = await AuthManager.getUrl(context)
      }
    }

    // If no URL is configured, ask for it
    if (!hostUrl) {
      hostUrl = await vscode.window.showInputBox({
        prompt: "Enter your Home Assistant instance URL",
        placeHolder: "http://homeassistant.local:8123",
        validateInput: (input) => {
          // Basic URL validation
          try {
            if (!input) {
              return "Home Assistant instance URL is required"
            }

            const url = new URL(input)
            if (!url.protocol.startsWith("http")) {
              return "URL must start with http:// or https://"
            }

            return null // Valid input
          } catch {
            return "Please enter a valid URL (e.g., http://homeassistant.local:8123)"
          }
        }
      })

      // User canceled the Home Assistant instance URL input
      if (!hostUrl) {
        return undefined
      }

      // Store URL in SecretStorage
      await AuthManager.storeUrl(context, hostUrl)
      vscode.window.showInformationMessage(`Home Assistant instance URL set to: ${hostUrl}`)
    }

    // Get token with priority: environment > SecretStorage
    let token = await AuthManager.getToken(context)

    // If no token from any source, migrate global settings then re-check
    if (!token) {
      const config = vscode.workspace.getConfiguration("home-assistant")
      const inspection = config.inspect<string>("longLivedAccessToken")
      if (inspection?.globalValue) {
        await AuthManager.migrateTokenFromSettings(context)
        token = await AuthManager.getToken(context)
      }
    }

    // If still no token, prompt user to enter one
    if (!token) {
      token = await vscode.window.showInputBox({
        prompt: "Enter your Home Assistant Long-Lived Access Token",
        password: true,
        placeHolder: "eyJhbGci..."
      })

      if (token) {
        await AuthManager.storeToken(context, token)
      }
    }

    return token
  }
}
