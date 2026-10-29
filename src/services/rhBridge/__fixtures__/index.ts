// Test helpers around the vendored, byte-identical task 005 public API v1 fixtures
// (goliath-bridge-backend-rh robinhood/contracts/fixtures/public-api.v1 @ d425f11;
// verify with scripts/rh-bridge/check-fixtures.cjs). Never imported by application code.
import { RH_LANE } from '../../../config/rhBridge';
import deployment from '../../../config/rhBridge/deployment.json';
import { computeExitFee } from '../lane';

export interface ApiFixture {
  fixture: string;
  note?: string;
  request: { method: string; path: string; query: Record<string, string> };
  response: { status: number; headers: Record<string, string>; body: unknown };
}

export function loadFixture(name: string): ApiFixture {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return JSON.parse(JSON.stringify(require('./public-api.v1/' + name + '.json')));
}

// The fixtures use synthetic addresses from the backend golden vectors.
export const SYNTHETIC = {
  escrow: '0x1111111111111111111111111111111111111111',
  token: '0x2222222222222222222222222222222222222222',
  minter: '0x3333333333333333333333333333333333333333',
  wrapper: '0x4444444444444444444444444444444444444444',
};

function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === 'string') return map(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, mapStrings(v, map)])
    );
  }
  return value;
}

// Replace the synthetic contract addresses by the deployed manifest addresses.
export function alignToManifest<T>(body: T): T {
  const table: Record<string, string> = {
    [SYNTHETIC.escrow]: RH_LANE.escrow,
    [SYNTHETIC.token]: RH_LANE.token,
    [SYNTHETIC.minter]: RH_LANE.minter,
    [SYNTHETIC.wrapper]: RH_LANE.wrapper,
  };
  return mapStrings(body, (text) => table[text] ?? text) as T;
}

// Shift every ISO timestamp so the newest equals `nowMs` (keeps relative offsets).
export function atTime<T>(body: T, nowMs: number): T {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const base = Date.parse('2026-10-23T00:00:00.000Z');
  return mapStrings(body, (text) =>
    iso.test(text) ? new Date(nowMs + (Date.parse(text) - base)).toISOString() : text
  ) as T;
}

const entry = deployment.minterEntry;
// getLimits.200 with the deployed on-chain parameters (task 008 manifest).
export function manifestLimits(nowMs: number) {
  const body = loadFixture('getLimits.200').response.body as Record<string, unknown>;
  return {
    ...(body as object),
    deposit: { perTxMax: deployment.escrowMapping.perTxMax, minAmount: '1' },
    exit: { perTxMax: entry.perTxMax, minExit: entry.minExit },
    fee: { feeBps: Number(entry.feeBps), minFee: entry.minFee, maxFeeBps: 100, maxMinFee: entry.maxMinFee },
    observedAt: new Date(nowMs).toISOString(),
  };
}

export function manifestFeeQuote(gross: string, nowMs: number, overrides: Record<string, unknown> = {}) {
  const fee = computeExitFee(gross, Number(entry.feeBps), entry.minFee);
  return {
    assetId: 'TSLA',
    direction: 'ONYX_TO_RH',
    gross,
    fee,
    net: (BigInt(gross) - BigInt(fee)).toString(),
    suggestedMaxFee: fee,
    feeBps: Number(entry.feeBps),
    minFee: entry.minFee,
    quotedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 60000).toISOString(),
    ...overrides,
  };
}

// A healthy, open, manifest-bound API at `nowMs`, keyed by request path.
export function liveRoutes(nowMs: number): Record<string, { status: number; body: unknown }> {
  const ok = (name: string) => ({ status: 200, body: atTime(alignToManifest(loadFixture(name).response.body), nowMs) });
  return {
    '/api/v1/rh/assets': ok('getAssets.200'),
    '/api/v1/rh/limits': { status: 200, body: manifestLimits(nowMs) },
    '/api/v1/rh/health': ok('getHealth.200.ok'),
    '/api/v1/rh/effective-state': ok('getEffectiveState.200.open'),
  };
}

export function jsonResponse(
  url: string,
  status: number,
  body: unknown,
  contentType = 'application/json; charset=utf-8'
): Response {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: false,
    type: 'cors',
    url,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? contentType
          : name.toLowerCase() === 'content-length'
          ? String(text.length)
          : null,
    },
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}
