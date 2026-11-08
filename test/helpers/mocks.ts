import { access, readFile, readdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { CompletionItem, MarkupContent } from "vscode-languageserver-protocol"
import { HassEntities, HassServices } from "home-assistant-js-websocket"
import { HomeAssistantConfiguration } from "../../src/language-service/src/haConfig/haConfig.js"
import { HomeAssistantLanguageService } from "../../src/language-service/src/haLanguageService.js"
import { IHaConnection } from "../../src/language-service/src/home-assistant/haConnection.js"
import { SchemaServiceForIncludes } from "../../src/language-service/src/schemas/schemaService.js"
import { FileAccessor } from "../../src/server/fileAccessor.js"
import { getLanguageService } from "yaml-language-server"

export class MockFileAccessor {
  constructor(private secretsContent = "") {}

  async getFileContents(path: string): Promise<string> {
    if (path === "secrets.yaml") {
      return this.secretsContent
    }
    return ""
  }

  getRelativePath(_fileUri: string, _includePath: string): string {
    return ""
  }

  getRelativePathAsFileUri(_fileUri: string, _includePath: string): string {
    return ""
  }

  async getFilesInFolderRelativeFromAsFileUri(
    _folderPath: string,
    _fileUri: string
  ): Promise<string[]> {
    return []
  }
}

export interface MockHaConnectionOptions {
  entities?: HassEntities
  services?: HassServices
  devices?: any
  entityRegistry?: any
  areaCompletions?: CompletionItem[]
  deviceCompletions?: CompletionItem[]
  entityCompletions?: CompletionItem[]
  floorCompletions?: CompletionItem[]
  labelCompletions?: CompletionItem[]
  serviceCompletions?: CompletionItem[]
}

export class MockHaConnection implements IHaConnection {
  private readonly options: MockHaConnectionOptions

  constructor(options: MockHaConnectionOptions = {}) {
    this.options = options
  }

  async tryConnect(): Promise<void> {}

  async notifyConfigUpdate(_conf: any): Promise<void> {}

  async getAreaCompletions(): Promise<CompletionItem[]> {
    return this.options.areaCompletions ?? []
  }

  async getDeviceCompletions(): Promise<CompletionItem[]> {
    return this.options.deviceCompletions ?? []
  }

  async getDomainCompletions(): Promise<CompletionItem[]> {
    return []
  }

  async getEntityCompletions(): Promise<CompletionItem[]> {
    return this.options.entityCompletions ?? []
  }

  async getFloorCompletions(): Promise<CompletionItem[]> {
    return this.options.floorCompletions ?? []
  }

  async getLabelCompletions(): Promise<CompletionItem[]> {
    return this.options.labelCompletions ?? []
  }

  async getServiceCompletions(): Promise<CompletionItem[]> {
    return this.options.serviceCompletions ?? []
  }

  async getHassEntities(): Promise<HassEntities> {
    return this.options.entities ?? {}
  }

  async getHassDevices(): Promise<any> {
    return this.options.devices ?? {}
  }

  async getHassEntityRegistry(): Promise<any> {
    return this.options.entityRegistry ?? {}
  }

  async getHassServices(): Promise<HassServices> {
    return this.options.services ?? ({} as HassServices)
  }

  async resolveEntityCompletionDocumentation(
    _entityId: string
  ): Promise<MarkupContent | undefined> {
    return undefined
  }
}

export class TestFileAccessor implements FileAccessor {
  async getFileContents(fileName: string): Promise<string> {
    try {
      return await readFile(fileName, "utf8")
    } catch (error) {
      console.error(`Error reading file ${fileName}:`, error)
      return ""
    }
  }

  async exists(fileName: string): Promise<boolean> {
    try {
      await access(fileName)
      return true
    } catch {
      return false
    }
  }

  async getFilesInFolder(subFolder: string): Promise<string[]> {
    try {
      return (await readdir(subFolder)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    } catch {
      return []
    }
  }

  fromUriToLocalPath(uri: string): string {
    return uri.replace("file://", "")
  }

  getRelativePath(from: string, to: string): string {
    return resolve(dirname(from), to)
  }

  getRelativePathAsFileUri(relativeFrom: string, filename: string): string {
    const fullPath = this.getRelativePath(relativeFrom, filename)
    return `file://${fullPath}`
  }

  async getFilesInFolderRelativeFrom(folder: string, from: string): Promise<string[]> {
    try {
      const absoluteFolder = resolve(dirname(from), folder)
      return (await readdir(absoluteFolder)).filter(
        (f) => f.endsWith(".yaml") || f.endsWith(".yml")
      )
    } catch {
      return []
    }
  }

  async getFilesInFolderRelativeFromAsFileUri(
    subFolder: string,
    relativeFrom: string
  ): Promise<string[]> {
    return (await this.getFilesInFolderRelativeFrom(subFolder, relativeFrom)).map(
      (file) => `file://${resolve(dirname(relativeFrom), subFolder, file)}`
    )
  }
}

export async function createMockLanguageService(
  connection: IHaConnection,
  fileAccessor: MockFileAccessor
): Promise<HomeAssistantLanguageService> {
  const haConfig = new HomeAssistantConfiguration(fileAccessor as any)
  const yamlLanguageService = getLanguageService({
    schemaRequestService: async () => "",
    workspaceContext: null,
    telemetry: undefined
  })

  return new HomeAssistantLanguageService(
    yamlLanguageService,
    haConfig,
    connection as any,
    [],
    await SchemaServiceForIncludes.create(),
    () => {
      /* mock sendDiagnostics */
    },
    () => {
      /* mock diagnoseAllFiles */
    },
    { isConfigured: true, autoRenderTemplates: true } as any
  )
}
