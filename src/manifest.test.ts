// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the parts of the extension that are files, not code: the name and the entry point of the
 * manifest, the commands and their buttons, the settings and their documentation, the files of the package and of the
 * npm package, the third-party notices, the links of the documents and the links to the requirements. No installed
 * editor is touched.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import { expect, test, vi } from 'vitest';
import { commands, extensionId } from './extension';
import { drawingsCss, lightThemeColors } from './paper/extensionStyles';
import { sectionCodes } from './paper/layout';
import { paperDocumentKey } from './paperDocuments';
import { defaults, settingsSection } from './settings';
// @ts-expect-error The script of the build has no declarations.
import { packageFolders, thirdPartyNotices } from '../scripts/third-party-notices.mjs';

// The modules of the extension import the editor API; these tests read only their constants.
vi.mock('vscode', () => ({}));

/** repository is the root folder of this repository, which holds the manifest and the documents. */
const repository = path.resolve(__dirname, '..');

/**
 * read returns the text of a file of the repository.
 * @param file - The path of the file, relative to the repository.
 */
const read = (file: string): string => fs.readFileSync(path.join(repository, file), 'utf8');

/** manifest is the extension manifest. */
const manifest = JSON.parse(read('package.json'));

/** raw is the plugin of esbuild.mjs for the imports with the suffix ?raw, for the builds of these tests. */
const raw: esbuild.Plugin = {
  name: 'raw',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    build.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  },
};

/**
 * markdownLinks returns the targets of the inline links of a Markdown text outside code blocks and code spans.
 * @param text - The Markdown text.
 */
const markdownLinks = (text: string): string[] => {
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
};

/**
 * anchorOf returns the anchor of a heading as GitHub writes it: lower case, without punctuation, with hyphens for
 * spaces.
 * @param heading - The text of the heading.
 */
const anchorOf = (heading: string): string => `#${heading.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-')}`;

/**
 * sourceFiles returns the TypeScript files of a folder of the repository and its subfolders.
 * @param folder - The folder, relative to the repository.
 */
const sourceFiles = (folder: string): string[] =>
  fs
    .readdirSync(path.join(repository, folder), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join(folder, file));

test('the manifest follows the naming scheme of the publisher nimblescape: the repository of nimblescape-<name> is <name>-vscode (R-GEN-005)', () => {
  expect(manifest.publisher).toBe('nimblescape');
  expect(manifest.name).toBe('nimblescape-markdownpaper');
  expect(manifest.displayName).toBe('nimblescape Markdown Paper');
  const repositoryName = `${manifest.name.replace(/^nimblescape-/, '')}-vscode`;
  expect(manifest.repository.url).toBe(`https://github.com/nimblescape/${repositoryName}.git`);
  expect(manifest.bugs.url).toBe(`https://github.com/nimblescape/${repositoryName}/issues`);
  expect(manifest.qna).toBe(`https://github.com/nimblescape/${repositoryName}/issues`);
  expect(manifest.license).toBe('MIT');
  expect(extensionId).toBe(`${manifest.publisher}.${manifest.name}`);
});

test('the entry point is the bundle that esbuild.mjs writes', () => {
  expect(manifest.main).toBe('./dist/extension.js');
  expect(read('esbuild.mjs')).toContain(`entryPoints: ['src/extension.ts'], outfile: '${manifest.main.slice(2)}'`);
});

test('the icon is a PNG of 256 × 256 pixels, because the Marketplace takes no SVG icon', () => {
  expect(manifest.icon).toBe('resources/icon.png');
  const png = fs.readFileSync(path.join(repository, manifest.icon));
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
});

test('the manifest contributes the commands of the extension, and no other', () => {
  const contributed = manifest.contributes.commands.map((command: { command: string }) => command.command);
  expect(contributed.sort()).toEqual(Object.values(commands).sort());
  for (const command of manifest.contributes.commands) {
    expect(command.category, command.command).toBe('Markdown Paper');
  }
});

test('"Show Page Preview" is a button of the title of a paper document, and "Export PDF" a button of its menu "Run" and of its Markdown preview (R-PRV-001, R-PDF-001, R-DOC-004)', () => {
  const menus = manifest.contributes.menus;
  expect(menus['editor/title']).toContainEqual({ command: commands.showPagePreview, group: 'navigation', when: `editorLangId == markdown && ${paperDocumentKey}` });
  expect(menus['editor/title/run']).toContainEqual({ command: commands.exportPdf, when: `(editorLangId == markdown || activeWebviewPanelId == 'markdown.preview') && ${paperDocumentKey}` });
  expect(manifest.activationEvents).toEqual(['onLanguage:markdown']);
});

test('the pages are part of the Markdown preview of VS Code: a markdown-it plugin, a script and a style, and no keys or views of their own (R-PRV-005)', () => {
  const contributes = manifest.contributes;
  expect(contributes['markdown.markdownItPlugins']).toBe(true);
  expect(contributes['markdown.previewScripts']).toEqual(['./media/paperPreview.js']);
  expect(contributes['markdown.previewStyles']).toEqual(['./media/paperPreview.css']);
  expect(contributes).not.toHaveProperty('keybindings');
  expect(contributes).not.toHaveProperty('customEditors');
  expect(JSON.stringify(contributes.menus)).not.toContain('hasCustomMarkdownPreview');
});

test('the style of the pages in the Markdown preview has the colors of the theme and the rules of the diagrams of the PDF (R-PRV-005, R-REN-010)', () => {
  const css = fs.readFileSync(path.join(repository, 'media', 'paperPreview.css'), 'utf8');
  for (const [name, value] of Object.entries(lightThemeColors)) {
    expect(css).toContain(`${name}: ${value} !important;`);
  }
  expect(css.replace(/\s+/g, '')).toContain(drawingsCss.replace(/\s+/g, ''));
});

test('the extension uses no proposed API, and the API of the oldest VS Code version that it supports (R-GEN-002)', () => {
  // The Marketplace does not accept an extension that enables a proposed API.
  expect(manifest).not.toHaveProperty('enabledApiProposals');
  // The types of the API are those of the version in engines.vscode, so the code compiles only with its API.
  expect(manifest.engines.vscode).toMatch(/^\^\d+\.\d+\.0$/);
  expect(manifest.devDependencies['@types/vscode']).toBe(`~${manifest.engines.vscode.slice(1)}`);
});

test('the extension runs in Restricted Mode, where a workspace cannot name the program of the browser, and in virtual workspaces (R-GEN-002)', () => {
  expect(manifest.capabilities.untrustedWorkspaces.supported).toBe('limited');
  expect(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations).toEqual([`${settingsSection}.browserPath`]);
  expect(manifest.capabilities.virtualWorkspaces.supported).toBe('limited');
  expect(manifest.extensionKind).toEqual(['workspace']);
  // A setting of the scope "machine" comes only from the settings of the user, never from a workspace.
  expect(manifest.contributes.configuration.properties[`${settingsSection}.browserPath`].scope).toBe('machine');
});

test('the manifest contributes the settings of src/settings.ts with their defaults (R-SET-001)', () => {
  const properties = manifest.contributes.configuration.properties;
  const contributed = Object.fromEntries(Object.entries<{ default: unknown }>(properties).map(([key, value]) => [key, value.default]));
  const expected = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [`${settingsSection}.${key}`, value]));
  expect(contributed).toEqual(expected);
});

test('the README, the guide and the requirements name every setting that the manifest contributes', () => {
  for (const setting of Object.keys(manifest.contributes.configuration.properties)) {
    expect(read('README.md'), `README.md does not name ${setting}`).toContain(`\`${setting}\``);
    expect(read('docs/guide.md'), `docs/guide.md does not name ${setting}`).toContain(`\`${setting}\``);
    expect(read('docs/requirements.md'), `docs/requirements.md does not name ${setting}`).toContain(`\`${setting.slice(settingsSection.length + 1)}\``);
  }
});

test('the package holds the bundle, Paged.js, the page files of @nimblescape/plantuml, the scripts and the style of the pages in the Markdown preview, the built-in layouts, the icon and the documents only', () => {
  const patterns = read('.vscodeignore')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'));
  expect(patterns).toEqual([
    '**',
    '!dist/extension.js',
    '!media/paged.js',
    '!media/paged.polyfill.js',
    '!media/plantuml/**',
    '!media/paperHandlers.js',
    '!media/paperPreview.css',
    '!media/paperPreview.js',
    '!layouts/**',
    '!schemas/layout.schema.json',
    '!resources/icon.png',
    '!package.json',
    '!README.md',
    '!CHANGELOG.md',
    '!SUPPORT.md',
    '!LICENSE',
    '!THIRD-PARTY-NOTICES.md',
  ]);
  // The build writes dist/ and copies Paged.js and the page files of @nimblescape/plantuml into media/ (esbuild.mjs).
  const built = (pattern: string) => pattern.startsWith('!dist/') || pattern.startsWith('!media/paged.') || pattern.startsWith('!media/plantuml/');
  for (const pattern of patterns.filter((pattern) => pattern.startsWith('!') && !built(pattern))) {
    expect(fs.existsSync(path.join(repository, pattern.slice(1).replace('/**', ''))), pattern).toBe(true);
  }
});

test('the schema of layout.json checks layout.json in a layout folder, and names each part that the renderer reads (R-LAY-002)', () => {
  expect(manifest.contributes.jsonValidation).toEqual([{ fileMatch: ['**/layouts/*/layout.json'], url: './schemas/layout.schema.json' }]);
  const schema = JSON.parse(read('schemas/layout.schema.json'));
  const layoutJson = read('docs/layout.md').split('## 3. `layout.json`')[1].split('## 4.')[0];
  const parts = [...layoutJson.matchAll(/^\| `([a-zA-Z.]+)`(?:, `([a-zA-Z.]+)`)? \|/gm)].flatMap((match) => [match[1], match[2]]).filter((part) => part && !part.includes('.'));
  expect(parts).toContain('fields');
  for (const part of parts) {
    expect(schema.properties, `the schema has no ${part}`).toHaveProperty(part);
  }
  expect(Object.keys(schema.properties.fields.additionalProperties.anyOf[1].properties)).toEqual(['description', 'required', 'default', 'values']);
  expect(schema.properties.terms.propertyNames.enum).toEqual([...sectionCodes, 'figure', 'table', 'listing', 'appendix']);
  expect(JSON.parse(read('layouts/plain/layout.json')).format).toMatch(new RegExp(schema.properties.format.pattern));
});

test('the package needs no dependency at run time, because the bundle holds every package', () => {
  expect(manifest).not.toHaveProperty('dependencies');
  expect(manifest.scripts.package).toBe('vsce package --no-dependencies');
  expect(manifest).not.toHaveProperty('extensionDependencies');
});

/** cli is the manifest of the npm package of the command markdownpaper (R-CLI-001). */
const cli = JSON.parse(read('cli/package.json'));

test('the npm package has the version of the extension, the command markdownpaper and a public scope (R-CLI-001)', () => {
  expect(cli.name).toBe('@nimblescape/markdownpaper');
  expect(cli.version, 'the release sets one version in both manifests').toBe(manifest.version);
  const lock = JSON.parse(read('cli/package-lock.json'));
  expect([lock.version, lock.packages[''].version]).toEqual([cli.version, cli.version]);
  expect(cli.bin).toEqual({ markdownpaper: 'dist/markdownpaper.js' });
  expect(cli.publishConfig).toEqual({ access: 'public' });
  expect(cli.license).toBe(manifest.license);
  expect(cli.repository).toEqual({ type: 'git', url: `git+${manifest.repository.url}`, directory: 'cli' });
  expect(cli.engines).toEqual({ node: '>=22' });
  expect(read('esbuild.mjs')).toContain(`outfile: 'cli/${cli.bin.markdownpaper}', target: 'node22'`);
  expect(cli).not.toHaveProperty('dependencies');
});

/**
 * filesOf returns the files of a folder of the repository and its subfolders, as paths with slashes in that folder, or
 * no files for a missing folder.
 * @param folder - The path of the folder in the repository.
 */
const filesOf = (folder: string): string[] =>
  fs.existsSync(path.join(repository, folder))
    ? fs
        .readdirSync(path.join(repository, folder), { recursive: true, encoding: 'utf8' })
        .filter((file) => fs.statSync(path.join(repository, folder, file)).isFile())
        .map((file) => file.split(path.sep).join('/'))
    : [];

test('the npm package holds the bundle, Paged.js, the page files of @nimblescape/plantuml, the script of Mermaid, the built-in layouts, the notices, the README and the license (npm pack --dry-run)', () => {
  const listed = execFileSync('npm', ['pack', './cli', '--dry-run', '--json'], { cwd: repository, encoding: 'utf8' });
  const files = (JSON.parse(listed) as { files: { path: string }[] }[])[0].files.map((file) => file.path);
  // The build writes dist/ with the layouts, the page files of @nimblescape/plantuml with its notices, the script of
  // Mermaid in parts with its notices, LICENSE and THIRD-PARTY-NOTICES.md (esbuild.mjs). The source maps of a
  // development build stay out.
  const built = (file: string) => file === 'LICENSE' || file === 'THIRD-PARTY-NOTICES.md' || file.startsWith('dist/');
  const layouts = filesOf('layouts').map((file) => `dist/layouts/${file}`);
  const plantUml = [...filesOf('node_modules/@nimblescape/plantuml/dist/page'), 'THIRD-PARTY-NOTICES.md'].map((file) => `dist/plantuml/${file}`);
  const mermaid = filesOf('cli/dist/mermaid')
    .filter((file) => !file.endsWith('.map'))
    .map((file) => `dist/mermaid/${file}`);
  const expected = ['LICENSE', 'README.md', 'THIRD-PARTY-NOTICES.md', 'package.json', 'dist/markdownpaper.js', 'dist/paged.polyfill.js', ...layouts, ...plantUml, ...mermaid].filter(
    (file) => !built(file) || fs.existsSync(path.join(repository, 'cli', file)),
  );
  expect(files.sort()).toEqual(expected.sort());
}, 60_000);

test('the bundle of the command markdownpaper imports only modules of Node.js (R-CLI-001)', async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(repository, 'src/cli/main.ts')],
    bundle: true,
    platform: 'node',
    write: false,
    outdir: path.join(repository, 'out/manifest-test'),
    metafile: true,
    logLevel: 'silent',
    plugins: [raw],
  });
  const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports.map((imported) => imported.path));
  for (const imported of imports) {
    expect(imported.startsWith('node:') || builtinModules.includes(imported), imported).toBe(true);
  }
});

test('the third-party notices name every package that the build bundles, and the packages of Paged.js, with its version and license (R-GEN-004)', async () => {
  const notices = read('THIRD-PARTY-NOTICES.md');
  const result = await esbuild.build({
    entryPoints: [path.join(repository, 'src/extension.ts'), path.join(repository, 'src/cli/main.ts')],
    bundle: true,
    platform: 'node',
    external: ['vscode'],
    write: false,
    outdir: path.join(repository, 'out/manifest-test'),
    metafile: true,
    logLevel: 'silent',
    plugins: [raw],
  });
  // The folder of a package is the part of the path up to the name after the last node_modules.
  const packages = new Set<string>(['node_modules/pagedjs']);
  for (const input of Object.keys(result.metafile.inputs)) {
    const folder = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1];
    if (folder) {
      packages.add(folder);
    }
  }
  expect(packages.size).toBeGreaterThan(1);
  const headings = [...notices.matchAll(/^## (.+)$/gm)].map((match) => anchorOf(match[1]));
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const folder of packages) {
    const { name, version, license } = JSON.parse(fs.readFileSync(path.join(repository, folder, 'package.json'), 'utf8'));
    const row = new RegExp(String.raw`^\| \[${escape(name)}\]\((#[^)]+)\) \| ${escape(version)} \| ${escape(license)} \|$`, 'm').exec(notices);
    expect(row, name).not.toBeNull();
    expect(headings, name).toContain(row![1]);
  }
  // Paged.js is a file of its own, which the build copies; its header names its version.
  const pagedJs = JSON.parse(read('node_modules/pagedjs/package.json')).version;
  expect(fs.readFileSync(path.join(repository, 'node_modules/pagedjs/dist/paged.polyfill.js'), 'utf8').slice(0, 200)).toContain(`Paged.js v${pagedJs}`);
});

test('the notices of the script of Mermaid name every package that it bundles, with its version, its license and the text of its license (R-REN-016, R-GEN-004)', async () => {
  const result = await esbuild.build({
    entryPoints: { mermaid: path.join(repository, 'src/page/mermaid.ts') },
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    outdir: path.join(repository, 'out/manifest-test'),
    metafile: true,
    logLevel: 'silent',
  });
  const folders = packageFolders(result.metafile) as string[];
  expect(folders).toContain('node_modules/mermaid');
  expect(folders).toContain('node_modules/@mermaid-js/layout-elk');
  const { text, missing } = thirdPartyNotices(result.metafile, '# Notices') as { text: string; missing: string[] };
  expect(missing).toEqual([]);
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => anchorOf(match[1]));
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const folder of folders) {
    const { name, version } = JSON.parse(fs.readFileSync(path.join(repository, folder, 'package.json'), 'utf8'));
    const row = new RegExp(String.raw`^\| \[${escape(name)}\]\((#[^)]+)\) \| ${escape(version)} \| [^|]+ \|$`, 'm').exec(text);
    expect(row, name).not.toBeNull();
    expect(headings, name).toContain(row![1]);
  }
  // The version of Mermaid is the version of the Mermaid extension of VS Code (R-REN-016).
  expect(manifest.devDependencies.mermaid).toBe(JSON.parse(read('node_modules/mermaid/package.json')).version);
}, 60_000);

test('the documents of the package use full links, so that each link works in the repository, in the package and on the Marketplace', () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'SUPPORT.md', 'cli/README.md']) {
    for (const target of markdownLinks(read(file))) {
      expect(target, `${file}: ${target}`).toMatch(/^https:\/\//);
    }
  }
});

test('the description adds no search tag, for example of another programming language', async () => {
  // vsce adds a tag for each of its keywords that the description contains, for example "java" for "Java".
  const { TagsProcessor } = createRequire(__filename)('@vscode/vsce/out/package');
  const tags = async (description: string): Promise<string[]> => {
    const processor = new TagsProcessor({ ...manifest, description });
    await processor.onEnd();
    return processor.tags;
  };
  expect(await tags(manifest.description)).toEqual(await tags(''));
});

test('every requirement has a unique ID, and every link to a requirement or a section of the requirements names an existing one', () => {
  const requirements = read('docs/requirements.md');
  const ids = [...requirements.matchAll(/^### (R-[A-Z]+-\d{3})$/gm)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  // The sections, for example "Plan" and "Decisions", are targets too.
  const sections = [...requirements.matchAll(/^## (.+)$/gm)].map((match) => anchorOf(match[1]));
  const anchors = new Set([...ids.map((id) => `#${id.toLowerCase()}`), ...sections]);
  for (const target of markdownLinks(requirements).filter((target) => target.startsWith('#'))) {
    expect(anchors.has(target), target).toBe(true);
  }
  for (const file of ['docs/guide.md', 'CONTRIBUTING.md']) {
    for (const target of markdownLinks(read(file)).filter((target) => /requirements\.md#/.test(target))) {
      expect(anchors.has(target.slice(target.indexOf('#'))), `${file}: ${target}`).toBe(true);
    }
  }
  // The comments of the code link to the requirements that the code implements.
  for (const file of sourceFiles('src')) {
    for (const [, target] of read(file).matchAll(/\]\((?:\.\.\/)+docs\/requirements\.md(#[^)]+)\)/g)) {
      expect(anchors.has(target), `${file}: ${target}`).toBe(true);
    }
  }
  // An ID that a test, the code or a document names without a link exists too.
  for (const file of [...sourceFiles('src'), ...sourceFiles('test'), 'media/paperPreview.js', 'docs/guide.md', 'CONTRIBUTING.md']) {
    for (const [id] of read(file).matchAll(/\bR-[A-Z]+-\d{3}\b/g)) {
      expect(ids, `${file}: ${id}`).toContain(id);
    }
  }
});

test('every link of the user guide to one of its sections names an existing heading', () => {
  const text = read('docs/guide.md');
  const anchors = new Set([...text.matchAll(/^#{2,4} (.+)$/gm)].map((match) => anchorOf(match[1])));
  for (const target of markdownLinks(text).filter((target) => target.startsWith('#'))) {
    expect(anchors.has(target), `docs/guide.md: ${target}`).toBe(true);
  }
});
