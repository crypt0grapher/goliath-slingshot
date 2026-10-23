// Typed reads of the RH public API v1 with explicit outcomes. Every body is validated
// against the frozen schema; an unexpected status or shape is INVALID, never trusted.
import { RhApiClient, RhApiRequest } from './httpApi';
import {
  ApiError,
  Assets,
  EffectiveState,
  FeeQuote,
  Health,
  History,
  Limits,
  Operation,
  parseAssets,
  parseEffectiveState,
  parseError,
  parseFeeQuote,
  parseHealth,
  parseHistory,
  parseLimits,
  parseOperation,
  parseOperationList,
} from './schema';

export type ApiFailure = 'UNREACHABLE' | 'UNAVAILABLE' | 'RATE_LIMITED' | 'INVALID' | 'NOT_FOUND' | 'REJECTED';
export type ApiResult<T> = { ok: true; value: T } | { ok: false; failure: ApiFailure; error?: ApiError };

async function read<T>(
  client: RhApiClient,
  request: RhApiRequest,
  parse: (body: unknown) => T,
  signal?: AbortSignal,
  also?: number[]
): Promise<ApiResult<T>> {
  let response;
  try {
    response = await client.read(request, signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ok: false, failure: message === 'RH_HTTP_INVALID_RESPONSE' ? 'INVALID' : 'UNREACHABLE' };
  }
  if (response.status === 200 || (also && also.includes(response.status))) {
    try {
      return { ok: true, value: parse(response.body) };
    } catch {
      return { ok: false, failure: 'INVALID' };
    }
  }
  let error: ApiError | undefined;
  try {
    error = parseError(response.body);
  } catch {
    return { ok: false, failure: 'INVALID' };
  }
  const failure: ApiFailure =
    response.status === 404
      ? 'NOT_FOUND'
      : response.status === 429
      ? 'RATE_LIMITED'
      : response.status === 503
      ? 'UNAVAILABLE'
      : 'REJECTED';
  return { ok: false, failure, error };
}

export const fetchAssets = (c: RhApiClient, s?: AbortSignal): Promise<ApiResult<Assets>> =>
  read(c, { kind: 'assets' }, parseAssets, s);
export const fetchLimits = (c: RhApiClient, s?: AbortSignal): Promise<ApiResult<Limits>> =>
  read(c, { kind: 'limits' }, parseLimits, s);
// 503 carries a Health body with status "down".
export const fetchHealth = (c: RhApiClient, s?: AbortSignal): Promise<ApiResult<Health>> =>
  read(c, { kind: 'health' }, parseHealth, s, [503]);
export const fetchEffectiveState = (c: RhApiClient, s?: AbortSignal): Promise<ApiResult<EffectiveState>> =>
  read(c, { kind: 'effectiveState' }, parseEffectiveState, s);
export const fetchFeeQuote = (c: RhApiClient, gross: string, s?: AbortSignal): Promise<ApiResult<FeeQuote>> =>
  read(c, { kind: 'feeQuote', gross }, parseFeeQuote, s);
export const fetchStatus = (c: RhApiClient, operationId: string, s?: AbortSignal): Promise<ApiResult<Operation>> =>
  read(c, { kind: 'status', operationId }, parseOperation, s);
// 404 until the source event is finalized and recorded: keep polling, never resend.
export const fetchByTx = (c: RhApiClient, txHash: string, s?: AbortSignal): Promise<ApiResult<Operation[]>> =>
  read(c, { kind: 'statusByTx', txHash }, parseOperationList, s);
export const fetchHistory = (c: RhApiClient, address: string, s?: AbortSignal): Promise<ApiResult<History>> =>
  read(c, { kind: 'history', address, limit: 50 }, parseHistory, s);
