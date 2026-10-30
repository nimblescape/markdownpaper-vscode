// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the built command markdownpaper (cli/dist/markdownpaper.js, npm run test:cli) on Linux and macOS
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
const command = path.join(repository, 'cli', 'dist', 'markdownpaper.js');
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

/** Runs the command in `cwd` with the arguments; returns its exit code and its output. */
function run(cwd: string, args: string[], timeout = 30_000) {
  const result = spawnSync(process.execPath, [command, ...args], { cwd, encoding: 'utf8', timeout });
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

describe('the command markdownpaper', () => {
  it('shows its version and the version of the format of the layouts', () => {
    expect(run(temporary(), ['--version'])).toEqual({ code: 0, stdout: `markdownpaper ${cli.version} (layouts: nimblescape-layout 1.0.0)\n`, stderr: '' });
  });

  it('scaffolds a project without questions, which the check accepts', () => {
    const folder = temporary();
    const created = run(folder, ['create', 'paper-project', '--yes', '--language', 'de-AT', '--title', 'Agenten', '--author', 'Hannes Stauss']);
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
    const result = run(folder, ['pdf', 'paper.md', '--html', 'page.html'], 120_000);
    expect(result.stderr).toBe('');
    expect(result).toMatchObject({ code: 0, stdout: 'paper.pdf\n' });
    const pdf = fs.readFileSync(path.join(folder, 'paper.pdf'));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const document = await PDFDocument.load(pdf);
    expect([document.getTitle(), document.getAuthor(), document.getCreator()]).toEqual(['Agenten im Team', 'Hannes Stauss', 'nimblescape Markdown Paper']);
    expect(document.getPageCount()).toBe(1);
    const html = fs.readFileSync(path.join(folder, 'page.html'), 'utf8').replaceAll('\u00ad', '');
    expect(html).not.toContain('Eine Notiz');
    expect(html).toContain('<span class="footnote"><span class="footnote-paragraph">Eine Fußnote.</span></span>');
  }, 150_000);

  it.skipIf(!browser)('gives the last line of a justified paragraph with shrinking spaces its natural spaces (R-REN-012)', async () => {
    const folder = temporary();
    fs.mkdirSync(path.join(folder, 'layouts', 'word'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'layouts', 'word', 'layout.json'), JSON.stringify({ format: 'nimblescape-layout 1.0.0', language: 'en-US', hyphenate: false }));
    fs.writeFileSync(path.join(folder, 'layouts', 'word', 'page.css'), '@page { size: A5; margin: 20mm; }\nbody { font: 11pt serif; }\np { text-align: justify; word-spacing: -0.05em; }\n');
    const words = 'The agents change the work of teams in three ways, and the teams change the agents in turn.';
    fs.writeFileSync(path.join(folder, 'paper.md'), `---\nlayout: word\n---\n\n${words} ${words} ${words}\n`);
    expect(run(folder, ['pdf', 'paper.md', '--html', 'page.html'], 120_000)).toMatchObject({ code: 0 });
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
