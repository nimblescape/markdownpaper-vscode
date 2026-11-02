// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Bundle the extension into dist/extension.js, and the command markdownpaper (docs/requirements.md, R-CLI-001) into
// cli/dist/mp.js, the file of the npm package @nimblescape/markdownpaper of cli/, for Node.js 22 or later
// (engines of cli/package.json). Both bundles hold markdown-it, its footnotes, yaml, the hyphenation patterns and
// pdf-lib. The build copies the files that the renderer reads at run time: Paged.js (paged.polyfill.js) into media/
// for the extension and into cli/dist/ for the npm package, and paged.js, which does not start on its own, into media/
// for the script of the pages in the Markdown preview, and the built-in layouts of layouts/ into cli/dist/layouts/;
// the extension reads layouts/ of its own folder. The page of the PDF draws the PlantUML diagrams with the files of the
// page of the npm package @nimblescape/plantuml (scripts/install-plantuml.mjs installs it): the build copies them with
// the notices of the package into media/plantuml/ and cli/dist/plantuml/. The command line has no Mermaid extension of
// VS Code: the build bundles the script src/page/mermaid.ts, which draws the diagrams of Mermaid in the page of its PDF,
// with Mermaid into cli/dist/mermaid/, as an ECMAScript module with parts that it loads when a diagram needs them, and
// writes their notices beside them. npm puts the license of the folder of a package into the package, so the build
// copies LICENSE and THIRD-PARTY-NOTICES.md into cli/. VS Code provides the module `vscode` at run time, so the bundle
// leaves it out. The bundles are readable JavaScript: not minified, so that they keep the names of the source and anyone
// can read the code of the packages and compare it with the source (CONTRIBUTING.md, "Reviewing the package"). Only
// the script of Mermaid has no spaces and the shorter forms of the syntax, but it keeps the names too. Only a
// development build writes a source map; a production build (--production, which vscode:prepublish passes) has none.

import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { thirdPartyNotices } from './scripts/third-party-notices.mjs';

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
  { entryPoints: ['src/cli/main.ts'], outfile: 'cli/dist/mp.js', target: 'node22', banner: { js: '#!/usr/bin/env node' } },
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
const plantUml = 'node_modules/@nimblescape/plantuml';
if (!fs.existsSync(`${plantUml}/dist/page/markdownPreview.js`)) {
  throw new Error('The npm package @nimblescape/plantuml is missing: run node scripts/install-plantuml.mjs.');
}
for (const folder of ['media/plantuml', 'cli/dist/plantuml']) {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.cpSync(`${plantUml}/dist/page`, folder, { recursive: true });
  fs.copyFileSync(`${plantUml}/THIRD-PARTY-NOTICES.md`, `${folder}/THIRD-PARTY-NOTICES.md`);
}

// The script of the page of the PDF that draws the diagrams of Mermaid on the command line, for the browser. It holds
// more than 60 packages: without the spaces and with the shorter forms of the syntax, but with the names of the
// source, it has about 12 MB. Its notices, written from the installed packages, go beside it.
fs.rmSync('cli/dist/mermaid', { recursive: true, force: true });
const mermaid = await esbuild.build({
  entryPoints: { mermaid: 'src/page/mermaid.ts' },
  outdir: 'cli/dist/mermaid',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  chunkNames: 'chunk-[hash]',
  sourcemap: !production,
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});
const notices = thirdPartyNotices(
  mermaid.metafile,
  `# Third-party notices of the diagrams of Mermaid

The files \`mermaid.js\` and \`chunk-*.js\` of this folder draw the diagrams of Mermaid in the PDF of the command
\`markdownpaper\` of nimblescape Markdown Paper. esbuild bundled them from the script \`src/page/mermaid.ts\` of
<https://github.com/nimblescape/markdownpaper-vscode>, under the MIT License, and the npm packages of this list. The
package \`@mermaid-js/layout-elk\` contains parts of Mermaid and of packages that Mermaid uses, such as KaTeX,
DOMPurify and Cytoscape, in other versions; this list names their licenses. The build of the package writes this list
from the installed packages: their versions, the licenses that their manifests name, the places of their source code and
the texts of their license and notice files.`,
);
if (notices.missing.length > 0) {
  throw new Error(`The packages ${notices.missing.join(', ')} of the script of Mermaid hold no text of their license.`);
}
fs.writeFileSync('cli/dist/mermaid/THIRD-PARTY-NOTICES.md', notices.text);

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
