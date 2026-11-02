// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The download of Chromium for the PDF when no Chrome, Chromium or Edge is installed
 * ([R-PDF-002](../../docs/requirements.md#r-pdf-002), decision 6): the headless shell of Chrome for Testing, the build
 * of Chromium that the Chrome team makes for programs that print and test pages, in one fixed version. It goes once
 * into a folder of the cache of the user, which the extension and the command share. The size and the SHA-256 hash
 * of the download must be the values of this module, so a changed file never runs. The module unpacks the ZIP archive
 * itself with zlib of Node.js and uses no API of VS Code.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { Fetcher } from '../paper/lookup';

/** Release is a version of the headless shell of Chrome for Testing, with the size and the hash of each download. */
export interface Release {
  version: string;
  /** downloads are the ZIP archives by the names of the platforms of Chrome for Testing, such as `linux64`. */
  downloads: Readonly<Record<string, { size: number; sha256: string }>>;
}

/**
 * headlessShell is the version that the extension and the command download: the stable version of Chrome for Testing
 * of 2026-10-30. CONTRIBUTING.md, "The download of Chromium", says how to change it.
 */
export const headlessShell: Release = {
  version: '156.0.8078.80',
  downloads: {
    linux64: { size: 126922702, sha256: '547dcd374e02961bf998f6046a267644f8502225c36bb78ca307dab32a0b3eb4' },
    'mac-arm64': { size: 103982159, sha256: 'ea615baa2e9caf0d02d1898a6562b5f8fa9c35239707dae0f592178df5b986ac' },
    'mac-x64': { size: 109493298, sha256: '535d417d9034cbd11e7dacd1a71aa3d6e1b525e6d5dcd2671eb2532f01481228' },
    win32: { size: 119036038, sha256: '8d7472c5c60215a24c42e31d0e9567f1fbf41365e46c8d36c59b2a8b8b2b3a65' },
    win64: { size: 125772546, sha256: '10a77466005e7f64e00f1a75fd1ea81f4a38a60093c65fea6895843b26e60a9a' },
  },
};

/**
 * downloadAddress returns the address of the ZIP archive of a release for a platform.
 * @param release - The release.
 * @param platform - The platform of Chrome for Testing, such as `linux64`.
 */
export const downloadAddress = (release: Release, platform: string): string =>
  `https://storage.googleapis.com/chrome-for-testing-public/${release.version}/${platform}/chrome-headless-shell-${platform}.zip`;

/**
 * downloadPlatform returns the platform of Chrome for Testing for a system, or undefined for a system without a build,
 * such as Linux on ARM. Windows on ARM runs the build for x64.
 * @param platform - The platform, as `process.platform` names it.
 * @param arch - The processor, as `process.arch` names it.
 */
export function downloadPlatform(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string | undefined {
  if (platform === 'linux') {
    return arch === 'x64' ? 'linux64' : undefined;
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'mac-arm64' : arch === 'x64' ? 'mac-x64' : undefined;
  }
  if (platform === 'win32') {
    return arch === 'ia32' ? 'win32' : arch === 'x64' || arch === 'arm64' ? 'win64' : undefined;
  }
  return undefined;
}

/**
 * cacheFolder returns the folder of the cache of Markdown Paper: `%LOCALAPPDATA%\nimblescape-markdownpaper\Cache` on
 * Windows, `~/Library/Caches/nimblescape-markdownpaper` on macOS, and `$XDG_CACHE_HOME/nimblescape-markdownpaper` or
 * `~/.cache/nimblescape-markdownpaper` on Linux.
 * @param platform - The platform, as `process.platform` names it.
 * @param env - The environment variables.
 * @param home - The home folder of the user.
 */
export function cacheFolder(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  if (platform === 'win32') {
    return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'nimblescape-markdownpaper', 'Cache');
  }
  if (platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Caches', 'nimblescape-markdownpaper');
  }
  return path.posix.join(env.XDG_CACHE_HOME || path.posix.join(home, '.cache'), 'nimblescape-markdownpaper');
}

/** Place is where the download goes: the folder of the cache, the platform of Chrome for Testing and the release. */
export interface Place {
  cache: string;
  platform: string | undefined;
  release: Release;
}

/** defaultPlace returns the place of the download on this computer. */
export const defaultPlace = (): Place => ({ cache: cacheFolder(), platform: downloadPlatform(), release: headlessShell });

/**
 * folderOf returns the folder of the unpacked download of a place.
 * @param place - The place.
 * @param platform - The platform of Chrome for Testing.
 */
const folderOf = (place: Place, platform: string): string => path.join(place.cache, 'chrome-headless-shell', place.release.version, platform);

/**
 * programOf returns the path of the program of the unpacked download of a place.
 * @param place - The place.
 * @param platform - The platform of Chrome for Testing.
 */
const programOf = (place: Place, platform: string): string =>
  path.join(folderOf(place, platform), `chrome-headless-shell-${platform}`, platform.startsWith('win') ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');

/**
 * downloadedBrowser returns the program of the downloaded Chromium, or undefined when it was not downloaded.
 * @param place - The place of the download.
 */
export function downloadedBrowser(place: Place = defaultPlace()): string | undefined {
  if (!place.platform) {
    return undefined;
  }
  const program = programOf(place, place.platform);
  return fs.existsSync(program) ? program : undefined;
}

/**
 * downloadSize returns the size of the download of a place in megabytes, or undefined for a system without a build.
 * @param place - The place of the download.
 */
export function downloadSize(place: Place = defaultPlace()): number | undefined {
  const download = place.platform ? place.release.downloads[place.platform] : undefined;
  return download && Math.round(download.size / 1_000_000);
}

/**
 * downloadBrowser downloads Chromium once into the cache and returns its program; a download of an earlier run
 * counts. The archive must have the size and the SHA-256 hash of the release. It is unpacked into a new folder beside
 * its place, which then takes its name, so a stopped download leaves no half folder.
 * @param fetch - The network.
 * @param place - The place of the download.
 * @throws When the system has no build, the download fails, or the archive is another file.
 */
export async function downloadBrowser(fetch: Fetcher, place: Place = defaultPlace()): Promise<string> {
  const download = place.platform ? place.release.downloads[place.platform] : undefined;
  if (!place.platform || !download) {
    throw new Error(
      `Chrome for Testing has no Chromium for ${process.platform} on ${process.arch}: install Chromium with the packages of the system, or name the program of another browser.`,
    );
  }
  const existing = downloadedBrowser(place);
  if (existing) {
    return existing;
  }
  const address = downloadAddress(place.release, place.platform);
  const response = await fetch(address, 'application/zip');
  if (response.status !== 200) {
    throw new Error(`The download of Chromium from ${address} failed (status ${response.status}).`);
  }
  if (response.body.length !== download.size || createHash('sha256').update(response.body).digest('hex') !== download.sha256) {
    throw new Error(`The download of Chromium from ${address} is not the expected file: its size or its SHA-256 hash differs.`);
  }
  const folder = folderOf(place, place.platform);
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  const partial = fs.mkdtempSync(`${folder}.partial-`);
  try {
    unzip(response.body, partial);
    fs.renameSync(partial, folder);
  } catch (error) {
    fs.rmSync(partial, { recursive: true, force: true });
    // Another run of the extension or of the command may have finished the same download meanwhile.
    const other = downloadedBrowser(place);
    if (other) {
      return other;
    }
    throw error;
  }
  const program = downloadedBrowser(place);
  if (!program) {
    throw new Error(`The download of Chromium from ${address} holds no program ${path.basename(programOf(place, place.platform))}.`);
  }
  return program;
}

/**
 * unzip unpacks a ZIP archive into a folder, also an archive in the format ZIP64: the files stored or compressed with
 * Deflate, their permissions of Unix, and symbolic links. A path that leaves the folder stops the unpacking.
 * @param zip - The content of the archive.
 * @param folder - The folder.
 * @throws When the archive is damaged or uses another compression.
 */
export function unzip(zip: Uint8Array, folder: string): void {
  const data = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end of the central directory: its signature, in the last 22 bytes and the comment of up to 65535 bytes.
  let end = -1;
  for (let at = data.length - 22; at >= Math.max(0, data.length - 22 - 0xffff); at--) {
    if (data.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) {
    throw new Error('The download is no ZIP archive.');
  }
  let count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  // A ZIP64 archive has these values in the ZIP64 end of the central directory, which its locator before the end names.
  if ((count === 0xffff || offset === 0xffffffff) && end >= 20 && data.readUInt32LE(end - 20) === 0x07064b50) {
    const end64 = Number(data.readBigUInt64LE(end - 12));
    count = Number(data.readBigUInt64LE(end64 + 32));
    offset = Number(data.readBigUInt64LE(end64 + 48));
  }
  const root = path.resolve(folder);
  const inside = (target: string) => target.startsWith(root + path.sep);
  for (let index = 0, at = offset; index < count; index++) {
    if (data.readUInt32LE(at) !== 0x02014b50) {
      throw new Error('The central directory of the ZIP archive is damaged.');
    }
    const system = data.readUInt16LE(at + 4) >> 8;
    const method = data.readUInt16LE(at + 10);
    let compressed = data.readUInt32LE(at + 20);
    let size = data.readUInt32LE(at + 24);
    const nameLength = data.readUInt16LE(at + 28);
    const extraLength = data.readUInt16LE(at + 30);
    const commentLength = data.readUInt16LE(at + 32);
    const attributes = data.readUInt32LE(at + 38);
    let local = data.readUInt32LE(at + 42);
    const name = data.toString('utf8', at + 46, at + 46 + nameLength);
    // The extra field of ZIP64 holds the values that do not fit into 32 bits, in this order.
    const extraEnd = at + 46 + nameLength + extraLength;
    for (let extra = at + 46 + nameLength; extra + 4 <= extraEnd; extra += 4 + data.readUInt16LE(extra + 2)) {
      if (data.readUInt16LE(extra) !== 0x0001) {
        continue;
      }
      let field = extra + 4;
      const next = (): number => {
        field += 8;
        return Number(data.readBigUInt64LE(field - 8));
      };
      if (size === 0xffffffff) {
        size = next();
      }
      if (compressed === 0xffffffff) {
        compressed = next();
      }
      if (local === 0xffffffff) {
        local = next();
      }
    }
    at = extraEnd + commentLength;
    const target = path.resolve(root, name);
    if (!inside(target)) {
      throw new Error(`The ZIP archive names a file outside its folder: ${name}`);
    }
    if (name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    if (data.readUInt32LE(local) !== 0x04034b50) {
      throw new Error(`The ZIP archive is damaged at ${name}.`);
    }
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const stored = data.subarray(start, start + compressed);
    if (method !== 0 && method !== 8) {
      throw new Error(`The ZIP archive compresses ${name} with a method that the unpacking does not know (${method}).`);
    }
    const content = method === 0 ? stored : inflateRawSync(stored);
    if (content.length !== size) {
      throw new Error(`The ZIP archive is damaged at ${name}.`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // The permissions of Unix are in the high 16 bits of the external attributes of an entry made on Unix (3).
    const mode = system === 3 ? attributes >>> 16 : 0;
    if ((mode & 0o170000) === 0o120000) {
      const link = content.toString('utf8');
      if (path.isAbsolute(link) || !inside(path.resolve(path.dirname(target), link))) {
        throw new Error(`The ZIP archive has a link outside its folder: ${name}`);
      }
      fs.symlinkSync(link, target);
      continue;
    }
    fs.writeFileSync(target, content);
    if (mode & 0o777 && process.platform !== 'win32') {
      fs.chmodSync(target, mode & 0o777);
    }
  }
}
