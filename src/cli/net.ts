// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The network of the command `markdownpaper source` ([R-CITE-005](../../docs/requirements.md#r-cite-005)): GET requests
 * over HTTPS that follow redirects, also through the proxy of the environment variables HTTPS_PROXY and NO_PROXY, as
 * the cloud environment of an AI agent has one. The fetch of Node.js 22 does not use these variables, so the requests
 * open the tunnel of the proxy with CONNECT themselves. Node.js reads the certificates of NODE_EXTRA_CA_CERTS.
 */

import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import type { Fetcher, Response } from '../paper/lookup';

/** timeout is the time in milliseconds that a request may take. */
const timeout = 30000;

/** maxRedirects is the number of redirects that a request follows. */
const maxRedirects = 8;

/** ALPNProtocols names HTTP/1.1 in the TLS handshake, as some servers, such as PubMed, refuse a request without it. */
const ALPNProtocols = ['http/1.1'];

/**
 * proxyOf returns the address of the proxy for a host, from HTTPS_PROXY or https_proxy, or undefined when NO_PROXY
 * names the host or a domain of it.
 * @param host - The host of the request.
 * @param env - The environment variables.
 */
export function proxyOf(host: string, env: NodeJS.ProcessEnv): URL | undefined {
  const proxy = env.HTTPS_PROXY ?? env.https_proxy;
  if (!proxy) {
    return undefined;
  }
  const exceptions = (env.NO_PROXY ?? env.no_proxy ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/:\d+$/, ''))
    .filter(Boolean);
  const name = host.toLowerCase();
  if (exceptions.some((entry) => entry === '*' || name === entry.replace(/^\./, '') || name.endsWith(entry.startsWith('.') ? entry : `.${entry}`))) {
    return undefined;
  }
  try {
    return new URL(/^[a-z]+:\/\//i.test(proxy) ? proxy : `http://${proxy}`);
  } catch {
    return undefined;
  }
}

/**
 * tunnel opens a TLS connection to a host through the tunnel of a proxy.
 * @param proxy - The address of the proxy.
 * @param host - The host.
 * @param port - The port of the host.
 */
function tunnel(proxy: URL, host: string, port: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Host: `${host}:${port}` };
    if (proxy.username) {
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`;
    }
    const request = (proxy.protocol === 'https:' ? https : http).request({
      host: proxy.hostname,
      port: Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers,
      timeout,
    });
    request.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`the proxy refused the connection to ${host} (${response.statusCode})`));
        return;
      }
      const secure = tls.connect({ socket, servername: host, ALPNProtocols }, () => resolve(secure));
      secure.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error(`no answer from the proxy for ${host}`)));
    request.on('error', reject);
    request.end();
  });
}

/**
 * once sends one GET request and returns its answer, without following a redirect.
 * @param url - The address.
 * @param headers - The headers.
 * @param env - The environment variables.
 */
async function once(url: URL, headers: Record<string, string>, env: NodeJS.ProcessEnv): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Uint8Array }> {
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  const proxy = url.protocol === 'https:' ? proxyOf(url.hostname, env) : undefined;
  const socket = proxy ? await tunnel(proxy, url.hostname, port) : undefined;
  return new Promise((resolve, reject) => {
    // The agent of https gives the options to tls.connect, also ALPNProtocols.
    const options: https.RequestOptions & Pick<tls.ConnectionOptions, 'ALPNProtocols'> = { method: 'GET', host: url.hostname, port, path: `${url.pathname}${url.search}`, headers: { ...headers, Connection: 'close' }, timeout, ALPNProtocols };
    if (socket) {
      // Without an agent, the request uses the connection through the tunnel, which is TLS already. Without an agent,
      // Node.js also writes the port 443 into the header Host, which some servers refuse.
      options.createConnection = () => socket;
      options.headers = { ...options.headers, Host: url.host };
    }
    const request = (url.protocol === 'https:' ? https : http).request(options, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        // The connection through the tunnel stays open otherwise, and so does the process.
        socket?.destroy();
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: new Uint8Array(Buffer.concat(chunks)) });
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error(`no answer from ${url.hostname} after ${timeout / 1000} seconds`)));
    request.on('error', (error) => {
      socket?.destroy();
      reject(error);
    });
    request.end();
  });
}

/**
 * httpFetcher returns the fetcher of the command: GET requests that follow redirects, through the proxy of the
 * environment, with the header User-Agent.
 * @param userAgent - The value of the header User-Agent.
 * @param env - The environment variables.
 */
export function httpFetcher(userAgent: string, env: NodeJS.ProcessEnv = process.env): Fetcher {
  return async (address: string, accept: string): Promise<Response> => {
    let url = new URL(address);
    for (let redirects = 0; ; redirects++) {
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`${url.protocol} is no address of the web`);
      }
      const answer = await once(url, { 'User-Agent': userAgent, Accept: accept, 'Accept-Encoding': 'identity' }, env);
      const location = answer.headers.location;
      if (answer.status >= 300 && answer.status < 400 && location) {
        if (redirects >= maxRedirects) {
          throw new Error(`more than ${maxRedirects} redirects from ${address}`);
        }
        url = new URL(location, url);
        continue;
      }
      return { status: answer.status, type: String(answer.headers['content-type'] ?? ''), url: url.href, body: answer.body };
    }
  };
}
