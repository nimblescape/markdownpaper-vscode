// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The command mp in the terminals of VS Code ([R-CLI-001](../docs/requirements.md#r-cli-001)), as nimblescape
 * TypeScript gives them its command ts. The package of the extension holds a copy of the npm package
 * `@nimblescape/markdownpaper` in cli/. The extension gives the terminals of VS Code (environmentVariableCollection):
 *
 * - PATH ends with a folder of the storage of the extension that holds `mp`, a small shell script that starts
 *   cli/dist/mp.js with the Node.js of the PATH, and `mp.cmd` on Windows. It stands at the end, so a global mp
 *   (npm install --global @nimblescape/markdownpaper) comes first and decides the version.
 * - XDG_DATA_DIRS (bash) and FPATH (zsh) get a folder with the Tab completion scripts of mp
 *   ([cli/completion.ts](cli/completion.ts)).
 *
 * The terminals that are open when the extension starts get the change after a restart; VS Code shows that on their
 * tabs. VS Code keeps the collection for the next start of the window, so its terminals have it from the start.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { completionScript } from './cli/completion';

/** command is the name of the command in the terminals. */
export const command = 'mp';

/**
 * mpScript returns the script of mp in the extension, which Node.js runs.
 * @param extension - The folder of the extension.
 */
export function mpScript(extension: string): string {
  return path.join(extension, 'cli', 'dist', 'mp.js');
}

/**
 * shellScript returns the text of the shell script that starts a script with the Node.js of the PATH. The path stands
 * in single quotes, so the shell reads no character of it as syntax, also not $, ` or " of a folder name.
 * @param script - The path of the script.
 */
export function shellScript(script: string): string {
  const quoted = `'${script.replaceAll("'", `'\\''`)}'`;
  return `#!/bin/sh\n# mp of the extension nimblescape Markdown Paper\nexec node ${quoted} "$@"\n`;
}

/**
 * cmdScript returns the text of the batch file of Windows that starts a script with the Node.js of the PATH. A percent
 * sign of the path is doubled, so that cmd.exe reads no variable in it.
 * @param script - The path of the script.
 */
export function cmdScript(script: string): string {
  return `@echo off\r\nrem mp of the extension nimblescape Markdown Paper\r\nnode "${script.replaceAll('%', '%%')}" %*\r\n`;
}

/**
 * writeIfChanged writes a file only when its text changed, so a start of VS Code writes nothing in most cases.
 * @param file - The path of the file.
 * @param text - The text.
 * @param mode - The mode of the file.
 */
function writeIfChanged(file: string, text: string, mode = 0o644): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let current: string | undefined;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    current = undefined;
  }
  if (current !== text) {
    fs.writeFileSync(file, text, { mode });
  }
  fs.chmodSync(file, mode);
}

/**
 * writeScripts writes the scripts that start the mp of the extension into a folder, and returns the folder. The
 * scripts name the script of this version of the extension; an update of the extension writes them again.
 * @param storage - The storage folder of the extension.
 * @param extension - The folder of the extension.
 * @param platform - The platform of Node.js.
 */
export function writeScripts(storage: string, extension: string, platform: NodeJS.Platform = process.platform): string {
  const bin = path.join(storage, 'bin');
  writeIfChanged(path.join(bin, command), shellScript(mpScript(extension)), 0o755);
  if (platform === 'win32') {
    writeIfChanged(path.join(bin, `${command}.cmd`), cmdScript(mpScript(extension)));
  }
  return bin;
}

/**
 * terminalZsh returns the zsh of the terminals: the default shell of the terminals of VS Code when it is a zsh, else
 * the zsh of the PATH. On macOS, the zsh of the system and a zsh of Homebrew have other folders of functions.
 */
function terminalZsh(): string {
  const shell: unknown = vscode.env.shell;
  return typeof shell === 'string' && path.basename(shell) === 'zsh' ? shell : 'zsh';
}

/**
 * zshFunctionPath returns the default fpath of the zsh of the terminals, without the start files of the user, or
 * undefined without zsh. The extension host does not wait for zsh: the promise resolves when zsh has answered.
 */
function zshFunctionPath(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(terminalZsh(), ['-fc', 'print -r -- $FPATH'], { encoding: 'utf8', timeout: 5000 }, (error, stdout) => {
      resolve((error ? '' : stdout.trim()) || undefined);
    });
  });
}

/**
 * setUpTerminals sets the variables of the terminals (see the head of this file), and returns the folder of the
 * scripts.
 * @param context - The context of the extension.
 */
export function setUpTerminals(context: vscode.ExtensionContext): string {
  const storage = context.globalStorageUri.fsPath;
  const bin = writeScripts(storage, context.extensionPath);
  const completion = path.join(storage, 'completion');
  writeIfChanged(path.join(completion, 'bash-completion', 'completions', command), completionScript('bash', command));
  writeIfChanged(path.join(completion, 'zsh', `_${command}`), completionScript('zsh', command));

  const collection = context.environmentVariableCollection;
  // VS Code keeps the collection of the last start; its FPATH stays until zsh names its folders again (below).
  const lastFpath = collection.get('FPATH');
  collection.clear();
  collection.description = 'Adds the command mp of nimblescape Markdown Paper and its Tab completion.';
  collection.append('PATH', `${path.delimiter}${bin}`);
  if (process.platform === 'win32') {
    return bin;
  }
  // An unset XDG_DATA_DIRS means /usr/local/share:/usr/share, which bash-completion then still has to read.
  const dataDirs = process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share';
  collection.replace('XDG_DATA_DIRS', `${dataDirs}${path.delimiter}${completion}`);
  // FPATH replaces the whole fpath of zsh, so it keeps the folders of zsh itself. Without FPATH in the environment of
  // VS Code, zsh names them a moment later; until then, a new terminal gets the FPATH of the last start.
  const setFpath = (fpath: string | undefined): void => {
    if (fpath !== undefined) {
      collection.replace('FPATH', `${fpath}${path.delimiter}${path.join(completion, 'zsh')}`);
    } else {
      collection.delete('FPATH');
    }
  };
  if (process.env.FPATH) {
    setFpath(process.env.FPATH);
    return bin;
  }
  if (lastFpath !== undefined) {
    collection.replace('FPATH', lastFpath.value);
  }
  void zshFunctionPath().then(setFpath);
  return bin;
}

/**
 * runInTerminal runs a command line of mp in a new terminal of VS Code in a folder, and shows the terminal.
 * @param folder - The folder.
 * @param line - The command line, for example `mp get`.
 */
export function runInTerminal(folder: vscode.Uri, line: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal({ name: 'Markdown Paper', cwd: folder });
  terminal.show();
  terminal.sendText(line);
  return terminal;
}
