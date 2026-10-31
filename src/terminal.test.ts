// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cmdScript, mpScript, shellScript, writeScripts } from './terminal';

vi.mock('vscode', () => ({}));

let folder: string;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-terminal-'));
});

afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('the command mp in the terminals of VS Code (R-CLI-001)', () => {
  test('the scripts start cli/dist/mp.js of the extension with the Node.js of the PATH and pass the arguments on', () => {
    // A folder of the extension with the characters that a shell reads as syntax.
    const extension = path.join(folder, `it's "$HOME" \`x\``);
    fs.mkdirSync(path.join(extension, 'cli', 'dist'), { recursive: true });
    fs.writeFileSync(mpScript(extension), 'console.log(JSON.stringify(process.argv.slice(2)));\n');
    const bin = writeScripts(path.join(folder, 'storage'), extension, 'linux');
    expect(fs.readdirSync(bin)).toEqual(['mp']);
    expect(fs.statSync(path.join(bin, 'mp')).mode & 0o777).toBe(0o755);
    expect(execFileSync(path.join(bin, 'mp'), ['build', 'a b.md'], { encoding: 'utf8' })).toBe('["build","a b.md"]\n');
    expect(shellScript('/x/mp.js')).toBe("#!/bin/sh\n# mp of the extension nimblescape Markdown Paper\nexec node '/x/mp.js' \"$@\"\n");
  });

  test('Windows gets a batch file beside the shell script, and a second start writes nothing anew', () => {
    const bin = writeScripts(path.join(folder, 'storage'), 'C:\\Users\\a%b\\ext', 'win32');
    expect(fs.readdirSync(bin).sort()).toEqual(['mp', 'mp.cmd']);
    expect(fs.readFileSync(path.join(bin, 'mp.cmd'), 'utf8')).toBe(cmdScript(mpScript('C:\\Users\\a%b\\ext')));
    expect(cmdScript('C:\\a%b\\mp.js')).toBe('@echo off\r\nrem mp of the extension nimblescape Markdown Paper\r\nnode "C:\\a%%b\\mp.js" %*\r\n');
    const written = fs.statSync(path.join(bin, 'mp')).mtimeMs;
    writeScripts(path.join(folder, 'storage'), 'C:\\Users\\a%b\\ext', 'win32');
    expect(fs.statSync(path.join(bin, 'mp')).mtimeMs).toBe(written);
  });
});
