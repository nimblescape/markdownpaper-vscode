// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { run } from './cli';
import { completionScript, globalOptions, shells, verbs } from './completion';

/** help returns the help of the command. */
async function help(): Promise<string> {
  const out: string[] = [];
  await run(['--help'], { out: (line) => out.push(line), err: () => undefined, cwd: '.', assets: { layouts: '', pagedJs: '', plantUml: '' } });
  return out.join('\n');
}

/** has tells whether a program is on the PATH. */
const has = (program: string): boolean => spawnSync(program, ['-c', 'true']).status === 0;

describe('the Tab completion of mp (R-CLI-001)', () => {
  test('the completion knows each command and option of the help, and the help each one of the completion', async () => {
    const text = await help();
    const commands = [...text.matchAll(/^ {2}([a-z]+)\b/gm)].map((match) => match[1]);
    expect([...new Set(commands)].sort()).toEqual(verbs.map((verb) => verb.name).sort());
    // The last line of the help names the option -y of npx.
    const options = new Set([...text.split('Run it without')[0].matchAll(/(?<![\w-])(--?[a-z][a-z-]*)/g)].map((match) => match[1]));
    const known = new Set([...globalOptions, ...verbs.flatMap((verb) => verb.options ?? [])]);
    expect([...options].filter((option) => !known.has(option))).toEqual([]);
    // The browser options of preview stand in the help at build, which shares them.
    expect([...known].filter((option) => !options.has(option))).toEqual([]);
  });

  test('mp completion prints the script of a shell, and the scripts are valid for their shells', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = { out: (line: string) => out.push(line), err: (line: string) => err.push(line), cwd: '.', assets: { layouts: '', pagedJs: '', plantUml: '' } };
    expect(await run(['completion', 'bash'], io)).toBe(0);
    expect(out.join('\n')).toBe(completionScript('bash').trimEnd());
    expect(await run(['completion', 'tcsh'], io)).toBe(2);
    expect(err[0]).toBe('mp: mp completion takes one shell: bash, zsh, fish.');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-completion-'));
    try {
      for (const shell of shells.filter(has)) {
        const file = path.join(folder, shell);
        fs.writeFileSync(file, completionScript(shell));
        expect(() => execFileSync(shell, ['-n', file]), shell).not.toThrow();
      }
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  test('bash completes the commands, the options of a command and the Markdown files', () => {
    if (!has('bash')) {
      return;
    }
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-completion-'));
    try {
      fs.writeFileSync(path.join(folder, 'paper.md'), '');
      fs.writeFileSync(path.join(folder, 'notes.txt'), '');
      const complete = (...words: string[]): string[] => {
        const script = `${completionScript('bash')}\nCOMP_WORDS=(${words.map((word) => `'${word}'`).join(' ')}); COMP_CWORD=${words.length - 1}; _mp_completion; printf '%s\\n' "\${COMPREPLY[@]}"`;
        return execFileSync('bash', ['-c', script], { cwd: folder, encoding: 'utf8' }).split('\n').filter(Boolean).sort();
      };
      expect(complete('mp', 'bu')).toEqual(['build']);
      expect(complete('mp', 'get', '-')).toEqual(['--force', '--name', '-u']);
      expect(complete('mp', 'build', 'p')).toEqual(['paper.md']);
      expect(complete('mp', 'instructions', '')).toEqual(['document', 'layout', 'render']);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
