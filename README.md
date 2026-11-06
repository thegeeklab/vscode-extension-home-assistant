# vscode-extension-home-assistant

Home Assistant Config Helper for Visual Studio Code.

[![License: MIT](https://img.shields.io/github/license/thegeeklab/vscode-extension-home-assistant?logo=github&logoColor=white)](https://github.com/thegeeklab/vscode-extension-home-assistant/blob/main/LICENSE)

A VS Code extension that provides completion, validation and schema support for [Home Assistant](https://www.home-assistant.io/) configurations.

## Features

- **Completion** for entity IDs, services, scenes and triggers when connected to a Home Assistant instance.
- **Validation and completion** for the Home Assistant configuration and Lovelace schema, including deprecation warnings and schema documentation.
- **Go to Definition** for `!include` directives, secrets and scripts.
- **Snippets** for common automation and script structures.
- **Commands** to reload integrations, check the configuration and render templates.
- **Template rendering** to evaluate Jinja templates via the Home Assistant API.

## Usage

Open your Home Assistant configuration folder with VS Code. The extension automatically detects Home Assistant workspaces by their `configuration.yaml` and associates YAML files with the `home-assistant` language, enabling completion, validation, go-to-definition and snippets.

To enable completion and validation against your live instance, connect the extension to Home Assistant using the **Home Assistant: Manage Authentication** command and provide your instance URL and a long-lived access token. Credentials are stored in VS Code `SecretStorage`.

### Configuration

The following settings are available in your `settings.json`:

```json
{
  "home-assistant.ignoreCertificates": false,
  "home-assistant.disableAutomaticFileAssociation": false,
  "home-assistant.autoRenderTemplates": true,
  "home-assistant.devMockConnection": false
}
```

| Setting                                          | Default | Description                                                                   |
| ------------------------------------------------ | ------- | ----------------------------------------------------------------------------- |
| `home-assistant.ignoreCertificates`              | `false` | Enable insecure transport to connect over HTTPS with an invalid certificate.  |
| `home-assistant.disableAutomaticFileAssociation` | `false` | Disable automatic association of YAML files with the Home Assistant language. |
| `home-assistant.autoRenderTemplates`             | `true`  | Render Home Assistant templates on hover.                                     |
| `home-assistant.devMockConnection`               | `false` | Use a static mock connection instead of a live instance (for development).    |

## Contributors

Special thanks to all [contributors](https://github.com/thegeeklab/vscode-extension-home-assistant/graphs/contributors). If you would like to contribute, please see the [instructions](https://github.com/thegeeklab/vscode-extension-home-assistant/blob/main/CONTRIBUTING.md).

This project is a fork of [keesschollaart81/vscode-home-assistant](https://github.com/keesschollaart81/vscode-home-assistant) from Kees Schollaart and Franck Nijhof. Thanks for your work.

## AI Disclaimer

Artificial Intelligence (AI) tools are utilized in the development of this project. This includes AI assistance for writing and reviewing code, as well as generating the extension's icon. All AI-generated contributions are carefully reviewed and tested by human maintainers.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/thegeeklab/vscode-extension-home-assistant/blob/main/LICENSE) file for details.
