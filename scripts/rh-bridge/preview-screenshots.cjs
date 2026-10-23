#!/usr/bin/env node
/* eslint-env node, es2020 */
/* eslint-disable strict -- CommonJS scripts run directly by node */
// Local preview of a production build with the RH API served from the vendored task 005
// fixtures (aligned to the task 008 manifest), a scripted injected wallet that can only read
// (every signing method is refused) and a fresh headless browser profile. Takes screenshots.
//
// Usage: node scripts/rh-bridge/preview-screenshots.cjs <playwright-core dir> <build dir> <out dir> [chromium executable]
// Network: public read-only RPC calls to the keyless lane RPCs and the existing #/bridge reads are
// allowed; requests to the RH API origin's /api/v1/rh/* never leave the browser.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const [playwrightDir, buildDir, outDir, executablePath] = process.argv.slice(2);
if (!playwrightDir || !buildDir || !outDir) {
  console.error('USAGE: preview-screenshots.cjs <playwright-core dir> <build dir> <out dir> [chromium executable]');
  process.exit(2);
}
const { chromium } = require(path.resolve(playwrightDir));
const repo = path.join(__dirname, '../..');
const fixturesDir = path.join(repo, 'src/services/rhBridge/__fixtures__/public-api.v1');
const deployment = JSON.parse(fs.readFileSync(path.join(repo, 'src/config/rhBridge/deployment.json'), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const API = 'https://bridgeapi.testnet.onyx.org';
const HOLDER = '0x7dBe71B743e3e9f542324Dd032D080e9fA1A243A';
const STRANGER = '0x1234567890123456789012345678901234567890';
const SYNTHETIC = {
  '0x1111111111111111111111111111111111111111': deployment.escrow.address.toLowerCase(),
  '0x2222222222222222222222222222222222222222': deployment.token.address.toLowerCase(),
  '0x3333333333333333333333333333333333333333': deployment.minter.address.toLowerCase(),
  '0x4444444444444444444444444444444444444444': deployment.wrapper.address.toLowerCase(),
};
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const BASE = Date.parse('2026-10-23T00:00:00.000Z');
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(fixturesDir, name + '.json'), 'utf8')).response;
const live = (name) => {
  const r = fixture(name);
  const now = Date.now();
  return {
    status: r.status,
    body: mapStrings(
      r.body,
      (s) => SYNTHETIC[s] || (ISO.test(s) ? new Date(now + Date.parse(s) - BASE).toISOString() : s)
    ),
  };
};
function feeFor(gross) {
  const e = deployment.minterEntry;
  const ceil = (BigInt(gross) * BigInt(e.feeBps) + BigInt(9999)) / BigInt(10000);
  return (ceil > BigInt(e.minFee) ? ceil : BigInt(e.minFee)).toString();
}
function rhApi(pathname, search) {
  const e = deployment.minterEntry;
  const now = new Date();
  if (pathname === '/api/v1/rh/assets') return live('getAssets.200');
  if (pathname === '/api/v1/rh/health') return live('getHealth.200.ok');
  if (pathname === '/api/v1/rh/effective-state') return live('getEffectiveState.200.open');
  if (pathname === '/api/v1/rh/limits') {
    const r = live('getLimits.200');
    Object.assign(r.body, {
      deposit: { perTxMax: deployment.escrowMapping.perTxMax, minAmount: '1' },
      exit: { perTxMax: e.perTxMax, minExit: e.minExit },
      fee: { feeBps: Number(e.feeBps), minFee: e.minFee, maxFeeBps: 100, maxMinFee: e.maxMinFee },
    });
    return r;
  }
  if (pathname === '/api/v1/rh/fee-quote') {
    const gross = new URLSearchParams(search).get('gross') || '0';
    if (BigInt(gross) < BigInt(e.minExit)) return fixture('getFeeQuote.422.below-min-exit');
    const fee = feeFor(gross);
    return {
      status: 200,
      body: {
        assetId: 'TSLA',
        direction: 'ONYX_TO_RH',
        gross,
        fee,
        net: (BigInt(gross) - BigInt(fee)).toString(),
        suggestedMaxFee: fee,
        feeBps: Number(e.feeBps),
        minFee: e.minFee,
        quotedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60000).toISOString(),
      },
    };
  }
  if (pathname.startsWith('/api/v1/rh/history')) return fixture('getHistory.200.empty');
  return fixture('getStatusByTx.404');
}

// Read-only injected wallet: answers chain/account reads and refuses every signing method.
const walletScript = (chainId, account) => `(() => {
  const listeners = {};
  const answer = (method) => {
    if (method === 'eth_chainId') return '0x' + (${chainId}).toString(16);
    if (method === 'net_version') return String(${chainId});
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['${account}'];
    const error = new Error('Preview wallet: ' + method + ' refused'); error.code = 4001; throw error;
  };
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method }) => answer(method),
    send: async (method) => ({ result: answer(typeof method === 'string' ? method : method.method) }),
    on: (event, fn) => { (listeners[event] = listeners[event] || []).push(fn); },
    removeListener: () => undefined,
  };
})();`;

function serve(root) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.map': 'application/json',
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/_vercel/')) {
      // Vercel Analytics is served by the platform, not by the build output.
      res.writeHead(404);
      return res.end();
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function shot(browser, base, name, { chainId, account, hash, apiUp = true, steps = async () => undefined }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
  if (account) await context.addInitScript(walletScript(chainId, account));
  const rhRequests = [];
  await context.route(API + '/api/v1/rh/**', async (route) => {
    const url = new URL(route.request().url());
    rhRequests.push(url.pathname + url.search);
    if (!apiUp) return route.abort('connectionrefused');
    const r = rhApi(url.pathname, url.search);
    return route.fulfill({
      status: r.status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(r.body),
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(base + '/' + hash, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await steps(page);
  await page.waitForTimeout(3000);
  const file = path.join(outDir, name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section[aria-label="Robinhood testnet bridge"] button')).map((b) => ({
      text: b.textContent,
      disabled: b.disabled,
    }))
  );
  await context.close();
  return { name, hash, file, rhRequests: rhRequests.length, pageErrors: errors, buttons, text };
}

(async () => {
  const server = await serve(path.resolve(buildDir));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const type = (label, value) => async (page) => {
    await page.fill(`[aria-label="${label}"]`, value);
  };
  const results = [];
  try {
    results.push(await shot(browser, base, '01-bridge-existing', { hash: '#/bridge' }));
    results.push(
      await shot(browser, base, '02-rh-api-unreachable', {
        hash: '#/bridge/robinhood-testnet',
        chainId: 46630,
        account: HOLDER,
        apiUp: false,
        steps: type('Amount', '0.1'),
      })
    );
    results.push(
      await shot(browser, base, '03-rh-deposit-holder-46630', {
        hash: '#/bridge/robinhood-testnet',
        chainId: 46630,
        account: HOLDER,
        steps: type('Amount', '0.1'),
      })
    );
    results.push(
      await shot(browser, base, '04-rh-exit-holder-8901', {
        hash: '#/bridge/robinhood-testnet',
        chainId: 8901,
        account: HOLDER,
        steps: async (page) => {
          await page.click('text=Onyx → Robinhood');
          await page.fill('[aria-label="Amount"]', '0.1');
        },
      })
    );
    results.push(
      await shot(browser, base, '05-rh-not-allowlisted', {
        hash: '#/bridge/robinhood-testnet',
        chainId: 46630,
        account: STRANGER,
        steps: type('Amount', '0.1'),
      })
    );
    results.push(
      await shot(browser, base, '06-rh-wrong-chain', {
        hash: '#/bridge/robinhood-testnet',
        chainId: 11155111,
        account: HOLDER,
      })
    );
  } finally {
    await browser.close();
    server.close();
  }
  const summary = results.map(({ text, ...rest }) => ({
    ...rest,
    checks: {
      liveBadge: /\bLive\b(?! actions)/.test(text),
      actionsDisabledBadge: text.includes('Live actions disabled'),
      approveEnabledText: text.includes('Approve exactly'),
      notAllowlisted: text.includes('Not allowlisted'),
      entryLink: text.includes('bridge TSLA between Robinhood Chain Testnet and Onyx Testnet'),
      switchPrompt: text.includes('Switch to Robinhood Chain Testnet'),
    },
  }));
  fs.writeFileSync(path.join(outDir, 'preview-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 1));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
