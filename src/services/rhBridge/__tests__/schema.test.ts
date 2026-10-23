import fs from 'fs';
import path from 'path';
import { loadFixture } from '../__fixtures__';
import {
  parseAssets,
  parseEffectiveState,
  parseError,
  parseFeeQuote,
  parseHealth,
  parseHistory,
  parseLimits,
  parseOperation,
  parseOperationList,
} from '../schema';

const names = fs
  .readdirSync(path.join(__dirname, '../__fixtures__/public-api.v1'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const parserFor = (name: string, status: number): ((body: unknown) => unknown) => {
  if (status !== 200 && !(name.startsWith('getHealth') && status === 503)) return parseError;
  if (name.startsWith('getAssets')) return parseAssets;
  if (name.startsWith('getLimits')) return parseLimits;
  if (name.startsWith('getFeeQuote')) return parseFeeQuote;
  if (name.startsWith('getHealth')) return parseHealth;
  if (name.startsWith('getEffectiveState')) return parseEffectiveState;
  if (name.startsWith('getStatusByTx')) return parseOperationList;
  if (name.startsWith('getStatus')) return parseOperation;
  if (name.startsWith('getHistory')) return parseHistory;
  throw new Error('unmapped fixture ' + name);
};

test('all 39 frozen public API v1 fixtures are vendored', () => {
  expect(names).toHaveLength(39);
});

test.each(names)('fixture %s validates against the v1 schema', (name) => {
  const fx = loadFixture(name);
  expect(() => parserFor(name, fx.response.status)(fx.response.body)).not.toThrow();
});

test('additional properties are rejected everywhere (closed objects)', () => {
  const assets = loadFixture('getAssets.200').response.body as any;
  expect(() => parseAssets({ ...assets, extra: 1 })).toThrow('RH_SCHEMA_ASSETS');
  const nested = JSON.parse(JSON.stringify(assets));
  nested.assets[0].robinhood.rpcUrl = 'https://x.example';
  expect(() => parseAssets(nested)).toThrow('RH_SCHEMA_ASSETS');
  const state = loadFixture('getEffectiveState.200.open').response.body as any;
  expect(() => parseEffectiveState({ ...state, held: { ...state.held, extra: true } })).toThrow(
    'RH_SCHEMA_EFFECTIVE_STATE'
  );
});

test('amounts must be raw integer strings, never numbers or decimals', () => {
  const quote = loadFixture('getFeeQuote.200').response.body as any;
  expect(() => parseFeeQuote({ ...quote, fee: 2500000000000001 })).toThrow('RH_SCHEMA_FEE_QUOTE');
  expect(() => parseFeeQuote({ ...quote, fee: '0.0025' })).toThrow('RH_SCHEMA_FEE_QUOTE');
  expect(() => parseFeeQuote({ ...quote, gross: '01' })).toThrow('RH_SCHEMA_FEE_QUOTE');
  expect(() => parseFeeQuote({ ...quote, direction: 'RH_TO_ONYX' })).toThrow('RH_SCHEMA_FEE_QUOTE');
});

test('addresses and hashes must be lowercase 0x hex; operation ids must match their direction', () => {
  const op = (loadFixture('getStatusByTx.200').response.body as any).items[0];
  expect(() => parseOperation({ ...op, recipient: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD' })).toThrow(
    'RH_SCHEMA_OPERATION'
  );
  expect(() => parseOperation({ ...op, operationId: op.operationId.replace('ONYX_TO_RH', 'RH_TO_ONYX') })).toThrow(
    'RH_SCHEMA_OPERATION'
  );
  expect(() => parseOperation({ ...op, source: { ...op.source, final: false } })).toThrow('RH_SCHEMA_OPERATION');
});

test('unknown enum values are rejected (stale or unknown API)', () => {
  const state = loadFixture('getEffectiveState.200.open').response.body as any;
  expect(() => parseEffectiveState({ ...state, admission: 'MAINTENANCE' })).toThrow();
  expect(() => parseEffectiveState({ ...state, issuer: 'open' })).toThrow();
  const health = loadFixture('getHealth.200.ok').response.body as any;
  expect(() => parseHealth({ ...health, status: 'unknown' })).toThrow();
  const error = loadFixture('getAssets.503').response.body as any;
  expect(() => parseError({ error: { ...error.error, code: 'TEAPOT' } })).toThrow();
});
