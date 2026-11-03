// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// `node scripts/install-markdown.mjs`, also a part of the script "postinstall" of `npm install` and `npm ci`: installs
// the npm packages of nimblescape Markdown, for which the plugins of this extension for the editor of rendered Markdown
// are built (docs/requirements.md, R-GEN-003): the types of the editor and the entry point
// `@nimblescape/markdowneditor/bundle`, whose plugin of esbuild makes the bundle of the plugins use the modules of the
// page of the editor. This is the same mechanism as in nimblescape Markdown Notes. Before the release of nimblescape
// Markdown the packages are not on npmjs.com, and npm cannot install a folder of a repository. So the script fetches the
// commit below of the GitHub repository into a temporary folder, installs its locked development tools without install
// scripts, builds its packages and packs them, and installs the packed packages with their libraries, without a change
// of package.json and package-lock.json. The file .commit in the folder of each package names the commit; when it
// names the commit below, the script does nothing. The repository is private before the release: where the git of the
// computer cannot read it, for example in CI, the environment variable NIMBLESCAPE_MARKDOWN_TOKEN gives a token that
// may read it. The script gives git the token through the environment, never as an argument, so that no message shows
// it. After the release of nimblescape Markdown, the packages become development dependencies of package.json, and this
// script goes away (CONTRIBUTING.md).
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository and the commit of nimblescape Markdown whose packages the plugins of the editor use. */
const repository = 'https://github.com/nimblescape/markdown.git';
const commit = 'ec5429096e1292b0c19f89b46e695eee9a62c4bd';
/** The packages that the plugins of the editor use, each with the packages of nimblescape Markdown that it depends on. */
const packages = ['markdowntext', 'markdownrender', 'markdowneditor'];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const folderOf = (name) => path.join(root, 'node_modules', '@nimblescape', name);
// npm is a .cmd file on Windows, which needs a shell.
const shell = process.platform === 'win32';

/**
 * gitEnvironment is the environment of git: with a token, the header of each request to GitHub carries it.
 * @returns The environment.
 */
function gitEnvironment() {
  const token = process.env.NIMBLESCAPE_MARKDOWN_TOKEN?.trim();
  if (!token) {
    return process.env;
  }
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

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
  run('git', ['fetch', '--quiet', '--depth', '1', repository, commit], clone, gitEnvironment());
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'], clone);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error'], clone);
  run('npm', ['run', 'build', '--silent'], clone);
  const files = [];
  for (const name of packages) {
    const [pack] = JSON.parse(run('npm', ['pack', `./packages/${name}`, '--pack-destination', packs, '--json', '--loglevel', 'error'], clone));
    files.push(path.join(packs, pack.filename));
  }
  // The packed packages with the libraries that they depend on, in the versions of their ranges. The packages of
  // nimblescape Markdown depend on each other in the same version, so npm takes the packed ones.
  run('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error', ...files], root);
  for (const name of packages) {
    fs.writeFileSync(path.join(folderOf(name), '.commit'), `${commit}\n`);
  }
  console.log(`Installed ${packages.map((name) => `@nimblescape/${name}`).join(', ')}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
