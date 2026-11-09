// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// `node scripts/install-markdown.mjs`, also a part of the script "postinstall" of `npm install` and `npm ci`: installs
// the npm packages of nimblescape Markdown: the renderer and the layout, with which the extension and the command make
// the pages and the PDF (docs/requirements.md, R-GEN-010), and the editor, for which the plugins of this extension for
// the editor of rendered Markdown are built (R-GEN-003): the types of the editor and the entry point
// `@nimblescape/markdowneditor/bundle`, whose plugin of esbuild makes the bundle of the plugins use the modules of the
// page of the editor. This is the same mechanism as in nimblescape Markdown Notes. Before the release of nimblescape
// Markdown the packages are not on npmjs.com, and npm cannot install a folder of a repository. So the script fetches the
// commit below of the GitHub repository into a temporary folder, installs its locked development tools without install
// scripts, builds its packages and packs them, and installs the packed packages with their libraries, without a change
// of package.json and package-lock.json. The libraries of the packages get the versions of the lock file of
// nimblescape Markdown at the commit, with which its tests ran, so that a new version of a library on npmjs.com
// changes nothing here. The file .commit in the folder of each package names the commit; when it
// names the commit below, the script does nothing. The repository is public, so git, also in CI, fetches it without a
// token; CI runs this script after `npm ci --ignore-scripts`. After the release of nimblescape Markdown, the packages become development dependencies of package.json, and this
// script goes away (CONTRIBUTING.md).
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository and the commit of nimblescape Markdown whose packages the extension and the command use. */
const repository = 'https://github.com/nimblescape/markdown.git';
const commit = '480031b83ef8bb9d034e0ad974f9921916fc3267';
/** The packages that the extension and the command use, each with the packages of nimblescape Markdown that it depends on. */
const packages = ['markdowntext', 'markdownrender', 'markdownlayout', 'markdowneditor'];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const folderOf = (name) => path.join(root, 'node_modules', '@nimblescape', name);
// npm is a .cmd file on Windows, which needs a shell.
const shell = process.platform === 'win32';

/**
 * run runs a program in a folder and stops the script when the program fails.
 * @param program - The program.
 * @param args - Its arguments.
 * @param cwd - The folder.
 * @param env - The environment of the program.
 * @returns The standard output.
 */
function run(program, args, cwd, env = process.env) {
  const result = spawnSync(program, args, { cwd, env, shell, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed${result.error ? `: ${result.error.message}` : ` with the exit code ${result.status}`}.`);
  }
  return result.stdout;
}

/**
 * packOf returns the description of the one package that `npm pack --json` packed: npm 10 and 11 write a list of the
 * packed packages, npm 12 an object with the name of each package as its key.
 * @param output - The standard output of `npm pack --json`.
 */
function packOf(output) {
  const result = JSON.parse(output);
  return (Array.isArray(result) ? result : Object.values(result))[0];
}

/**
 * parentOf returns the place in a lock file above a place: `node_modules/a` above `node_modules/a/node_modules/b`, and
 * the root, the empty text, above `node_modules/a` and above a workspace such as `packages/markdowntext`.
 * @param place - The place.
 */
const parentOf = (place) => {
  const index = place.lastIndexOf('/node_modules/');
  return index < 0 ? '' : place.slice(0, index);
};

/**
 * lockedVersions returns the overrides of npm that give the libraries of each package, also the libraries of its
 * libraries, the versions of the lock file of the clone of nimblescape Markdown, for example
 * `{ "@nimblescape/markdowntext": { "diff": "9.0.0" } }`. They apply only below the package, so the libraries of this
 * repository keep the versions of its own lock file. A library is found from the place of the package that depends on
 * it, as Node.js finds it: in the folder node_modules of that place, then of each place above it. A library with two
 * versions below a package keeps the versions of its ranges.
 * @param clone - The folder of the clone of nimblescape Markdown.
 */
function lockedVersions(clone) {
  const locked = JSON.parse(fs.readFileSync(path.join(clone, 'package-lock.json'), 'utf8')).packages;
  const overrides = {};
  for (const name of packages) {
    const versions = new Map();
    const seen = new Set();
    const visit = (place) => {
      const entry = locked[place];
      for (const library of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies })) {
        let found;
        for (let at = place; found === undefined; at = parentOf(at)) {
          const candidate = `${at ? `${at}/` : ''}node_modules/${library}`;
          if (locked[candidate]) {
            found = candidate;
          } else if (!at) {
            break;
          }
        }
        if (found === undefined || seen.has(found) || library.startsWith('@nimblescape/')) {
          continue;
        }
        seen.add(found);
        versions.set(library, new Set([...(versions.get(library) ?? []), locked[found].version]));
        visit(found);
      }
    };
    visit(`packages/${name}`);
    overrides[`@nimblescape/${name}`] = Object.fromEntries([...versions].filter(([, each]) => each.size === 1).map(([library, each]) => [library, [...each][0]]));
  }
  return overrides;
}

/** installed is true when each package is installed from the commit above. */
const installed = packages.every((name) => {
  const marker = path.join(folderOf(name), '.commit');
  return fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === commit;
});
if (installed) {
  process.exit(0);
}
console.log(`Installing the packages of nimblescape Markdown from ${repository} at ${commit.slice(0, 7)}`);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-markdown-'));
try {
  const clone = path.join(work, 'markdown');
  const packs = path.join(work, 'packs');
  fs.mkdirSync(clone);
  fs.mkdirSync(packs);
  run('git', ['init', '--quiet'], clone);
  run('git', ['fetch', '--quiet', '--depth', '1', repository, commit], clone);
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'], clone);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error'], clone);
  run('npm', ['run', 'build', '--silent'], clone);
  const files = [];
  for (const name of packages) {
    const pack = packOf(run('npm', ['pack', `./packages/${name}`, '--pack-destination', packs, '--json', '--loglevel', 'error'], clone));
    files.push(path.join(packs, pack.filename));
  }
  // The packed packages with the libraries that they depend on, in the versions of the lock file of the clone: npm
  // reads them from the field overrides of package.json, which has them only while npm runs. The packages of
  // nimblescape Markdown depend on each other in the same version, so npm takes the packed ones.
  const manifest = path.join(root, 'package.json');
  const original = fs.readFileSync(manifest, 'utf8');
  try {
    fs.writeFileSync(manifest, `${JSON.stringify({ ...JSON.parse(original), overrides: lockedVersions(clone) }, null, 2)}\n`);
    run('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error', ...files], root);
  } finally {
    fs.writeFileSync(manifest, original);
  }
  for (const name of packages) {
    fs.writeFileSync(path.join(folderOf(name), '.commit'), `${commit}\n`);
  }
  console.log(`Installed ${packages.map((name) => `@nimblescape/${name}`).join(', ')}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
