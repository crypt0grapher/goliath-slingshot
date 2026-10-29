// SPDX-License-Identifier: Apache-2.0
import { createJsonApiClient, httpFailure } from './httpApi';
import type { FetchTransport, RhApiResponse } from './httpApi';
import type { Binding, Direction } from './v2-types';
import { parseV2, raw256 } from './v2-schema';
export type V2Request =
  | { kind: 'assets' | 'health' }
  | { kind: 'limits'; binding: Binding }
  | { kind: 'effectiveState'; binding: Binding; sender?: string; recipient?: string }
  | { kind: 'feeQuote'; binding: Binding; direction: Direction; gross: string }
  | { kind: 'capacity'; binding: Binding; direction: Direction }
  | { kind: 'status'; operationId: string }
  | { kind: 'statusByTx'; txHash: string; chainId: 46630 | 8901; assetId?: string }
  | { kind: 'history'; address: string; assetId?: string; cursor?: string; limit?: number };
export interface V2ApiClient {
  read(request: V2Request, signal?: AbortSignal): Promise<RhApiResponse>;
}
const address = (s: string) => parseV2<string>('Address', s.toLowerCase());
const asset = (s: string) => parseV2<string>('AssetId', s);
export function v2RequestPath(r: V2Request): string {
  const q = new URLSearchParams();
  let path: string;
  if ('binding' in r) {
    parseV2('Binding', r.binding);
    q.set('assetId', r.binding.assetId);
    q.set('profileSha256', r.binding.profileSha256);
  }
  switch (r.kind) {
    case 'assets':
    case 'health':
      path = r.kind;
      break;
    case 'limits':
      path = 'limits';
      break;
    case 'effectiveState':
      path = 'effective-state';
      if (r.sender) q.set('sender', address(r.sender));
      if (r.recipient) q.set('recipient', address(r.recipient));
      break;
    case 'feeQuote':
      path = 'fee-quote';
      q.set('direction', parseV2('Direction', r.direction));
      q.set('gross', raw256(r.gross));
      break;
    case 'capacity':
      path = 'capacity';
      q.set('direction', parseV2('Direction', r.direction));
      break;
    case 'status':
      path = 'status/' + encodeURIComponent(parseV2<string>('OperationId', r.operationId));
      break;
    case 'statusByTx':
      path = 'status/by-tx/' + parseV2<string>('Hash32', r.txHash.toLowerCase());
      q.set('chainId', String(parseV2('ChainId', r.chainId)));
      if (r.assetId) q.set('assetId', asset(r.assetId));
      break;
    case 'history':
      path = 'history';
      q.set('address', address(r.address));
      if (r.assetId) q.set('assetId', asset(r.assetId));
      if (r.cursor) {
        if (!/^[A-Za-z0-9_-]{1,512}$/.test(r.cursor)) throw httpFailure('INVALID_REQUEST');
        q.set('cursor', r.cursor);
      }
      if (r.limit !== undefined) {
        if (!Number.isInteger(r.limit) || r.limit < 1 || r.limit > 50) throw httpFailure('INVALID_REQUEST');
        q.set('limit', String(r.limit));
      }
      break;
    default:
      throw httpFailure('INVALID_REQUEST');
  }
  return '/api/v1/rh/v2/' + path + (q.toString() ? '?' + q.toString() : '');
}
export const createV2ApiClient = (origin: string, transport: FetchTransport): V2ApiClient =>
  createJsonApiClient(origin, transport, v2RequestPath, [200, 400, 403, 404, 405, 409, 422, 429, 503]);
export async function readV2<T>(client: V2ApiClient, request: V2Request, name: string): Promise<T> {
  const response = await client.read(request);
  if (response.status !== 200) {
    if (request.kind === 'health' && response.status === 503) return parseV2<T>('Health', response.body);
    const error = parseV2<any>('Error', response.body);
    throw new Error('RH_V2_' + error.error.code);
  }
  return parseV2<T>(name, response.body);
}
