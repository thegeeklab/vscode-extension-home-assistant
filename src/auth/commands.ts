import * as vscode from "vscode"
import { AuthManager } from "./manager.js"
import { testHomeAssistantConnection } from "./debug.js"
import { describeConnectionError } from "./connectionErrors.js"

/**
 * Command to manage the Home Assistant authentication (token and instance URL)
 */
export async function manageAuth(context: vscode.ExtensionContext): Promise<void> {
  const actions = [
    "Set Home Assistant Instance URL",
    "Set Token",
    "Clear Token",
    "Clear Home Assistant Instance URL",
    "View Auth Details (Obscured)",
    "Test Connection"
  ]

  const selectedAction = await vscode.window.showQuickPick(actions, {
    placeHolder: "Select an authentication action"
  })

  if (!selectedAction) {
    return
  }

  switch (selectedAction) {
    case "Set Home Assistant Instance URL":
      await setInstanceUrl(context)
      break
    case "Set Token":
      await setToken(context)
      break
    case "Clear Token":
      await clearToken(context)
      break
    case "Clear Home Assistant Instance URL":
      await clearInstanceUrl(context)
      break
    case "View Auth Details (Obscured)":
      await viewAuthDetails(context)
      break
    case "Test Connection":
      await testConnection(context)
      break
  }
}

async function setToken(context: vscode.ExtensionContext): Promise<void> {
  // First, check if we need to set the instance URL
  // Try to get URL from SecretStorage first
  let currentUrl = await AuthManager.getUrl(context)

  // If not in SecretStorage, check settings and environment
  if (!currentUrl) {
    const config = vscode.workspace.getConfiguration("home-assistant")
    currentUrl =
      config.get<string>("hostUrl") ||
      process.env.HASS_SERVER ||
      (process.env.SUPERVISOR_TOKEN ? "http://supervisor/core" : "")
  }

  // Always ask for the instance URL for verification
  const instanceUrl = await vscode.window.showInputBox({
    prompt: "Enter your Home Assistant instance URL",
    placeHolder: "http://homeassistant.local:8123",
    value: currentUrl || "http://homeassistant.local:8123", // Pre-fill default if currentUrl is empty
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

  // User canceled the instance URL input
  if (!instanceUrl) {
    return
  }

  // Save the instance URL
  if (instanceUrl !== currentUrl) {
    try {
      // Store in SecretStorage
      await AuthManager.storeUrl(context, instanceUrl)

      // Remove from settings if it exists
      const config = vscode.workspace.getConfiguration("home-assistant")
      if (config.get("hostUrl") !== undefined) {
        await config.update("hostUrl", undefined, vscode.ConfigurationTarget.Global)
      }

      vscode.window.showInformationMessage(
        `Home Assistant instance URL has been securely stored: ${instanceUrl}`
      )
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to store Home Assistant instance URL: ${error instanceof Error ? error.message : String(error)}`
      )
      return // Don't proceed to token if URL failed
    }
  }

  const token = await vscode.window.showInputBox({
    prompt: "Enter your Home Assistant Long-Lived Access Token",
    password: true,
    placeHolder: "eyJhbGci..."
  })

  if (token) {
    try {
      await AuthManager.storeToken(context, token)
      // Remove from settings if it exists
      const config = vscode.workspace.getConfiguration("home-assistant")
      if (config.get("longLivedAccessToken") !== undefined) {
        await config.update("longLivedAccessToken", undefined, vscode.ConfigurationTarget.Global)
      }
      vscode.window.showInformationMessage("Home Assistant token has been securely stored.")
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to store token: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else {
    vscode.window.showWarningMessage("No token was entered.")
  }
}

async function clearToken(context: vscode.ExtensionContext): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    "Are you sure you want to clear the stored Home Assistant token?",
    { modal: true },
    "Yes"
  )

  if (confirmation === "Yes") {
    try {
      await AuthManager.deleteToken(context)
      vscode.window.showInformationMessage("Home Assistant token has been cleared.")
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to clear token: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

async function viewAuthDetails(context: vscode.ExtensionContext): Promise<void> {
  const token = await AuthManager.getToken(context)
  const url = await AuthManager.getUrl(context)

  if (token || url) {
    let message = "Current Home Assistant Authentication Details:\n"
    if (url) {
      message += `\nHome Assistant Instance URL: ${url}`
    } else {
      message += "\nHome Assistant Instance URL: Not set"
    }
    if (token) {
      const obscuredToken =
        token.length <= 10
          ? "***"
          : `${token.substring(0, 5)}...${token.substring(token.length - 5)}`
      message += `\nToken: ${obscuredToken}`
    } else {
      message += "\nToken: Not set"
    }
    vscode.window.showInformationMessage(message, { modal: true })
  } else {
    vscode.window.showInformationMessage(
      "No Home Assistant token or instance URL is currently stored."
    )
  }
}

export async function testConnection(context: vscode.ExtensionContext): Promise<void> {
  const token = await AuthManager.getToken(context)
  const hostUrl = await AuthManager.getUrl(context)

  if (!hostUrl) {
    vscode.window.showErrorMessage("Home Assistant instance URL is not set. Please set it first.")
    // Optionally, prompt to set it now
    const setNow = await vscode.window.showQuickPick(["Set Home Assistant Instance URL Now"], {
      placeHolder: "Home Assistant instance URL is missing"
    })
    if (setNow === "Set Home Assistant Instance URL Now") {
      await setInstanceUrl(context)
      // Re-check after attempting to set
      const newHostUrl = await AuthManager.getUrl(context)
      if (!newHostUrl) {
        return // User cancelled or failed to set
      }
      // If token is also missing, prompt for that too or guide user
      if (!token) {
        vscode.window.showInformationMessage(
          "Home Assistant instance URL set. Now please ensure your token is also set via the 'Set Token' command."
        )
        return
      }
      // If both are now set, continue with the test
      await testConnection(context)
    }
    return
  }

  if (!token) {
    vscode.window.showErrorMessage("Home Assistant token is not set. Please set it first.")
    // Optionally, prompt to set it now
    const setNow = await vscode.window.showQuickPick(["Set Token Now"], {
      placeHolder: "Token is missing"
    })
    if (setNow === "Set Token Now") {
      await setToken(context)
      // Re-check after attempting to set
      const newToken = await AuthManager.getToken(context)
      if (!newToken) {
        return // User cancelled or failed to set
      }
      // If token is now set, continue with the test
      await testConnection(context)
    }
    return
  }

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Testing Home Assistant Connection",
      cancellable: false
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Connecting..." })

      // Use the same Node http/https transport as the status bar and the
      // language-server websocket. The global `fetch` (undici) collapses every
      // failure into an opaque "fetch failed" message, hiding the real cause.
      const config = vscode.workspace.getConfiguration("home-assistant")
      const ignoreCertificates = !!config.get<boolean>("ignoreCertificates")

      try {
        const result = await testHomeAssistantConnection(hostUrl, token, ignoreCertificates)

        progress.report({ increment: 50, message: "Validating response..." })

        if (result.success) {
          progress.report({ increment: 100, message: "Connection successful!" })
          const version =
            result.data && result.data.version && result.data.version !== "unknown"
              ? ` (version ${result.data.version})`
              : ""
          vscode.window.showInformationMessage(
            `Successfully connected to Home Assistant at ${hostUrl}${version}. API is running.`
          )
        } else {
          progress.report({ increment: 100, message: "Connection failed." })
          vscode.window.showErrorMessage(
            `Failed to connect to Home Assistant at ${hostUrl}: ${result.message}`
          )
        }
      } catch (error) {
        progress.report({ increment: 100, message: "Connection error." })
        vscode.window.showErrorMessage(
          `Error connecting to Home Assistant at ${hostUrl}: ${describeConnectionError(error)}`
        )
      }
    }
  )
}

async function setInstanceUrl(context: vscode.ExtensionContext): Promise<void> {
  const currentUrl = await AuthManager.getUrl(context)

  const newUrl = await vscode.window.showInputBox({
    prompt: "Enter your Home Assistant instance URL",
    placeHolder: "http://homeassistant.local:8123",
    value: currentUrl || "http://homeassistant.local:8123", // Pre-fill default if currentUrl is empty
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

  if (newUrl && newUrl !== currentUrl) {
    try {
      await AuthManager.storeUrl(context, newUrl)
      // Remove from settings if it exists
      const config = vscode.workspace.getConfiguration("home-assistant")
      if (config.get("hostUrl") !== undefined) {
        await config.update("hostUrl", undefined, vscode.ConfigurationTarget.Global)
      }
      vscode.window.showInformationMessage(
        `Home Assistant instance URL has been securely stored: ${newUrl}`
      )
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to store Home Assistant instance URL: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else if (!newUrl) {
    vscode.window.showWarningMessage("No Home Assistant instance URL was entered.")
  } else {
    vscode.window.showInformationMessage("Home Assistant instance URL is already up to date.")
  }
}

async function clearInstanceUrl(context: vscode.ExtensionContext): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    "Are you sure you want to clear the stored Home Assistant instance URL?",
    { modal: true },
    "Yes"
  )

  if (confirmation === "Yes") {
    try {
      await AuthManager.deleteUrl(context)
      vscode.window.showInformationMessage("Home Assistant instance URL has been cleared.")
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to clear Home Assistant instance URL: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
