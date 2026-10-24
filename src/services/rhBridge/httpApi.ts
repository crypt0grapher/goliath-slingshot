// GET-only client for the frozen RH public API v1 under <origin>/api/v1/rh/...
// The origin is configured alone (frontend-path-map.v1.json "convention"); this module
// appends every path itself. Responses are returned as untrusted, deep-frozen JSON with
// their HTTP status; schema validation is the caller's job (schema.ts).

export type RhApiRequest =
  | { kind: 'assets' | 'limits' | 'health' | 'effectiveState' }
  | { kind: 'feeQuote'; gross: string }
  | { kind: 'status'; operationId: string }
  | { kind: 'statusByTx'; txHash: string }
  | { kind: 'history'; address: string; cursor?: string; limit?: number };

export interface RhApiResponse {
  readonly status: number;
  readonly body: unknown;
}
export type FetchTransport = (url: string, init: RequestInit) => Promise<Response>;

type Failure = 'INVALID_CONFIG' | 'INVALID_REQUEST' | 'UNREACHABLE' | 'TIMEOUT' | 'ABORTED' | 'INVALID_RESPONSE';
export const httpFailure = (code: Failure): Error => new Error('RH_HTTP_' + code);

const MAX_BYTES = 65536;
const TIMEOUT_MS = 10000;
// Statuses the v1 contract defines with a JSON body (Error envelope or Health).
const DEFINED_STATUSES = [200, 400, 404, 422, 429, 503];

export function publicOrigin(input: unknown): string {
  try {
    if (typeof input !== 'string' || /[\s\\%?#@]/.test(input)) throw httpFailure('INVALID_CONFIG');
    const url = new URL(input);
    const hostname = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || url.port || input !== url.origin)
      throw httpFailure('INVALID_CONFIG');
    if (
      hostname.length > 253 ||
      hostname.endsWith('.') ||
      !/^[a-z0-9.-]+$/.test(hostname) ||
      /^[0-9.]+$/.test(hostname)
    ) {
      throw httpFailure('INVALID_CONFIG');
    }
    const labels = hostname.split('.');
    if (
      labels.length < 2 ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      ['localhost', 'local', 'internal', 'localdomain', 'lan'].includes(labels[labels.length - 1])
    ) {
      throw httpFailure('INVALID_CONFIG');
    }
    return url.origin;
  } catch {
    throw httpFailure('INVALID_CONFIG');
  }
}

export function requestPath(request: RhApiRequest): string {
  const base = '/api/v1/rh/';
  switch (request.kind) {
    case 'assets':
    case 'limits':
    case 'health':
      return base + request.kind;
    case 'effectiveState':
      return base + 'effective-state';
    case 'feeQuote':
      if (typeof request.gross !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(request.gross))
        throw httpFailure('INVALID_REQUEST');
      return base + 'fee-quote?gross=' + request.gross;
    case 'status': {
      if (
        typeof request.operationId !== 'string' ||
        !/^(RH_TO_ONYX|ONYX_TO_RH):0x[0-9a-fA-F]{64}$/.test(request.operationId)
      ) {
        throw httpFailure('INVALID_REQUEST');
      }
      // v1 percent-decodes the segment (x-path-encoding); RH_TO_ONYX%3A0x... is sent.
      const [prefix, id] = request.operationId.split(':');
      return base + 'status/' + encodeURIComponent(prefix + ':' + id.toLowerCase());
    }
    case 'statusByTx':
      if (typeof request.txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(request.txHash))
        throw httpFailure('INVALID_REQUEST');
      return base + 'status/by-tx/' + request.txHash.toLowerCase();
    case 'history': {
      if (
        typeof request.address !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(request.address) ||
        /^0x0{40}$/.test(request.address)
      ) {
        throw httpFailure('INVALID_REQUEST');
      }
      let path = base + 'history?address=' + request.address.toLowerCase();
      if (request.cursor !== undefined) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.cursor)) throw httpFailure('INVALID_REQUEST');
        path += '&cursor=' + request.cursor;
      }
      if (request.limit !== undefined) {
        if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 50)
          throw httpFailure('INVALID_REQUEST');
        path += '&limit=' + request.limit;
      }
      return path;
    }
    default:
      throw httpFailure('INVALID_REQUEST');
  }
}

function deepFreeze<T>(value: T, depth = 0): T {
  if (value !== null && typeof value === 'object') {
    if (depth > 32) throw httpFailure('INVALID_RESPONSE');
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, depth + 1));
    Object.freeze(value);
  }
  return value;
}

export interface RhApiClient {
  readonly origin: string;
  read(request: RhApiRequest, signal?: AbortSignal): Promise<RhApiResponse>;
}

export function createJsonApiClient<R>(
  inputOrigin: string,
  transport: FetchTransport,
  pathFor: (request: R) => string,
  statuses: readonly number[],
  timeoutMs = TIMEOUT_MS
): { readonly origin: string; read(request: R, signal?: AbortSignal): Promise<RhApiResponse> } {
  const origin = publicOrigin(inputOrigin);
  if (typeof transport !== 'function') throw httpFailure('INVALID_CONFIG');
  return Object.freeze({
    origin,
    async read(request: R, signal?: AbortSignal): Promise<RhApiResponse> {
      const url = origin + pathFor(request);
      if (signal?.aborted) throw httpFailure('ABORTED');
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      let timedOut = false;
      const onAbort = () => controller?.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
      }, timeoutMs);
      try {
        let response: Response;
        try {
          response = await transport(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
            mode: 'cors',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: controller?.signal,
          });
        } catch {
          throw httpFailure(timedOut ? 'TIMEOUT' : signal?.aborted ? 'ABORTED' : 'UNREACHABLE');
        }
        if (!response || response.redirected || ['opaque', 'opaqueredirect', 'error'].includes(response.type)) {
          throw httpFailure('INVALID_RESPONSE');
        }
        if (!statuses.includes(response.status)) throw httpFailure('INVALID_RESPONSE');
        const contentType = response.headers.get('content-type') || '';
        if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(contentType))
          throw httpFailure('INVALID_RESPONSE');
        const declared = Number(response.headers.get('content-length') || '0');
        if (declared > MAX_BYTES) throw httpFailure('INVALID_RESPONSE');
        let text: string;
        try {
          text = await response.text();
        } catch {
          throw httpFailure(timedOut ? 'TIMEOUT' : 'UNREACHABLE');
        }
        if (text.length > MAX_BYTES) throw httpFailure('INVALID_RESPONSE');
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw httpFailure('INVALID_RESPONSE');
        }
        return Object.freeze({ status: response.status, body: deepFreeze(body) });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    },
  });
}

export function createRhApiClient(inputOrigin: string, transport: FetchTransport, timeoutMs = TIMEOUT_MS): RhApiClient {
  return createJsonApiClient(inputOrigin, transport, requestPath, DEFINED_STATUSES, timeoutMs);
}

export function createBrowserRhApiClient(origin: string): RhApiClient {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') throw httpFailure('UNREACHABLE');
  const captured = window.fetch.bind(window);
  return createRhApiClient(origin, captured);
}
