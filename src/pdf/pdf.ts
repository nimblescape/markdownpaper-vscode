// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The PDF of a page of the renderer ([R-PDF-001](../../docs/requirements.md#r-pdf-001)): an installed browser without
 * a window loads the HTML file, Paged.js makes the pages, and the browser prints them in the size of the pages of the
 * layout. Then the PDF loses the marks of the soft hyphens, so that search and copy find whole words, and gets the
 * title, the author and the language of the document in its metadata. The module uses no API of VS Code.
 */

import { pathToFileURL } from 'node:url';
import * as zlib from 'node:zlib';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { Browser } from './cdp';

/** Metadata is the metadata of a PDF. */
export interface Metadata {
  title: string;
  author?: string;
  language?: string;
  subject?: string;
}

/** PrintResult is a printed PDF, with the messages of the page. */
export interface PrintResult {
  pdf: Uint8Array;
  /** messages are the errors and warnings of the page, for example of Paged.js. */
  messages: string[];
}

/**
 * withTimeout waits for a promise for at most a time.
 * @param promise - The promise.
 * @param milliseconds - The time.
 * @param what - What the promise does, for the message.
 */
function withTimeout<T>(promise: Promise<T>, milliseconds: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took more than ${Math.round(milliseconds / 1000)} seconds.`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * printPdf prints an HTML file of the renderer to a PDF.
 * @param program - The path of the program of the browser.
 * @param htmlFile - The path of the HTML file.
 * @param timeout - The longest time in milliseconds that the browser may need for the pages.
 */
export async function printPdf(program: string, htmlFile: string, timeout = 120_000): Promise<PrintResult> {
  const browser = await Browser.launch(program);
  const messages: string[] = [];
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = (await browser.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
    browser.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
      messages.push(details?.exception?.description ?? details?.text ?? 'An error in the page.');
    });
    browser.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error' || params.type === 'warning') {
        const args = (params.args as { value?: unknown; description?: string }[] | undefined) ?? [];
        messages.push(args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' '));
      }
    });
    await browser.send('Page.enable', {}, sessionId);
    await browser.send('Runtime.enable', {}, sessionId);
    const loaded = browser.once('Page.loadEventFired', sessionId);
    await browser.send('Page.navigate', { url: pathToFileURL(htmlFile).href }, sessionId);
    await withTimeout(loaded, timeout, 'Loading the page');
    const rendered = await withTimeout(
      browser.send(
        'Runtime.evaluate',
        {
          expression:
            "new Promise((resolve) => { if (window.paperRendered) { resolve(true); } else { document.addEventListener('paper-rendered', () => resolve(true)); } })",
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      ),
      timeout,
      'Making the pages',
    );
    if ((rendered.exceptionDetails as unknown) !== undefined) {
      throw new Error('The pages could not be made.');
    }
    const { data } = (await withTimeout(
      browser.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 }, sessionId),
      timeout,
      'Printing the PDF',
    )) as { data: string };
    return { pdf: new Uint8Array(Buffer.from(data, 'base64')), messages };
  } finally {
    await browser.close();
  }
}

/**
 * softHyphenSpan matches the mark that Chromium writes for each soft hyphen of the text: a marked content with
 * /ActualText of the character U+00AD around an invisible glyph. A text extraction reads it as a character or a space
 * within the word ("Kom pe tenz"), which breaks search, copy and screen readers. Removing the mark changes nothing on
 * the page: it holds at most one Td, which stays, and the next operator of the text is Td or ET, which do not depend
 * on the invisible glyph. A hyphen at the end of a line is a normal glyph outside these marks.
 */
const softHyphenSpan = /\/Span\s*<<\s*\/ActualText\s*<FEFF00AD>\s*>>\s*BDC\s*((?:-?[\d.]+\s+-?[\d.]+\s+Td\s*)?)<[0-9A-Fa-f]+>\s*Tj\s*EMC\s*/g;

/**
 * finishPdf removes the marks of the soft hyphens and writes the metadata.
 * @param pdf - The PDF of the browser.
 * @param metadata - The metadata.
 */
export async function finishPdf(pdf: Uint8Array, metadata: Metadata): Promise<Uint8Array> {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const { context } = document;
  for (const page of document.getPages()) {
    const contents = page.node.get(PDFName.of('Contents'));
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    for (const ref of refs) {
      const stream = context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) {
        continue;
      }
      const text = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      if (!text.includes('FEFF00AD')) {
        continue;
      }
      const dict = stream.dict.clone(context);
      dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
      dict.delete(PDFName.of('DecodeParms'));
      const cleaned = text.replace(softHyphenSpan, (_all, move: string) => `${move ? move.trim() : ''}\n`);
      context.assign(ref as Parameters<typeof context.assign>[0], PDFRawStream.of(dict, zlib.deflateSync(Buffer.from(cleaned, 'latin1'))));
    }
  }
  document.setTitle(metadata.title, { showInWindowTitleBar: true });
  if (metadata.author) {
    document.setAuthor(metadata.author);
  }
  if (metadata.subject) {
    document.setSubject(metadata.subject);
  }
  if (metadata.language) {
    document.setLanguage(metadata.language);
  }
  document.setCreator('nimblescape Markdown Paper');
  document.setProducer('nimblescape Markdown Paper with Paged.js and Chromium');
  return document.save();
}
