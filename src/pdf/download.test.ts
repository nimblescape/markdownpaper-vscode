// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the download of Chromium ([R-PDF-002](../../docs/requirements.md#r-pdf-002)) without the network: a
 * fetcher gives small ZIP archives, which the tests write, for a release with their sizes and hashes.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, test } from 'vitest';
import type { Fetcher } from '../paper/lookup';
import { cacheFolder, downloadAddress, downloadBrowser, downloadedBrowser, downloadPlatform, downloadSize, headlessShell, type Place, type Release, unzip } from './download';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-download-')));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Entry is a file of a ZIP archive of the tests: its name, its content, its mode of Unix, and its compression. */
interface Entry {
  name: string;
  content?: string;
  mode?: number;
  deflate?: boolean;
}

/** zipOf writes a ZIP archive, made on Unix, with the entries. */
function zipOf(entries: readonly Entry[]): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.content ?? '');
    const stored = entry.deflate ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    parts.push(local, name, stored);
    directory.push(central, name);
    offset += 30 + name.length + stored.length;
  }
  const list = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(list.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, list, end]);
}

describe('the download of Chromium (R-PDF-002)', () => {
  test('each system with a build of Chrome for Testing has its platform, and Linux on ARM has none', () => {
    expect(downloadPlatform('linux', 'x64')).toBe('linux64');
    expect(downloadPlatform('linux', 'arm64')).toBeUndefined();
    expect(downloadPlatform('darwin', 'arm64')).toBe('mac-arm64');
    expect(downloadPlatform('darwin', 'x64')).toBe('mac-x64');
    expect(downloadPlatform('win32', 'x64')).toBe('win64');
    expect(downloadPlatform('win32', 'arm64')).toBe('win64');
    expect(downloadPlatform('win32', 'ia32')).toBe('win32');
    expect(downloadPlatform('freebsd', 'x64')).toBeUndefined();
    for (const platform of ['linux64', 'mac-arm64', 'mac-x64', 'win32', 'win64']) {
      expect(headlessShell.downloads[platform]?.sha256, platform).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(downloadAddress(headlessShell, 'linux64')).toBe(`https://storage.googleapis.com/chrome-for-testing-public/${headlessShell.version}/linux64/chrome-headless-shell-linux64.zip`);
  });

  test('the cache of the user is the folder of the caches of each system', () => {
    expect(cacheFolder('linux', {}, '/home/anna')).toBe('/home/anna/.cache/nimblescape-markdownpaper');
    expect(cacheFolder('linux', { XDG_CACHE_HOME: '/var/cache/anna' }, '/home/anna')).toBe('/var/cache/anna/nimblescape-markdownpaper');
    expect(cacheFolder('darwin', {}, '/Users/anna')).toBe('/Users/anna/Library/Caches/nimblescape-markdownpaper');
    expect(cacheFolder('win32', { LOCALAPPDATA: 'C:\\Users\\anna\\AppData\\Local' }, 'C:\\Users\\anna')).toBe('C:\\Users\\anna\\AppData\\Local\\nimblescape-markdownpaper\\Cache');
  });

  test('the unpacking writes the folders, the stored and the compressed files with their modes, and the links', () => {
    const folder = path.join(root, 'unzip');
    unzip(
      zipOf([
        { name: 'shell/', mode: 0o40755 },
        { name: 'shell/chrome-headless-shell', content: '#!/bin/sh\necho page\n', mode: 0o100755, deflate: true },
        { name: 'shell/locales/de.pak', content: 'Seite', mode: 0o100644 },
        { name: 'shell/current', content: 'chrome-headless-shell', mode: 0o120777 },
      ]),
      folder,
    );
    expect(fs.readFileSync(path.join(folder, 'shell', 'chrome-headless-shell'), 'utf8')).toBe('#!/bin/sh\necho page\n');
    expect(fs.readFileSync(path.join(folder, 'shell', 'locales', 'de.pak'), 'utf8')).toBe('Seite');
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(folder, 'shell', 'chrome-headless-shell')).mode & 0o777).toBe(0o755);
      expect(fs.readlinkSync(path.join(folder, 'shell', 'current'))).toBe('chrome-headless-shell');
    }
  });

  test('the unpacking stops at a path or a link outside its folder, and at a file that is no archive', () => {
    expect(() => unzip(zipOf([{ name: '../outside.txt', content: 'no' }]), path.join(root, 'slip'))).toThrow('outside its folder');
    expect(() => unzip(zipOf([{ name: 'link', content: '../../etc/passwd', mode: 0o120777 }]), path.join(root, 'link'))).toThrow('outside its folder');
    expect(() => unzip(Buffer.from('not a zip archive, only text'), path.join(root, 'text'))).toThrow('no ZIP archive');
    expect(fs.existsSync(path.join(root, 'outside.txt'))).toBe(false);
  });

  test('the download checks the size and the hash, unpacks once into the cache, and a second call uses it', async () => {
    const archive = zipOf([
      { name: 'chrome-headless-shell-linux64/', mode: 0o40755 },
      { name: 'chrome-headless-shell-linux64/chrome-headless-shell', content: 'program', mode: 0o100755, deflate: true },
    ]);
    const release: Release = { version: '1.2.3', downloads: { linux64: { size: archive.length, sha256: createHash('sha256').update(archive).digest('hex') } } };
    const place: Place = { cache: path.join(root, 'cache'), platform: 'linux64', release };
    const asked: string[] = [];
    const fetch: Fetcher = async (url) => {
      asked.push(url);
      return { status: 200, type: 'application/zip', url, body: new Uint8Array(archive) };
    };
    expect(downloadedBrowser(place)).toBeUndefined();
    expect(downloadSize(place)).toBe(0);
    const program = await downloadBrowser(fetch, place);
    expect(program).toBe(path.join(root, 'cache', 'chrome-headless-shell', '1.2.3', 'linux64', 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
    expect(fs.readFileSync(program, 'utf8')).toBe('program');
    expect(await downloadBrowser(fetch, place)).toBe(program);
    expect(downloadedBrowser(place)).toBe(program);
    expect(asked).toEqual([downloadAddress(release, 'linux64')]);
    // Only the unpacked folder stays in the cache.
    expect(fs.readdirSync(path.join(root, 'cache', 'chrome-headless-shell', '1.2.3'))).toEqual(['linux64']);
  });

  test('a changed archive, an error of the server and a system without a build give an error, and no folder', async () => {
    const archive = zipOf([{ name: 'chrome-headless-shell-win64/chrome-headless-shell.exe', content: 'program' }]);
    const release: Release = { version: '1.2.4', downloads: { win64: { size: archive.length, sha256: '0'.repeat(64) } } };
    const place: Place = { cache: path.join(root, 'changed'), platform: 'win64', release };
    const fetch: Fetcher = async (url) => ({ status: 200, type: 'application/zip', url, body: new Uint8Array(archive) });
    await expect(downloadBrowser(fetch, place)).rejects.toThrow('not the expected file');
    expect(fs.existsSync(path.join(root, 'changed', 'chrome-headless-shell', '1.2.4', 'win64'))).toBe(false);
    const missing: Fetcher = async (url) => ({ status: 404, type: 'text/plain', url, body: new Uint8Array() });
    await expect(downloadBrowser(missing, place)).rejects.toThrow('status 404');
    await expect(downloadBrowser(fetch, { ...place, platform: undefined })).rejects.toThrow('no Chromium for');
  });
});
