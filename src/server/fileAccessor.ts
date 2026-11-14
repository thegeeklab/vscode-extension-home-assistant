import { TextDocuments } from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscodeUri from "vscode-uri"

export interface FileAccessor {
  getFileContents(fileName: string): Promise<string>
  exists(fileName: string): Promise<boolean>
  getFilesInFolder(subFolder: string): Promise<string[]>
  getFilesInFolderRelativeFrom(subFolder: string, relativeFrom: string): Promise<string[]>
  getFilesInFolderRelativeFromAsFileUri(subFolder: string, relativeFrom: string): Promise<string[]>
  getRelativePath(relativeFrom: string, filename: string): string
  getRelativePathAsFileUri(relativeFrom: string, filename: string): string
  fromUriToLocalPath(uri: string): string
}

export class VsCodeFileAccessor implements FileAccessor {
  private workspacePath: string

  constructor(
    workspaceFolder: string,
    private documents: TextDocuments<TextDocument>
  ) {
    // Convert workspace URI to file system path
    this.workspacePath = vscodeUri.URI.parse(workspaceFolder).fsPath
  }

  public async getFileContents(uri: string): Promise<string> {
    const absoluteUri = this.toAbsolutePath(uri)
    const textDocument = this.documents.get(vscodeUri.URI.file(absoluteUri).toString())
    if (textDocument) {
      // open file in editor, might not be saved yet
      return textDocument.getText()
    }
    try {
      const result = await fs.readFile(absoluteUri, "utf-8")
      return result
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return ""
      }
      throw err
    }
  }

  public async exists(fileName: string): Promise<boolean> {
    try {
      await fs.access(this.toAbsolutePath(fileName))
      return true
    } catch {
      return false
    }
  }

  public async getFilesInFolder(
    subFolder: string,
    filelist: string[] = [],
    visitedDirs = new Set<string>()
  ): Promise<string[]> {
    // Resolve subfolder relative to workspace path
    const resolvedSubFolder = path.isAbsolute(subFolder)
      ? subFolder
      : path.join(this.workspacePath, subFolder)
    const normalizedSubFolder = path.normalize(resolvedSubFolder)

    // Get the real path to detect symlink loops
    let realPath: string
    try {
      realPath = await fs.realpath(normalizedSubFolder)
    } catch {
      // If we can't resolve the real path, skip this directory
      console.log(`Cannot resolve real path for ${normalizedSubFolder}`)
      return filelist
    }

    // Check if we've already visited this directory (prevents infinite loops)
    if (visitedDirs.has(realPath)) {
      console.log(
        `Skipping already visited directory: ${normalizedSubFolder} (real path: ${realPath})`
      )
      return filelist
    }

    // Mark this directory as visited
    visitedDirs.add(realPath)

    try {
      const files = await fs.readdir(normalizedSubFolder)
      for (const file of files) {
        // ignore dot files
        if (file.charAt(0) === ".") {
          continue
        }
        const filePath = path.join(normalizedSubFolder, file)

        // Use lstat to not follow symlinks automatically
        let stat
        try {
          stat = await fs.lstat(filePath)
        } catch {
          // Skip files we can't stat
          continue
        }

        if (stat.isSymbolicLink()) {
          // For symlinks, check if they point to a directory
          try {
            const targetStat = await fs.stat(filePath)
            if (targetStat.isDirectory()) {
              // Recursively scan, but with visited directory tracking
              filelist = await this.getFilesInFolder(filePath, filelist, visitedDirs)
            } else {
              // It's a file symlink, add it to the list
              filelist = filelist.concat(filePath)
            }
          } catch {
            // Broken symlink or permission issue, skip it
            console.log(`Skipping broken or inaccessible symlink: ${filePath}`)
          }
        } else if (stat.isDirectory() && !file.startsWith(".")) {
          filelist = await this.getFilesInFolder(filePath, filelist, visitedDirs)
        } else if (stat.isFile()) {
          filelist = filelist.concat(filePath)
        }
      }
    } catch {
      console.log(`Cannot find the files in folder ${normalizedSubFolder}`)
    }
    return filelist
  }

  /**
   * Resolves a path to an absolute path rooted at the workspace folder. Paths that are
   * already absolute (or file:// URIs) are left unchanged, so discovery no longer
   * depends on the language server's process.cwd().
   */
  private toAbsolutePath = (input: string): string => {
    if (input.startsWith("file://")) {
      return path.normalize(vscodeUri.URI.parse(input).fsPath)
    }
    return path.resolve(this.workspacePath, input)
  }

  public async getFilesInFolderRelativeFrom(
    subFolder: string,
    relativeFrom: string
  ): Promise<string[]> {
    relativeFrom = this.toAbsolutePath(relativeFrom)

    const dirOfFile = path.dirname(relativeFrom)
    subFolder = path.join(dirOfFile, subFolder)
    return await this.getFilesInFolder(subFolder)
  }

  public async getFilesInFolderRelativeFromAsFileUri(
    subFolder: string,
    relativeFrom: string
  ): Promise<string[]> {
    const files = await this.getFilesInFolderRelativeFrom(subFolder, relativeFrom)
    return files.map((f) => vscodeUri.URI.file(f).toString())
  }

  public getRelativePath = (relativeFrom: string, filename: string): string => {
    relativeFrom = this.toAbsolutePath(relativeFrom)

    const dirOfFile = path.dirname(relativeFrom)
    const joinedPath = path.join(dirOfFile, filename)

    return joinedPath
  }

  public getRelativePathAsFileUri = (relativeFrom: string, filename: string): string =>
    vscodeUri.URI.file(this.getRelativePath(relativeFrom, filename)).toString()

  public fromUriToLocalPath = (uri: string): string => {
    return path.normalize(vscodeUri.URI.parse(uri).fsPath)
  }
}
