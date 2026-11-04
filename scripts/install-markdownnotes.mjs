// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// `node scripts/install-markdownnotes.mjs`, also a part of the script "postinstall" of `npm install` and `npm ci`:
// installs the npm package @nimblescape/markdownnotes of nimblescape Markdown Notes, whose library formatMarkdown formats
// the notes and the Markdown of a paper in `mp format` before the steps of the paper (docs/requirements.md, R-CLI-002),
// into node_modules/@nimblescape/markdownnotes. Before the release of Markdown Notes the package is not on npmjs.com,
// and npm cannot install a folder of a repository (decision 36). So the script fetches the commit below of the GitHub
// repository into a temporary folder and builds it as the CI of Markdown Notes does: it installs its locked development
// tools without install scripts, then the packages of nimblescape Markdown with its own script, and runs its production
// build (esbuild.mjs --production). Then it copies the files that `npm pack ./cli` packs. The file .commit in the folder
// of the package names the commit; when it names the commit below, the script does nothing. The repository is public, so
// git, also in CI, fetches it without a token. It runs after scripts/install-markdown.mjs, whose `npm install` removes
// the folder of a package that package.json does not name. After the release of Markdown Notes, the package becomes a
// development dependency of package.json, and this script goes away (CONTRIBUTING.md, "The formatter of Markdown
// Notes").
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository and the commit of Markdown Notes whose package the command uses. */
const repository = 'https://github.com/nimblescape/markdownnotes-vscode.git';
const commit = '3d91238a5c8f1def3ac45aa3d34a0d8c123e8d4b';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'node_modules', '@nimblescape', 'markdownnotes');
const marker = path.join(target, '.commit');
// npm is a .cmd file on Windows, which needs a shell.
const shell = process.platform === 'win32';

/**
 * run runs a program in a folder and stops the script when the program fails.
 * @param program - The program.
 * @param args - Its arguments.
 * @param cwd - The folder.
 * @returns The standard output.
 */
function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, shell, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed${result.error ? `: ${result.error.message}` : ` with the exit code ${result.status}`}.`);
  }
  return result.stdout;
}

const installed = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
if (installed === commit) {
  process.exit(0);
}
console.log(`Installing @nimblescape/markdownnotes from ${repository} at ${commit.slice(0, 7)}`);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-markdownnotes-'));
try {
  run('git', ['init', '--quiet'], work);
  run('git', ['fetch', '--quiet', '--depth', '1', repository, commit], work);
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'], work);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error'], work);
  run('node', ['scripts/install-markdown.mjs'], work);
  run('node', ['esbuild.mjs', '--production'], work);
  const [pack] = JSON.parse(run('npm', ['pack', './cli', '--dry-run', '--json', '--loglevel', 'error'], work));
  fs.rmSync(target, { recursive: true, force: true });
  for (const { path: file } of pack.files) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.copyFileSync(path.join(work, 'cli', file), path.join(target, file));
  }
  fs.writeFileSync(marker, `${commit}\n`);
  console.log(`Installed @nimblescape/markdownnotes ${pack.version} (${pack.files.length} files)`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
