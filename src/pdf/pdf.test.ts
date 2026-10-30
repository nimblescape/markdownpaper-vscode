// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import * as path from 'node:path';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { expect, test } from 'vitest';
import { candidates } from './browser';
import { finishPdf } from './pdf';

test('the PDF loses the marks of the soft hyphens and keeps the rest of the text, and gets its metadata (R-PDF-003)', async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([200, 200]);
  const content = 'BT /F1 12 Tf 10 10 Td <0041> Tj /Span << /ActualText <FEFF00AD> >> BDC 5 0 Td <0042> Tj EMC <0043> Tj /Span<</ActualText<FEFF00AD>>>BDC <0044> Tj EMC ET';
  const stream = document.context.flateStream(content);
  page.node.set(PDFName.of('Contents'), document.context.register(stream));
  const finished = await PDFDocument.load(await finishPdf(await document.save(), { title: 'Agenten', author: 'Hannes Stauss', language: 'de-AT', subject: 'Eine Studie' }));
  const contents = finished.getPages()[0].node.get(PDFName.of('Contents'));
  const ref = contents instanceof PDFArray ? contents.get(0) : contents;
  const raw = finished.context.lookup(ref) as PDFRawStream;
  const text = Buffer.from(decodePDFRawStream(raw).decode()).toString('latin1');
  expect(text).not.toContain('FEFF00AD');
  expect(text).toContain('<0041> Tj');
  expect(text).toContain('5 0 Td');
  expect(text).not.toContain('<0042>');
  expect(text).toContain('<0043> Tj');
  expect(finished.getTitle()).toBe('Agenten');
  expect(finished.getAuthor()).toBe('Hannes Stauss');
  expect(finished.getSubject()).toBe('Eine Studie');
  expect(finished.getCreator()).toBe('nimblescape Markdown Paper');
});

test('the search for a browser knows Chrome, Chromium and Edge on Windows, macOS and Linux (R-PDF-002)', () => {
  const windows = candidates('win32', { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' });
  expect(windows).toContain('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  expect(windows).toContain('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
  const mac = candidates('darwin', { HOME: '/Users/a' });
  expect(mac[0]).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  expect(mac).toContain('/Users/a/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  const linux = candidates('linux', { PATH: ['/usr/bin', '/usr/local/bin'].join(path.delimiter) });
  expect(linux.slice(0, 3)).toEqual(['/usr/bin/google-chrome', '/usr/local/bin/google-chrome', '/usr/bin/google-chrome-stable']);
  expect(linux).toContain('/usr/bin/microsoft-edge');
});
