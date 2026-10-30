// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The start of the command markdownpaper in Node.js ([R-CLI-001](../../docs/requirements.md#r-cli-001)): it runs
 * [cli.ts](cli.ts) with the arguments of the command line, the standard streams, the questions of a terminal, and the
 * files of its package beside the bundle: the built-in layouts in layouts/ and Paged.js in paged.polyfill.js.
 */

import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { run } from './cli';

const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;

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
      }
    : {}),
  cwd: process.cwd(),
  assets: { layouts: path.join(__dirname, 'layouts'), pagedJs: path.join(__dirname, 'paged.polyfill.js') },
}).then((code) => {
  process.exitCode = code;
});
