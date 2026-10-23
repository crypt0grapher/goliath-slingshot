import { RH_API_ORIGIN } from '../../../config/rhBridge';
import { jsonResponse, loadFixture } from '../__fixtures__';
import { fetchByTx, fetchFeeQuote, fetchHealth, fetchStatus } from '../api';
import { createRhApiClient, publicOrigin, requestPath } from '../httpApi';

const ORIGIN = 'https://bridgeapi.testnet.onyx.org';
const transport = (status: number, body: unknown, contentType?: string) =>
  jest.fn(async (url: string) => jsonResponse(url, status, body, contentType));

test('the configured origin is the frozen v1 origin and no base path is configured', () => {
  expect(RH_API_ORIGIN).toBe(ORIGIN);
  expect(publicOrigin(ORIGIN)).toBe(ORIGIN);
});

test.each([
  'http://bridgeapi.testnet.onyx.org',
  'https://bridgeapi.testnet.onyx.org/',
  'https://bridgeapi.testnet.onyx.org/api/v1',
  'https://bridgeapi.testnet.onyx.org/api/v1/rh',
  'https://user:x@bridgeapi.testnet.onyx.org',
  'https://bridgeapi.testnet.onyx.org:8443',
  'https://localhost',
  'https://127.0.0.1',
  'https://api.internal',
  'https://bridgeapi.testnet.onyx.org?k=v',
])('rejects non-origin configuration %p', (origin) => {
  expect(() => createRhApiClient(origin, jest.fn())).toThrow('RH_HTTP_INVALID_CONFIG');
});

test.each([
  [{ kind: 'assets' }, '/api/v1/rh/assets'],
  [{ kind: 'limits' }, '/api/v1/rh/limits'],
  [{ kind: 'health' }, '/api/v1/rh/health'],
  [{ kind: 'effectiveState' }, '/api/v1/rh/effective-state'],
  [{ kind: 'feeQuote', gross: '1000000000000000001' }, '/api/v1/rh/fee-quote?gross=1000000000000000001'],
  [
    { kind: 'status', operationId: 'RH_TO_ONYX:0x0AA4F310aca195e6bcdce93657bca646f90faacce92c2b621a120054781bca05' },
    '/api/v1/rh/status/RH_TO_ONYX%3A0x0aa4f310aca195e6bcdce93657bca646f90faacce92c2b621a120054781bca05',
  ],
  [
    { kind: 'statusByTx', txHash: '0xE60ed361dc20bc458d334797ce4234d9d1869186a42eeb01264f01fba98abf55' },
    '/api/v1/rh/status/by-tx/0xe60ed361dc20bc458d334797ce4234d9d1869186a42eeb01264f01fba98abf55',
  ],
  [
    { kind: 'history', address: '0x7dBe71B743e3e9f542324Dd032D080e9fA1A243A', limit: 50 },
    '/api/v1/rh/history?address=0x7dbe71b743e3e9f542324dd032d080e9fa1a243a&limit=50',
  ],
] as const)('exact v1 path for %p', (request, path) => {
  expect(requestPath(request as any)).toBe(path);
});

test('the percent-encoded status id matches the 005 encoded-id fixture', () => {
  const fx = loadFixture('getStatus.200.encoded-id');
  const id = (fx.response.body as any).operationId as string;
  expect(requestPath({ kind: 'status', operationId: id })).toBe('/api/v1/rh/status/' + encodeURIComponent(id));
  expect(requestPath({ kind: 'status', operationId: id })).toContain('%3A');
});

test.each([
  { kind: 'feeQuote', gross: '1.5' },
  { kind: 'feeQuote', gross: '-1' },
  { kind: 'status', operationId: '46630:0x' + 'a'.repeat(64) }, // a local history id is not an operationId
  { kind: 'status', operationId: 'RH_TO_ONYX:0x' + 'a'.repeat(63) + '/' },
  { kind: 'statusByTx', txHash: '0x1234' },
  { kind: 'history', address: '0x' + '0'.repeat(40) },
  { kind: 'history', address: '0x' + 'a'.repeat(40), cursor: '../x' },
  { kind: 'unknown' },
])('rejects malformed request %p before any transport call', async (request) => {
  const t = transport(200, {});
  const client = createRhApiClient(ORIGIN, t);
  await expect(client.read(request as any)).rejects.toThrow('RH_HTTP_INVALID_REQUEST');
  expect(t).not.toHaveBeenCalled();
});

test('GET only, no credentials, no redirects, no referrer', async () => {
  const t = transport(200, { ok: true });
  await createRhApiClient(ORIGIN, t).read({ kind: 'assets' });
  expect(t).toHaveBeenCalledTimes(1);
  const [url, init] = t.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(ORIGIN + '/api/v1/rh/assets');
  expect(init).toMatchObject({
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    mode: 'cors',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  expect(init.body).toBeUndefined();
});

test('non-JSON, undefined status or oversized responses are invalid; transport errors are unreachable', async () => {
  const html = createRhApiClient(ORIGIN, transport(404, 'not found', 'text/html'));
  await expect(html.read({ kind: 'assets' })).rejects.toThrow('RH_HTTP_INVALID_RESPONSE');
  const teapot = createRhApiClient(ORIGIN, transport(418, {}));
  await expect(teapot.read({ kind: 'assets' })).rejects.toThrow('RH_HTTP_INVALID_RESPONSE');
  const big = createRhApiClient(ORIGIN, transport(200, { x: 'a'.repeat(70000) }));
  await expect(big.read({ kind: 'assets' })).rejects.toThrow('RH_HTTP_INVALID_RESPONSE');
  const down = createRhApiClient(
    ORIGIN,
    jest.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
  );
  await expect(down.read({ kind: 'assets' })).rejects.toThrow('RH_HTTP_UNREACHABLE');
});

test('times out a hanging request', async () => {
  const hang = jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      )
  );
  const client = createRhApiClient(ORIGIN, hang, 20);
  await expect(client.read({ kind: 'health' })).rejects.toThrow('RH_HTTP_TIMEOUT');
});

test('typed outcomes: by-tx 404 is NOT_FOUND, 503 UNAVAILABLE, 429 RATE_LIMITED, 422 REJECTED with its code', async () => {
  const fx = (name: string) => loadFixture(name).response;
  const client = (name: string) => createRhApiClient(ORIGIN, transport(fx(name).status, fx(name).body));
  await expect(fetchByTx(client('getStatusByTx.404'), '0x' + 'a'.repeat(64))).resolves.toMatchObject({
    ok: false,
    failure: 'NOT_FOUND',
  });
  await expect(fetchStatus(client('getStatus.503'), 'RH_TO_ONYX:0x' + 'a'.repeat(64))).resolves.toMatchObject({
    ok: false,
    failure: 'UNAVAILABLE',
  });
  await expect(fetchStatus(client('getStatus.429'), 'RH_TO_ONYX:0x' + 'a'.repeat(64))).resolves.toMatchObject({
    ok: false,
    failure: 'RATE_LIMITED',
  });
  await expect(fetchFeeQuote(client('getFeeQuote.422.below-min-exit'), '999')).resolves.toMatchObject({
    ok: false,
    failure: 'REJECTED',
    error: { code: 'AMOUNT_BELOW_MIN_EXIT' },
  });
  const health = await fetchHealth(client('getHealth.503.down'));
  expect(health).toMatchObject({ ok: true, value: { status: 'down' } });
  const byTx = await fetchByTx(client('getStatusByTx.200'), '0x' + 'a'.repeat(64));
  expect(byTx.ok && byTx.value[0].status).toBe('COMPLETED');
  // A 200 with an unknown shape is INVALID, never trusted.
  await expect(
    fetchByTx(createRhApiClient(ORIGIN, transport(200, { items: [{ operationId: 'x' }] })), '0x' + 'a'.repeat(64))
  ).resolves.toMatchObject({
    ok: false,
    failure: 'INVALID',
  });
});
