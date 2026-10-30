// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The host of the renderer in VS Code: it reads the files through the file system of VS Code, with the unsaved changes
 * of an open document, so that the page preview shows a change of a style sheet of a layout before its save; it finds
 * the built-in layouts in the folder of the extension, and ends the search for a layout at the folder of the
 * workspace of the document.
 */

import * as vscode from 'vscode';
import type { Host, Reader } from './paper/render';

const encoder = new TextEncoder();

/** workspaceReader reads files through VS Code, open documents with their unsaved text. */
export const workspaceReader: Reader = {
  async read(url) {
    const uri = vscode.Uri.parse(url, true);
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (open) {
      return encoder.encode(open.getText());
    }
    try {
      return await vscode.workspace.fs.readFile(uri);
    } catch {
      return undefined;
    }
  },
};

/**
 * folderUrl returns the URL of a folder with a slash at its end.
 * @param folder - The URI of the folder.
 */
export const folderUrl = (folder: vscode.Uri): string => {
  const url = folder.toString();
  return url.endsWith('/') ? url : `${url}/`;
};

/**
 * searchHost returns the reader and the places of the layouts for a document.
 * @param extension - The URI of the folder of the extension.
 * @param document - The URI of the file of the document.
 */
export function searchHost(extension: vscode.Uri, document: vscode.Uri): Pick<Host, 'reader' | 'builtinLayouts' | 'top'> {
  const folder = vscode.workspace.getWorkspaceFolder(document);
  return {
    reader: workspaceReader,
    builtinLayouts: folderUrl(vscode.Uri.joinPath(extension, 'layouts')),
    ...(folder ? { top: folderUrl(folder.uri) } : {}),
  };
}

/**
 * readFolder reads the files of a folder and of its subfolders, by their paths in the folder.
 * @param folder - The URI of the folder.
 */
export async function readFolder(folder: vscode.Uri): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const walk = async (relative: string): Promise<void> => {
    const uri = relative ? vscode.Uri.joinPath(folder, relative) : folder;
    for (const [name, type] of await vscode.workspace.fs.readDirectory(uri)) {
      const child = relative ? `${relative}/${name}` : name;
      if (type & vscode.FileType.Directory) {
        await walk(child);
      } else if (type & vscode.FileType.File) {
        files.set(child, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, child)));
      }
    }
  };
  await walk('');
  return files;
}
