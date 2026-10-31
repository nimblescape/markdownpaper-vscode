// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the built command mp (cli/dist/mp.js, npm run test:cli) on Linux and macOS
// (R-CLI-001). Each test runs the command in a folder in the temporary folder of the system with the Node.js of the
// tests, as a person, a program or an AI agent runs it after `npm install` or with npx. The test of the PDF runs when
// a Chrome, Chromium or Edge is installed, as on the runners of GitHub, or MARKDOWNPAPER_BROWSER names one.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { findBrowser } from '../../src/pdf/browser';
import { Browser } from '../../src/pdf/cdp';

const repository = path.resolve(import.meta.dirname, '../..');
const command = path.join(repository, 'cli', 'dist', 'mp.js');
const cli = JSON.parse(fs.readFileSync(path.join(repository, 'cli', 'package.json'), 'utf8'));

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

/** A new temporary folder. */
function temporary(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-cli-'));
  folders.push(folder);
  return folder;
}

/** Runs the command in `cwd` with the arguments, and the environment if given; returns its exit code and its output. */
function run(cwd: string, args: string[], timeout = 30_000, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [command, ...args], { cwd, encoding: 'utf8', timeout, ...(env ? { env } : {}) });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** browser is the installed browser of the PDF, or undefined. */
const browser = (() => {
  try {
    return findBrowser();
  } catch {
    return undefined;
  }
})();

describe('the command mp', () => {
  it('shows its version and the version of the format of the layouts', () => {
    expect(run(temporary(), ['--version'])).toEqual({ code: 0, stdout: `mp ${cli.version} (layouts: nimblescape-layout 1.0.0)\n`, stderr: '' });
  });

  it('clones a layout on GitHub for a new project and the repositories of its paper with Git (R-CLI-004)', () => {
    // Git reaches the repositories of a temporary folder in place of those of GitHub.
    const remotes = temporary();
    // The request to GitHub of get, whether a repository is public, reaches no host: a proxy that refuses each connection.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(remotes).href}/.insteadOf`,
      GIT_CONFIG_VALUE_0: 'https://github.com/',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      NO_PROXY: '',
    };
    delete env.GITHUB_TOKEN;
    delete env.GH_TOKEN;
    delete env.https_proxy;
    delete env.no_proxy;
    const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.org', ...args], { cwd, encoding: 'utf8' });
    for (const [repository, files] of [
      ['school/layouts.git', { 'thesis/layout.json': JSON.stringify({ format: 'nimblescape-layout 1.0.0', name: 'Thesis', stylesheets: [], document: 'document.md', preview: 'document.pdf' }), 'thesis/document.md': '# Start\n' }],
      ['org/server.git', { 'src/api.ts': 'export const a = 1;\n' }],
    ] as const) {
      const work = path.join(remotes, repository);
      fs.mkdirSync(work, { recursive: true });
      git(work, 'init', '--quiet', '--initial-branch=main');
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
        fs.writeFileSync(path.join(work, file), content);
      }
      git(work, 'add', '--all');
      git(work, 'commit', '--quiet', '-m', 'files');
      git(work, 'tag', 'v1.0.0');
    }
    const folder = temporary();
    expect(run(folder, ['create', 'project', '--yes', '--layout', 'school/layouts/thesis@v1.0.0'], 30_000, env).code).toBe(0);
    const project = path.join(folder, 'project');
    expect(fs.readFileSync(path.join(project, 'paper', 'paper.md'), 'utf8')).toContain('layout: school/layouts/thesis@v1.0.0\n');
    const got = run(project, ['get', 'org/server@v1.0.0'], 30_000, env);
    expect(got).toMatchObject({ code: 0, stderr: '' });
    expect(got.stdout).toMatch(/^server: org\/server@v1\.0\.0 at [0-9a-f]{7} \(new clone\)\npaper\/paper\.md: server: org\/server@v1\.0\.0\n$/);
    expect(fs.readFileSync(path.join(project, '.markdownpaper', 'repos', 'server', 'src', 'api.ts'), 'utf8')).toBe('export const a = 1;\n');
    expect(fs.readFileSync(path.join(project, '.markdownpaper', 'repos', 'server', '.git', 'config'), 'utf8')).not.toContain('markdownpaper');
    expect(run(project, ['check', 'paper/paper.md'], 30_000, env)).toEqual({ code: 0, stdout: 'paper/paper.md: no problems\n', stderr: '' });
  });

  it('scaffolds a project without questions, which the check accepts', () => {
    const folder = temporary();
    const created = run(folder, ['create', 'paper-project', '--yes', '--layout', 'plain', '--language', 'de-AT', '--title', 'Agenten', '--author', 'Hannes Stauss']);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain(path.join('paper-project', 'paper', 'paper.md'));
    expect(run(folder, ['check', 'paper-project/paper/paper.md'])).toEqual({ code: 0, stdout: 'paper-project/paper/paper.md: no problems\n', stderr: '' });
  });

  it('prints the rules of the layouts for an AI agent', () => {
    const result = run(temporary(), ['instructions', 'layout']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"format": "nimblescape-layout 1.0.0"');
  });

  it.skipIf(!browser)('writes the PDF of a document with the name of its layout, without the notes (R-PDF-001)', async () => {
    const folder = temporary();
    fs.writeFileSync(
      path.join(folder, 'paper.md'),
      '---\ntitle: Agenten im Team\nauthor: Hannes Stauss\nlang: de-AT\n---\n\n# Inhaltsverzeichnis\n\n# Einleitung\n\nDie Agenten <wbr><!--[note-7k2q-->verändern die Arbeit[^note-7k2q] von Teams.[^1]\n\n[^note-7k2q]: **hannes** · 2026-10-28 10:15+01:00\n\n    Eine Notiz.\n\n[^1]: Eine Fußnote.\n',
    );
    const result = run(folder, ['build', 'paper.md', '--html', 'page.html'], 120_000);
    expect(result.stderr).toBe('');
    expect(result).toMatchObject({ code: 0, stdout: 'paper.pdf\n' });
    const pdf = fs.readFileSync(path.join(folder, 'paper.pdf'));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const document = await PDFDocument.load(pdf);
    expect([document.getTitle(), document.getAuthor(), document.getCreator()]).toEqual(['Agenten im Team', 'Hannes Stauss', 'nimblescape Markdown Paper']);
    expect(document.getPageCount()).toBe(1);
    const html = fs.readFileSync(path.join(folder, 'page.html'), 'utf8').replaceAll('\u00ad', '');
    expect(html).not.toContain('Eine Notiz');
    expect(html).toContain('<span class="footnote"><span class="footnote-paragraph" id="paper-footnote-1">Eine Fußnote.</span></span>');
  }, 150_000);

  it.skipIf(!browser)('draws the PlantUML diagrams with the settings and the included files of the workspace folder (R-REN-015)', async () => {
    const folder = temporary();
    fs.mkdirSync(path.join(folder, '.vscode'));
    fs.writeFileSync(path.join(folder, '.vscode', 'settings.json'), '{\n  // The notation of PlantUML\n  "nimblescape.plantuml.umlNotation": false,\n}\n');
    fs.mkdirSync(path.join(folder, 'paper'));
    fs.writeFileSync(path.join(folder, 'actors.iuml'), 'participant Carla\n');
    fs.writeFileSync(
      path.join(folder, 'paper', 'paper.md'),
      '---\ntitle: Agenten\n---\n\n# Ablauf\n\n```plantuml\n!include ../actors.iuml\nAnna -> Bernd : Frage\nBernd -> Carla : Auftrag\n```\n\nDer Text nach dem Diagramm.\n',
    );
    const result = run(path.join(folder, 'paper'), ['build', 'paper.md', '--html', 'page.html'], 120_000);
    expect(result.stderr).toBe('');
    expect(result).toMatchObject({ code: 0, stdout: 'paper.pdf\n' });
    const html = fs.readFileSync(path.join(folder, 'paper', 'page.html'), 'utf8');
    expect(html).toContain('data-plantuml-settings="{&quot;umlNotation&quot;:false}"');
    expect(html).toContain('{&quot;../actors.iuml&quot;:{&quot;text&quot;:&quot;participant Carla\\n&quot;}}');
    const page = await Browser.launch(browser!);
    try {
      const { targetId } = await page.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = (await page.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      await page.send('Page.enable', {}, sessionId);
      const loaded = page.once('Page.loadEventFired', sessionId);
      await page.send('Page.navigate', { url: pathToFileURL(path.join(folder, 'paper', 'page.html')).href }, sessionId);
      await loaded;
      const expression = `new Promise((resolve) => {
        const read = () => resolve([...document.querySelectorAll('.pagedjs_page .nimblescape-paper-plantuml')].map((block) => [...block.children].map((child) => child.localName + ':' + child.textContent)));
        if (window.paperRendered) { read(); } else { document.addEventListener('paper-rendered', read); }
      })`;
      const { result: read } = (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)) as { result: { value: string[][] } };
      // One block with one diagram as SVG, with the participant of the included file.
      expect(read.value).toHaveLength(1);
      expect(read.value[0]).toHaveLength(1);
      expect(read.value[0][0]).toMatch(/^svg:/);
      for (const text of ['Anna', 'Bernd', 'Carla', 'Frage', 'Auftrag']) {
        expect(read.value[0][0]).toContain(text);
      }
    } finally {
      await page.close();
    }
  }, 150_000);

  it.skipIf(!browser)('draws the Mermaid diagrams as the Mermaid extension of VS Code, with the settings of the workspace folder (R-REN-016)', async () => {
    const folder = temporary();
    fs.mkdirSync(path.join(folder, '.vscode'));
    fs.writeFileSync(path.join(folder, '.vscode', 'settings.json'), '{\n  // The theme of Mermaid\n  "markdown-mermaid.lightModeTheme": "forest",\n}\n');
    fs.writeFileSync(
      path.join(folder, 'paper.md'),
      '---\ntitle: Agenten\n---\n\n# Ablauf\n\n```mermaid\ngraph LR\n  Alpha --> Beta\n```\n\n::: mermaid\nsequenceDiagram\n  Anna->>Bernd: Frage\n:::\n\n```mermaid\ngraph LR\n  Alpha -->\n```\n\nDer Text nach den Diagrammen.\n',
    );
    const result = run(folder, ['build', 'paper.md', '--html', 'page.html'], 120_000);
    expect(result.stderr).toBe('');
    expect(result).toMatchObject({ code: 0, stdout: 'paper.pdf\n' });
    const html = fs.readFileSync(path.join(folder, 'page.html'), 'utf8');
    expect(html).toContain('window.paperMermaid = {"lightModeTheme":"forest","maxTextSize":50000};');
    const page = await Browser.launch(browser!);
    try {
      const { targetId } = await page.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = (await page.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      await page.send('Page.enable', {}, sessionId);
      const loaded = page.once('Page.loadEventFired', sessionId);
      await page.send('Page.navigate', { url: pathToFileURL(path.join(folder, 'page.html')).href }, sessionId);
      await loaded;
      const expression = `new Promise((resolve) => {
        const read = () => resolve([...document.querySelectorAll('.pagedjs_page .mermaid')].map((element) => {
          const svg = element.querySelector(':scope > .mermaid-wrapper > .mermaid-content > svg');
          return svg ? 'svg:' + svg.id + ':' + svg.textContent : element.querySelector('pre.mermaid-error') ? 'error' : 'none';
        }));
        if (window.paperRendered) { read(); } else { document.addEventListener('paper-rendered', read); }
      })`;
      const { result: read } = (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)) as { result: { value: string[] } };
      // The fenced code block and the container as SVG with the IDs of the extension, and the message of the error.
      expect(read.value).toHaveLength(3);
      expect(read.value[0]).toMatch(/^svg:dmermaid-[0-9a-f]{8}:/);
      expect(read.value[0]).toContain('Alpha');
      expect(read.value[0]).toContain('Beta');
      expect(read.value[1]).toMatch(/^svg:dmermaid-[0-9a-f]{8}:/);
      expect(read.value[1]).toContain('Frage');
      expect(read.value[2]).toBe('error');
    } finally {
      await page.close();
    }
  }, 150_000);

  it.skipIf(!browser)('gives the last line of a justified paragraph with shrinking spaces its natural spaces (R-REN-012)', async () => {
    const folder = temporary();
    fs.mkdirSync(path.join(folder, 'layouts', 'word'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'layouts', 'word', 'layout.json'), JSON.stringify({ format: 'nimblescape-layout 1.0.0', language: 'en-US', hyphenate: false }));
    fs.writeFileSync(path.join(folder, 'layouts', 'word', 'page.css'), '@page { size: A5; margin: 20mm; }\nbody { font: 11pt serif; }\np { text-align: justify; word-spacing: -0.05em; }\n');
    const words = 'The agents change the work of teams in three ways, and the teams change the agents in turn.';
    fs.writeFileSync(path.join(folder, 'paper.md'), `---\nlayout: word\n---\n\n${words} ${words} ${words}\n`);
    expect(run(folder, ['build', 'paper.md', '--html', 'page.html'], 120_000)).toMatchObject({ code: 0 });
    const page = await Browser.launch(browser!);
    try {
      const { targetId } = await page.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = (await page.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      await page.send('Page.enable', {}, sessionId);
      const loaded = page.once('Page.loadEventFired', sessionId);
      await page.send('Page.navigate', { url: pathToFileURL(path.join(folder, 'page.html')).href }, sessionId);
      await loaded;
      const expression = `new Promise((resolve) => {
        const read = () => resolve([...document.querySelectorAll('.pagedjs_page p')].map((p) => [p.getClientRects().length, [...p.querySelectorAll('.paper-last-line')].map((span) => span.style.wordSpacing + '|' + span.textContent)]));
        if (window.paperRendered) { read(); } else { document.addEventListener('paper-rendered', read); }
      })`;
      const { result } = (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)) as { result: { value: [number, string[]][] } };
      expect(result.value).toHaveLength(1);
      const [, spans] = result.value[0];
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatch(/^0px\|\S.* turn\.$/);
      expect(words.repeat(3).length).toBeGreaterThan(spans[0].length);
    } finally {
      await page.close();
    }
  }, 150_000);
});
