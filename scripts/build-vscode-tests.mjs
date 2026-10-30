// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Bundles each test of test/vscode/ to out/test/vscode/<name>.test.js for the tests in a real VS Code
// (.vscode-test.mjs). The module `vscode` comes from the extension host, and mocha from @vscode/test-cli.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'test', 'vscode');
const outdir = path.join(root, 'out', 'test', 'vscode');

// An import with the suffix ?raw is the text of its file, as in esbuild.mjs and vitest: the renderer embeds the
// scripts of media/ in the page.
const raw = {
  name: 'raw',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    build.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  },
};

fs.rmSync(outdir, { recursive: true, force: true });
await esbuild.build({
  entryPoints: fs.readdirSync(source).filter((name) => name.endsWith('.test.ts')).map((name) => path.join(source, name)),
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  sourcemap: true,
  external: ['vscode', 'mocha'],
  plugins: [raw],
  logLevel: 'info',
});
