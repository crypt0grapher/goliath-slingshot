#!/usr/bin/env node
/* eslint-env node, es2020 */
/* eslint-disable strict -- CommonJS scripts run directly by node */
// Compare the compiled RH lane configuration (src/config/rhBridge/deployment.json) with the
// task 008 deployment manifest (Solo deploy/bridge-testnet/rh-deployment.json).
// Usage: node scripts/rh-bridge/check-deployment.cjs <path/to/rh-deployment.json>
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('USAGE: check-deployment.cjs <rh-deployment.json>');
  process.exit(2);
}
const compiled = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/config/rhBridge/deployment.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : value);

const pairs = [
  ['schema', compiled.schema, manifest.schema],
  ['testnetOnly', compiled.testnetOnly, manifest.testnetOnly],
  ['robinhood.chainId', compiled.chains.robinhood.chainId, manifest.chains.robinhood.chainId],
  ['robinhood.rpc', compiled.chains.robinhood.rpc, manifest.chains.robinhood.rpc],
  ['robinhood.explorer', compiled.chains.robinhood.explorer, manifest.chains.robinhood.explorer],
  ['onyx.chainId', compiled.chains.onyx.chainId, manifest.chains.onyx.chainId],
  ['onyx.rpc', compiled.chains.onyx.rpc, manifest.chains.onyx.rpc],
  ['onyx.explorer', compiled.chains.onyx.explorer, manifest.chains.onyx.explorer],
  ['token.chainId', compiled.token.chainId, manifest.token.chainId],
  ['token.address', lower(compiled.token.address), lower(manifest.token.address)],
  ['token.symbol', compiled.token.symbol, manifest.token.symbol],
  ['token.decimals', compiled.token.decimals, manifest.token.decimals],
  ['escrow.chainId', compiled.escrow.chainId, manifest.contracts.escrow.chainId],
  ['escrow.address', lower(compiled.escrow.address), lower(manifest.contracts.escrow.address)],
  ['minter.chainId', compiled.minter.chainId, manifest.contracts.minter.chainId],
  ['minter.address', lower(compiled.minter.address), lower(manifest.contracts.minter.address)],
  ['wrapper.chainId', compiled.wrapper.chainId, manifest.contracts.wrapper.chainId],
  ['wrapper.address', lower(compiled.wrapper.address), lower(manifest.contracts.wrapper.address)],
  ['wrapper.symbol', compiled.wrapper.symbol, manifest.wrapper.symbol],
  ['wrapper.decimals', compiled.wrapper.decimals, manifest.wrapper.decimals],
  ['minterEntry.wrapper', lower(compiled.wrapper.address), lower(manifest.minterEntry.wrapper)],
  ['minterEntry.canonical', lower(compiled.token.address), lower(manifest.minterEntry.canonical)],
  ['escrowMapping.token', lower(compiled.token.address), lower(manifest.escrowMapping.token)],
  ['escrowMapping.wrapper', lower(compiled.wrapper.address), lower(manifest.escrowMapping.wrapper)],
  ['restricted', compiled.restricted, manifest.restricted],
  [
    'holders',
    JSON.stringify(compiled.holders.map(lower)),
    JSON.stringify(manifest.holders.map((h) => lower(h.address))),
  ],
  ...['perTxMax', 'feeBps', 'minFee', 'minExit', 'maxMinFee'].map((k) => [
    'minterEntry.' + k,
    compiled.minterEntry[k],
    manifest.minterEntry[k],
  ]),
  ['escrowMapping.perTxMax', compiled.escrowMapping.perTxMax, manifest.escrowMapping.perTxMax],
  ['maxFeeBps', compiled.maxFeeBps, manifest.maxFeeBps],
];
const mismatches = pairs.filter(([, a, b]) => a !== b).map(([name]) => name);
console.log(JSON.stringify({ checked: pairs.length, mismatches, match: mismatches.length === 0 }));
process.exit(mismatches.length === 0 ? 0 : 1);
