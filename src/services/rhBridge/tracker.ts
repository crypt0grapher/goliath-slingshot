// Read-only status recovery for stored RH lane records: receipts from the public RPCs and
// operations from the API (by-tx, status, history). Produces record patches only; it never
// prompts the wallet and never re-sends anything.
import { LaneBinding, RH_REPLACEMENT_GRACE_MS } from '../../config/rhBridge';
import { chainPair } from '../../constants/rhBridge';
import { RecordPatch, RhRecord, Stage } from '../../state/rhBridge/history';
import { fetchByTx, fetchHistory, fetchStatus } from './api';
import { ChainReader, readAllowance } from './chainReads';
import { RhApiClient } from './httpApi';
import { approvalTarget } from './lane';
import { Operation } from './schema';
import type {
  Binding,
  Operation as V2Operation,
  OperationList as V2OperationList,
  History as V2History,
} from './v2-types';
import type { V2ApiClient } from './v2-api';
import { readV2 } from './v2-api';
import { sameBinding, timeMs } from './v2-schema';
import { RH_LANE } from '../../config/rhBridge';
import { sameBindings } from '../../state/rhBridge/history';
export type BoundOperation = Operation & { binding?: Binding };
export const operationClaim = (binding: Binding, operationId: string, chainId: number) =>
  [chainId, binding.assetId, binding.profileSha256, binding.profileVersion, binding.abiVersion, operationId].join('|');
function validateOperation(op: V2Operation): void {
  const pair = chainPair(op.direction);
  if (
    !op.operationId.startsWith(op.direction + ':') ||
    op.source.chainId !== pair.source ||
    op.destination.chainId !== pair.destination ||
    !op.source.final ||
    !op.source.txHash ||
    op.source.logIndex === null ||
    op.source.blockNumber === null ||
    BigInt(op.grossAmount) !== BigInt(op.fee) + BigInt(op.netAmount) ||
    BigInt(op.grossAmount) === BigInt(0) ||
    BigInt(op.netAmount) === BigInt(0) ||
    (op.direction === 'RH_TO_ONYX' && op.fee !== '0') ||
    (op.status === 'COMPLETED') !== (op.completedAt !== null) ||
    (op.status === 'COMPLETED' &&
      (!op.destination.final ||
        !op.destination.txHash ||
        op.destination.logIndex === null ||
        op.destination.blockNumber === null))
  )
    throw new Error('RH_V2_OPERATION_MISMATCH');
}
function trackedOperation(op: V2Operation, binding: Binding): BoundOperation {
  if (!sameBinding(op.binding, binding)) throw new Error('RH_V2_OPERATION_MISMATCH');
  validateOperation(op);
  return {
    ...op,
    source: { ...op.source, logIndex: op.source.logIndex ?? undefined },
    destination: { ...op.destination, logIndex: op.destination.logIndex ?? undefined },
    assetId: binding.assetId,
    createdAtMs: timeMs(op.createdAt),
    updatedAtMs: timeMs(op.updatedAt),
    completedAtMs: op.completedAt === null ? null : timeMs(op.completedAt),
  };
}
function operationsForProfile(items: readonly V2Operation[], binding: Binding, address?: string): BoundOperation[] {
  // A malformed/filter-inconsistent row still invalidates the response. A valid historical
  // profile for this same asset must not poison recovery of the exact recorded profile.
  for (const op of items) {
    validateOperation(op);
    if (
      op.binding.assetId !== binding.assetId ||
      (address !== undefined && op.sender !== address && op.recipient !== address)
    )
      throw new Error('RH_HISTORY_FILTER');
  }
  return items.filter((op) => sameBinding(op.binding, binding)).map((op) => trackedOperation(op, binding));
}
async function byTx(deps: TrackDeps, hash: string): Promise<{ ok: true; value: BoundOperation[] } | { ok: false }> {
  if (!deps.v2) return fetchByTx(deps.api!, hash);
  try {
    const pair = chainPair(deps.direction!);
    const value = await readV2<V2OperationList>(
      deps.v2.api,
      { kind: 'statusByTx', txHash: hash, chainId: pair.source, assetId: deps.v2.binding.assetId },
      'OperationList'
    );
    return { ok: true, value: operationsForProfile(value.items, deps.v2.binding) };
  } catch {
    return { ok: false };
  }
}
async function history(
  deps: TrackDeps,
  account: string
): Promise<{ ok: true; value: { items: BoundOperation[] } } | { ok: false }> {
  if (!deps.v2) return fetchHistory(deps.api!, account);
  try {
    const items: BoundOperation[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const value = await readV2<V2History>(
        deps.v2.api,
        { kind: 'history', address: account, assetId: deps.v2.binding.assetId, cursor, limit: 50 },
        'History'
      );
      if (value.address !== account || value.assetId !== deps.v2.binding.assetId) throw new Error('RH_HISTORY_FILTER');
      items.push(...operationsForProfile(value.items, deps.v2.binding, account));
      if (!value.nextCursor) break;
      cursor = value.nextCursor;
    }
    return { ok: true, value: { items } };
  } catch {
    return { ok: false };
  }
}

// How far before the intent a recovered operation may have been created (clock skew).
const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

export function stageFromOperation(op: Operation): { stage: Stage; patch: RecordPatch } {
  const stage: Stage =
    op.status === 'COMPLETED'
      ? 'DELIVERED'
      : op.status === 'HELD'
      ? 'HELD'
      : op.status === 'EXECUTING'
      ? 'RELAY_PENDING'
      : 'SOURCE_FINAL';
  return {
    stage,
    patch: {
      stage,
      operationId: op.operationId,
      destinationTxHash: op.destination.txHash,
      holdCategory: op.holdCategory,
    },
  };
}

// The API operation that belongs to this record: same direction, sender, recipient, amount
// and source chain, and (when known) the same source transaction.
export function operationMatches(record: RhRecord, op: BoundOperation): boolean {
  const { source } = chainPair(record.direction);
  return (
    (record.assetBinding
      ? !!op.binding && sameBinding(record.assetBinding, op.binding)
      : op.assetId === 'TSLA' &&
        sameBindings(record.bindings, RH_LANE) &&
        (!op.binding ||
          (op.binding.assetId === 'TSLA' &&
            op.binding.profileSha256 === '38a14bcb94536c4efb8d62d9d0a42ae702117db3e495f6884cf25839da47ee8e' &&
            op.binding.profileVersion === 1 &&
            op.binding.abiVersion === 'rh-stock-bridge-abi-12fc53612bcf'))) &&
    op.direction === record.direction &&
    op.sender === record.account &&
    op.recipient === record.recipient &&
    op.grossAmount === record.grossRaw &&
    op.source.chainId === source &&
    (record.sourceTxHash === null || op.source.txHash === record.sourceTxHash) &&
    (record.operationId === null || op.operationId === record.operationId)
  );
}

export interface TrackDeps {
  api: RhApiClient | null;
  v2?: { api: V2ApiClient; binding: Binding };
  direction?: RhRecord['direction'];
  claimedOperations?: readonly string[];
  chains: ChainReader;
  lane: LaneBinding;
  nowMs: number;
  // Source hashes already attached to other records (never claim one twice).
  claimedHashes: readonly string[];
}

function changed(record: RhRecord, patch: RecordPatch): boolean {
  return (Object.keys(patch) as (keyof RecordPatch)[]).some((key) => patch[key] !== record[key]);
}

type Detection =
  | { kind: 'MINED'; status: 0 | 1; blockNumber: number }
  | { kind: 'REPLACED' }
  | { kind: 'PENDING'; nonce?: number };

// A pending hash without a receipt is replaced or dropped once the account's latest nonce
// has passed the transaction's nonce (exact when the RPC knows the transaction, otherwise the
// pending nonce read before the prompt), after a propagation grace period. The receipt is
// re-read after the nonce so a transaction mined in between is never mistaken for replaced.
async function detect(record: RhRecord, hash: string, deps: TrackDeps): Promise<Detection> {
  const { source } = chainPair(record.direction);
  const first = await deps.chains.getReceipt(source, hash);
  if (first) return { kind: 'MINED', status: first.status, blockNumber: first.blockNumber };
  const tx = await deps.chains.getTransaction(source, hash);
  const nonce = tx && tx.from === record.account ? tx.nonce : record.txNonce;
  if (nonce === null || deps.nowMs - record.updatedAtMs < RH_REPLACEMENT_GRACE_MS) {
    return { kind: 'PENDING', nonce: tx ? tx.nonce : undefined };
  }
  const latest = await deps.chains.getTransactionCount(source, record.account, 'latest');
  if (latest <= nonce) return { kind: 'PENDING', nonce: tx ? tx.nonce : undefined };
  const second = await deps.chains.getReceipt(source, hash);
  if (second) return { kind: 'MINED', status: second.status, blockNumber: second.blockNumber };
  return { kind: 'REPLACED' };
}

async function resolveUncertain(record: RhRecord, deps: TrackDeps): Promise<RecordPatch[]> {
  if (record.step === 'APPROVE') {
    // An approval sets an exact allowance: if it is on chain, the step is done.
    const target = approvalTarget(record.direction, deps.lane);
    const allowance = await readAllowance(deps.chains, target.chainId, target.token, record.account, target.spender);
    return BigInt(allowance) >= BigInt(record.grossRaw) ? [{ stage: 'APPROVED', failure: null }] : [];
  }
  // Deposit or burn: the replaced/original hash via by-tx first, then the account history.
  const usable = (item: Operation) =>
    operationMatches(record, item) &&
    item.source.txHash !== null &&
    (deps.v2
      ? !deps.claimedOperations?.includes(operationClaim(deps.v2.binding, item.operationId, item.source.chainId))
      : !deps.claimedHashes.includes(item.source.txHash)) &&
    item.createdAtMs >= record.createdAtMs - RECOVERY_WINDOW_MS;
  let op: Operation | undefined;
  if (record.replacedTxHash) {
    const result = await byTx(deps, record.replacedTxHash);
    if (result.ok) {
      const matches = result.value.filter(usable);
      if (matches.length === 1) op = matches[0];
    }
  }
  if (!op) {
    const result = await history(deps, record.account);
    if (result.ok) {
      const matches = result.value.items.filter(usable);
      if (matches.length === 1) op = matches[0];
    }
  }
  if (!op || !op.source.txHash) return [];
  return [{ stage: 'SOURCE_PENDING', sourceTxHash: op.source.txHash, failure: null }, stageFromOperation(op).patch];
}

export async function trackRecord(record: RhRecord, deps: TrackDeps): Promise<RecordPatch[]> {
  const patches: RecordPatch[] = [];
  const push = (patch: RecordPatch, base: RhRecord) => {
    if (changed(base, patch)) patches.push(patch);
  };
  const replaced = async (hash: string): Promise<RecordPatch[]> => {
    const move: RecordPatch =
      record.step === 'APPROVE'
        ? { stage: 'UNCERTAIN', failure: 'REPLACED_OR_DROPPED', replacedTxHash: hash, approveTxHash: null }
        : { stage: 'UNCERTAIN', failure: 'REPLACED_OR_DROPPED', replacedTxHash: hash, sourceTxHash: null };
    const after = { ...record, ...move } as RhRecord;
    return [move, ...(await resolveUncertain(after, deps))];
  };

  if (record.stage === 'SOURCE_PENDING' && record.step === 'APPROVE' && record.approveTxHash) {
    const found = await detect(record, record.approveTxHash, deps);
    if (found.kind === 'REPLACED') return replaced(record.approveTxHash);
    if (found.kind === 'PENDING')
      return found.nonce !== undefined && found.nonce !== record.txNonce ? [{ txNonce: found.nonce }] : [];
    return [found.status === 1 ? { stage: 'APPROVED' } : { stage: 'FAILED', failure: 'APPROVAL_REVERTED' }];
  }

  if (record.stage === 'SOURCE_PENDING' && record.step === 'BRIDGE' && record.sourceTxHash) {
    if (record.sourceBlock === null) {
      const found = await detect(record, record.sourceTxHash, deps);
      if (found.kind === 'REPLACED') return replaced(record.sourceTxHash);
      if (found.kind === 'PENDING')
        return found.nonce !== undefined && found.nonce !== record.txNonce ? [{ txNonce: found.nonce }] : [];
      if (found.status === 0) return [{ stage: 'FAILED', failure: 'SOURCE_REVERTED' }];
      patches.push({ sourceBlock: found.blockNumber });
    }
    const result = await byTx(deps, record.sourceTxHash);
    if (result.ok) {
      const op = result.value.find((item) => operationMatches(record, item));
      if (op) push(stageFromOperation(op).patch, record);
    }
    return patches;
  }

  if (
    (record.stage === 'SOURCE_FINAL' || record.stage === 'RELAY_PENDING' || record.stage === 'HELD') &&
    record.operationId
  ) {
    let result: { ok: true; value: BoundOperation } | { ok: false };
    if (deps.v2) {
      try {
        result = {
          ok: true,
          value: trackedOperation(
            await readV2<V2Operation>(deps.v2.api, { kind: 'status', operationId: record.operationId }, 'Operation'),
            deps.v2.binding
          ),
        };
      } catch {
        result = { ok: false };
      }
    } else result = await fetchStatus(deps.api!, record.operationId);
    if (result.ok && operationMatches(record, result.value)) push(stageFromOperation(result.value).patch, record);
    return patches;
  }

  if (record.stage === 'UNCERTAIN') return resolveUncertain(record, deps);
  return [];
}
