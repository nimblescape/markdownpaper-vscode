// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The start of the command markdownpaper in Node.js ([R-CLI-001](../../docs/requirements.md#r-cli-001)): it runs
 * [cli.ts](cli.ts) with the arguments of the command line, the standard streams, the questions and the lists of a terminal, and the
 * files of its package beside the bundle: the built-in layouts in layouts/ and Paged.js in paged.polyfill.js.
 */

import * as path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { type Choice, run } from './cli';

const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;

/** visible is the number of entries that the list of a choice shows at once. */
const visible = 10;

/**
 * choose shows a list in the terminal, as `npm create vite` does: the arrow keys move the mark, Enter chooses the
 * marked entry, and Escape or Ctrl+C stops the choice. The hint of an entry stands after its label in grey, and the
 * detail of the marked entry below the list.
 * @param question - The question above the list.
 * @param choices - The entries.
 * @param initial - The index of the entry that is marked first.
 */
function choose(question: string, choices: readonly Choice[], initial: number): Promise<number | undefined> {
  return new Promise((resolve) => {
    const output = process.stdout;
    let index = Math.min(Math.max(initial, 0), choices.length - 1);
    let lines = 0;
    const draw = (done: boolean): void => {
      output.write(lines > 0 ? `\x1b[${lines}A\x1b[0J` : '');
      if (done) {
        output.write(`\x1b[32m✔\x1b[0m ${question}: ${index >= 0 ? choices[index].label : ''}\n`);
        lines = 0;
        return;
      }
      const first = Math.min(Math.max(index - Math.floor(visible / 2), 0), Math.max(choices.length - visible, 0));
      const shown = choices.slice(first, first + visible).map((choice, offset) => {
        const marked = first + offset === index;
        const hint = choice.hint ? ` \x1b[90m${choice.hint}\x1b[0m` : '';
        return `${marked ? '\x1b[36m❯ ' : '  '}${choice.label}${marked ? '\x1b[0m' : ''}${hint}`;
      });
      const detail = choices[index]?.detail;
      const text = [`\x1b[36m?\x1b[0m ${question} \x1b[90m(↑/↓, Enter)\x1b[0m`, ...shown, ...(detail ? [`\x1b[90m  ${detail}\x1b[0m`] : [])];
      output.write(`${text.join('\n')}\n`);
      lines = text.length;
    };
    const finish = (result: number | undefined): void => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (result === undefined) {
        index = -1;
      }
      draw(true);
      resolve(result);
    };
    const onKey = (_: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + choices.length) % choices.length;
      } else if (key.name === 'down' || key.name === 'j' || key.name === 'tab') {
        index = (index + 1) % choices.length;
      } else if (key.name === 'return' || key.name === 'enter') {
        finish(index);
        return;
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        finish(undefined);
        return;
      } else {
        return;
      }
      draw(false);
    };
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKey);
    draw(false);
  });
}

run(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  ...(interactive
    ? {
        ask: async (question: string, answer: string) => {
          const terminal = createInterface({ input: process.stdin, output: process.stdout });
          try {
            return await terminal.question(`${question}${answer ? ` (${answer})` : ''}: `);
          } finally {
            terminal.close();
          }
        },
        choose,
      }
    : {}),
  cwd: process.cwd(),
  assets: { layouts: path.join(__dirname, 'layouts'), pagedJs: path.join(__dirname, 'paged.polyfill.js') },
}).then((code) => {
  process.exitCode = code;
});
