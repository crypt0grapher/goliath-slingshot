#!/usr/bin/env node
/* eslint-env node, es2020 */
/* eslint-disable strict -- CommonJS scripts run directly by node */
// Verify that the vendored public API v1 fixtures are byte-identical to the frozen task 005
// fixtures (goliath-bridge-backend-rh robinhood/contracts/fixtures/public-api.v1).
// Usage: node scripts/rh-bridge/check-fixtures.cjs <path/to/contracts/fixtures/public-api.v1>
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const source = process.argv[2];
if (!source) {
  console.error('USAGE: check-fixtures.cjs <fixtures/public-api.v1 directory>');
  process.exit(2);
}
const vendored = path.join(__dirname, '../../src/services/rhBridge/__fixtures__/public-api.v1');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const list = (dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
const ours = list(vendored);
const theirs = list(source);
const missing = theirs.filter((name) => !ours.includes(name));
const extra = ours.filter((name) => !theirs.includes(name));
const differing = ours.filter(
  (name) => theirs.includes(name) && sha(path.join(vendored, name)) !== sha(path.join(source, name))
);
const match = !missing.length && !extra.length && !differing.length;
console.log(JSON.stringify({ files: ours.length, missing, extra, differing, match }));
process.exit(match ? 0 : 1);
