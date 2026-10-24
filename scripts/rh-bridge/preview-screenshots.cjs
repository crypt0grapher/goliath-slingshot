#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/* eslint-env node, es2020 */
/* eslint-disable strict -- CommonJS helper */
// Offline unified-form preview. Every external request and every wallet mutation is refused.
// This proves form/route continuity and unavailable-state presentation, never deployed readiness.
// Usage: node preview-screenshots.cjs <playwright-core dir> <build dir> <out dir> [chromium executable]
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const [playwrightDir, buildDir, outDir, executablePath] = process.argv.slice(2);
if (!playwrightDir || !buildDir || !outDir) throw Error('USAGE');
const { chromium } = require(path.resolve(playwrightDir));
const root = path.resolve(buildDir);
fs.mkdirSync(outDir, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/_vercel/')) {
    res.writeHead(404);
    return res.end();
  }
  let file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(file)) {
      res.writeHead(404);
      return res.end();
    }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const results = [];
  try {
    for (const legacy of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } }),
        blocked = [];
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        blocked.push(url.origin);
        return route.abort('connectionrefused');
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin + '/#/bridge' + (legacy ? '/robinhood-testnet' : ''), { waitUntil: 'load' });
      await page.locator('[data-testid="standard-bridge-form"]').waitFor();
      if (new URL(page.url()).hash !== '#/bridge') throw Error('OLD_ROUTE_NOT_REPLACED');
      const input = await page.locator('[aria-label="Bridge amount"]').elementHandle();
      await page.locator('button[aria-label="From network"]').click();
      await page.getByRole('menuitemradio', { name: /Robinhood Chain Testnet/ }).click();
      if (!(await input.evaluate((node) => node === document.querySelector('[aria-label="Bridge amount"]'))))
        throw Error('FORM_REMOUNTED');
      await page.locator('[aria-label="Select bridge token"]').click();
      const tokens = await page.getByRole('option').allTextContents();
      if (!tokens.some((x) => x.includes('TSLA')) || !tokens.some((x) => x.includes('ETH'))) throw Error('PAIR_ASSETS');
      await page.getByRole('option', { name: /TSLA/ }).click();
      await page.locator('[aria-label="Reverse bridge direction"]').click();
      await page.locator('button[aria-label="To network"]').click();
      const destinations = await page.getByRole('menuitemradio').allTextContents();
      if (!destinations.some((x) => x.includes('Sepolia')) || !destinations.some((x) => x.includes('Robinhood')))
        throw Error('ONYX_DESTINATIONS');
      await page.getByRole('menuitemradio', { name: /Robinhood Chain Testnet/ }).click();
      const text = await page.locator('[data-testid="standard-bridge-form"]').innerText();
      if (text.includes('Minimum deposit')) throw Error('MINIMUM_DEPOSIT_DISPLAY');
      if (errors.length) throw Error('BROWSER_ERRORS:' + errors.join('|'));
      const file = path.join(outDir, legacy ? 'compatibility-standard-card.png' : 'unified-standard-card.png');
      await page.screenshot({ path: file, fullPage: true });
      results.push({
        legacy,
        hash: new URL(page.url()).hash,
        formStable: true,
        tokens,
        destinations,
        file,
        blockedExternalOrigins: [...new Set(blocked)],
        pageErrors: errors,
        classification: 'OFFLINE_UI_ONLY_NO_READINESS_OR_ACTION_AUTHORITY',
      });
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(outDir, 'preview-summary.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
})().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});
