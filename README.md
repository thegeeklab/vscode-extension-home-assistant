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

## Getting started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=thegeeklab.home-assistant).
2. Open your Home Assistant configuration folder with VS Code.
3. Configure the connection to Home Assistant in the VS Code settings.

## Contributors

Special thanks to all [contributors](https://github.com/thegeeklab/vscode-extension-home-assistant/graphs/contributors). If you would like to contribute, please see the [instructions](https://github.com/thegeeklab/vscode-extension-home-assistant/blob/main/CONTRIBUTING.md).

This project is a fork of [keesschollaart81/vscode-home-assistant](https://github.com/keesschollaart81/vscode-home-assistant) from Kees Schollaart and Franck Nijhof. Thanks for your work.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/thegeeklab/vscode-extension-home-assistant/blob/main/LICENSE) file for details.
