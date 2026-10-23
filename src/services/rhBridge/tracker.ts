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
export function operationMatches(record: RhRecord, op: Operation): boolean {
  const { source } = chainPair(record.direction);
  return (
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
  api: RhApiClient;
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
    !deps.claimedHashes.includes(item.source.txHash) &&
    item.createdAtMs >= record.createdAtMs - RECOVERY_WINDOW_MS;
  let op: Operation | undefined;
  if (record.replacedTxHash) {
    const byTx = await fetchByTx(deps.api, record.replacedTxHash);
    if (byTx.ok) op = byTx.value.find(usable);
  }
  if (!op) {
    const history = await fetchHistory(deps.api, record.account);
    if (history.ok) op = history.value.items.find(usable);
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
    const result = await fetchByTx(deps.api, record.sourceTxHash);
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
    const result = await fetchStatus(deps.api, record.operationId);
    if (result.ok && operationMatches(record, result.value)) push(stageFromOperation(result.value).patch, record);
    return patches;
  }

  if (record.stage === 'UNCERTAIN') return resolveUncertain(record, deps);
  return [];
}
