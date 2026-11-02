// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The workspace of a document on the command line, which has no VS Code: the folder that stands for the workspace
 * folder of VS Code, and the settings of VS Code in its file `.vscode/settings.json`, which the diagrams of the PDF use
 * as in VS Code ([R-REN-015](../../docs/requirements.md#r-ren-015), [R-REN-016](../../docs/requirements.md#r-ren-016)).
 * The module uses no API of VS Code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseJsonWithComments } from '@nimblescape/plantuml';

/**
 * workspaceFolderOf returns the folder that stands for the workspace folder of VS Code on the command line: the nearest
 * folder from the folder of the document upward with a folder `.vscode` or a Git repository (`.git`), else the folder
 * of the document.
 * @param file - The path of the Markdown file.
 */
export function workspaceFolderOf(file: string): string {
  const start = path.dirname(path.resolve(file));
  for (let folder = start; ; folder = path.dirname(folder)) {
    if (fs.existsSync(path.join(folder, '.vscode')) || fs.existsSync(path.join(folder, '.git'))) {
      return folder;
    }
    if (path.dirname(folder) === folder) {
      return start;
    }
  }
}

/**
 * workspaceSettings returns the settings of VS Code in the file `.vscode/settings.json` of a folder, read as VS Code
 * reads it: JSON with comments and with commas after the last element. A missing file or a file that is no JSON object
 * gives no settings.
 * @param folder - The path of the folder.
 */
export function workspaceSettings(folder: string): Readonly<Record<string, unknown>> {
  try {
    const values = parseJsonWithComments(fs.readFileSync(path.join(folder, '.vscode', 'settings.json'), 'utf8'));
    return typeof values === 'object' && values !== null && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
