// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Bundle the extension into dist/extension.js, and the command markdownpaper (docs/requirements.md, R-CLI-001) into
// cli/dist/markdownpaper.js, the file of the npm package @nimblescape/markdownpaper of cli/, for Node.js 22 or later
// (engines of cli/package.json). Both bundles hold markdown-it, its footnotes, yaml, the hyphenation patterns and
// pdf-lib. The build copies the files that the renderer reads at run time: Paged.js (paged.polyfill.js) into media/
// for the extension and into cli/dist/ for the npm package, and paged.js, which does not start on its own, into media/
// for the script of the pages in the Markdown preview, and the built-in layouts of layouts/ into cli/dist/layouts/;
// the extension reads layouts/ of its own folder. npm puts the license of the folder of a package into the package,
// so the build copies LICENSE and THIRD-PARTY-NOTICES.md into cli/. VS Code provides the module `vscode` at run time,
// so the bundle leaves it out. The bundles are readable JavaScript: not minified, so that they keep the names of the
// source and anyone can read the code of the packages and compare it with the source (CONTRIBUTING.md, "Reviewing the
// packages"). Only a development build writes a source map; a production build (--production, which vscode:prepublish
// passes) has none.

import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';

// An import with the suffix ?raw is the text of its file, as in vitest: the instructions print the documents of docs/.
const raw = {
  name: 'raw',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    build.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  },
};

const production = process.argv.includes('--production');
const bundles = [
  { entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', target: 'node24' },
  { entryPoints: ['src/cli/main.ts'], outfile: 'cli/dist/markdownpaper.js', target: 'node22', banner: { js: '#!/usr/bin/env node' } },
];

fs.mkdirSync('cli/dist', { recursive: true });
fs.mkdirSync('media', { recursive: true });
fs.copyFileSync('LICENSE', 'cli/LICENSE');
fs.copyFileSync('THIRD-PARTY-NOTICES.md', 'cli/THIRD-PARTY-NOTICES.md');
fs.copyFileSync('node_modules/pagedjs/dist/paged.polyfill.js', 'media/paged.polyfill.js');
fs.copyFileSync('node_modules/pagedjs/dist/paged.js', 'media/paged.js');
fs.copyFileSync('node_modules/pagedjs/dist/paged.polyfill.js', 'cli/dist/paged.polyfill.js');
fs.rmSync('cli/dist/layouts', { recursive: true, force: true });
fs.cpSync('layouts', 'cli/dist/layouts', { recursive: true });

for (const bundle of bundles) {
  // A production build writes no source map: remove the map of an earlier development build, so that no map that does
  // not match the bundle of the production build stays in dist/.
  if (production) {
    fs.rmSync(`${bundle.outfile}.map`, { force: true });
  }
  await esbuild.build({
    ...bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: !production,
    minify: false,
    plugins: [raw],
    logLevel: 'info',
  });
}
