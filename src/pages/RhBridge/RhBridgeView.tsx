import React from 'react';
import { LaneBinding } from '../../config/rhBridge';
import { chainLabel, RhDirection } from '../../constants/rhBridge';
import { RhRecord, sameBindings } from '../../state/rhBridge/history';
import { RhBridgeHook } from '../../hooks/rhBridge/useRhBridge';
import { laneTxUrl } from '../../services/rhBridge/explorer';
import { computeExitFee, formatUnits, GATE_MESSAGES } from '../../services/rhBridge/lane';
import * as S from './styleds';

const DIRECTION_LABEL: Record<RhDirection, string> = {
  RH_TO_ONYX: 'Robinhood → Onyx',
  ONYX_TO_RH: 'Onyx → Robinhood',
};
const ALLOWLIST_MESSAGE = {
  SENDER_NOT_ALLOWLISTED:
    'Not allowlisted: this testnet lane runs in restricted mode and your address is not an allowed holder.',
  RECIPIENT_NOT_ALLOWLISTED: 'Not allowlisted: the recipient is not an allowed holder of this restricted testnet lane.',
  ALLOWLIST_UNKNOWN: 'Checking the restricted-mode allowlist…',
};
const BALANCE_MESSAGE = {
  INSUFFICIENT_BALANCE: 'Insufficient TSLA balance on the source chain.',
  NO_GAS: 'No gas: you need native gas (ETH on Robinhood, XCN on Onyx) on the source chain.',
  BALANCE_UNKNOWN: 'Reading balances and allowance…',
  DECIMALS_MISMATCH: 'Token decimals on chain do not match the lane configuration. Live actions stay disabled.',
};

function stageText(record: RhRecord): string {
  switch (record.stage) {
    case 'WALLET_PROMPT':
      return record.step === 'APPROVE' ? 'Waiting for approval signature' : 'Waiting for wallet signature';
    case 'SOURCE_PENDING':
      if (record.step === 'APPROVE') return 'Approval pending on chain';
      return record.sourceBlock !== null
        ? `Source included in block ${record.sourceBlock}; waiting for bridge finality`
        : 'Source transaction pending';
    case 'APPROVED':
      return 'Approved exactly; ready to send';
    case 'SOURCE_FINAL':
      return `Source final; relay pending${record.holdCategory ? ` (${record.holdCategory})` : ''}`;
    case 'RELAY_PENDING':
      return 'Relay pending; destination transaction in flight';
    case 'DELIVERED':
      return 'Destination delivered';
    case 'HELD':
      return `Held${record.holdCategory ? ` (${record.holdCategory})` : ''}`;
    case 'FAILED':
      return `Failed${record.failure ? ` (${record.failure})` : ''}`;
    case 'UNCERTAIN':
      if (record.failure === 'REPLACED_OR_DROPPED') {
        return record.step === 'APPROVE'
          ? 'Approval replaced or dropped (its nonce was used without a receipt). Checking the on-chain allowance; you may approve again.'
          : 'Transaction replaced or dropped (its nonce was used without a receipt). Looking up the replacement; it will not be resent.';
      }
      return 'Outcome unknown: it may have been sent. Check your wallet activity; it will not be resent.';
    case 'DISMISSED':
      return 'Dismissed';
  }
}

function HashLink({ chainId, hash, label }: { chainId: number; hash: string | null; label: string }) {
  if (!hash) return null;
  const url = laneTxUrl(chainId, hash);
  return (
    <div>
      {label} ({chainLabel(chainId)}):{' '}
      {url ? (
        <S.LinkA href={url} target="_blank" rel="noopener noreferrer">
          <S.Mono>{hash}</S.Mono>
        </S.LinkA>
      ) : (
        <S.Mono>{hash}</S.Mono>
      )}
    </div>
  );
}

export function RecordItem({
  record,
  lane,
  canDismiss,
  onDismiss,
}: {
  record: RhRecord;
  lane: LaneBinding;
  canDismiss: boolean;
  onDismiss: (id: string) => void;
}) {
  const source = record.direction === 'RH_TO_ONYX' ? lane.rhChainId : lane.onyxChainId;
  const destination = record.direction === 'RH_TO_ONYX' ? lane.onyxChainId : lane.rhChainId;
  const net = (BigInt(record.grossRaw) - BigInt(record.feeRaw)).toString();
  const foreign = !sameBindings(record.bindings, lane);
  return (
    <S.Item data-testid="rh-record" data-stage={record.stage}>
      <S.FieldRow>
        <strong>{DIRECTION_LABEL[record.direction]}</strong>
        <S.Small>{new Date(record.createdAtMs).toISOString().replace('T', ' ').slice(0, 19)} UTC</S.Small>
      </S.FieldRow>
      <div>{stageText(record)}</div>
      {foreign && <S.Alert tone="warn">Recorded for a different lane deployment; shown only, not tracked.</S.Alert>}
      <S.Small>
        Gross {formatUnits(record.grossRaw, lane.decimals)} · fee {formatUnits(record.feeRaw, lane.decimals)} · net{' '}
        {formatUnits(net, lane.decimals)} {lane.symbol}
      </S.Small>
      <S.Small>
        Recipient: <S.Mono>{record.recipient}</S.Mono>
      </S.Small>
      <HashLink chainId={source} hash={record.approveTxHash} label="Approval" />
      <HashLink chainId={source} hash={record.sourceTxHash} label="Source" />
      <HashLink chainId={source} hash={record.replacedTxHash} label="Replaced or dropped" />
      <HashLink chainId={destination} hash={record.destinationTxHash} label="Destination" />
      {record.operationId && (
        <S.Small>
          Operation: <S.Mono>{record.operationId}</S.Mono>
        </S.Small>
      )}
      {canDismiss && (
        <S.SmallButton type="button" onClick={() => onDismiss(record.id)}>
          {record.stage === 'UNCERTAIN'
            ? 'I checked my wallet: dismiss'
            : record.stage === 'SOURCE_PENDING'
            ? 'No receipt for 30 min: dismiss (nothing is resent)'
            : 'Dismiss'}
        </S.SmallButton>
      )}
    </S.Item>
  );
}

export default function RhBridgeView({
  hook,
  lane,
  onConnect,
}: {
  hook: RhBridgeHook;
  lane: LaneBinding;
  onConnect: () => void;
}) {
  const { snapshot: s, view: v, controller } = hook;
  const fmt = (raw?: string) => (raw === undefined ? '…' : `${formatUnits(raw, lane.decimals)} ${lane.symbol}`);
  const native = v.sourceChainId === lane.rhChainId ? 'ETH' : 'XCN';
  const limits = s.api.limits;
  const quote =
    s.direction === 'ONYX_TO_RH' && v.grossRaw && s.quote.forGross === v.grossRaw ? s.quote.value : undefined;
  const fee = s.direction === 'RH_TO_ONYX' ? '0' : quote?.fee;
  const net =
    v.grossRaw && fee !== undefined && BigInt(fee) < BigInt(v.grossRaw)
      ? (BigInt(v.grossRaw) - BigInt(fee)).toString()
      : undefined;
  const expectedFee =
    s.direction === 'ONYX_TO_RH' && v.grossRaw && limits
      ? computeExitFee(v.grossRaw, limits.fee.feeBps, limits.fee.minFee)
      : undefined;
  const records = s.history.records
    .filter((r) => r.stage !== 'DISMISSED')
    .slice()
    .reverse();
  const bridgeLabel = s.direction === 'RH_TO_ONYX' ? 'Deposit to Onyx' : 'Burn and exit to Robinhood';
  const disabledReason = !v.gate.open ? 'Live actions disabled' : null;

  return (
    <S.Page>
      <S.Card aria-label="Robinhood testnet bridge">
        <S.Header>
          <div>
            <S.Title>Robinhood ↔ Onyx · {lane.symbol}</S.Title>
            <S.Small>
              Testnet only · Robinhood Chain Testnet {lane.rhChainId} · Onyx Testnet {lane.onyxChainId}
            </S.Small>
          </div>
          <S.Badge tone={v.gate.open ? 'ok' : 'bad'} role="status" aria-label="Lane status">
            {v.gate.open ? 'Live' : 'Live actions disabled'}
          </S.Badge>
        </S.Header>

        {!v.gate.open && (
          <S.Alert tone="bad" data-testid="gate-reasons">
            {v.gate.reasons.map((reason) => (
              <span key={reason} style={{ display: 'block' }}>
                {GATE_MESSAGES[reason]}
              </span>
            ))}
          </S.Alert>
        )}
        {s.api.state && (
          <S.Small>
            Finality ETA: Robinhood {s.api.state.finality.robinhood.etaSeconds ?? '?'} s · Onyx{' '}
            {s.api.state.finality.onyx.etaSeconds ?? '?'} s · admission {s.api.state.admission}
          </S.Small>
        )}

        <S.Tabs role="tablist" aria-label="Direction">
          {(['RH_TO_ONYX', 'ONYX_TO_RH'] as RhDirection[]).map((direction) => (
            <S.Tab
              key={direction}
              type="button"
              role="tab"
              aria-selected={s.direction === direction}
              active={s.direction === direction}
              onClick={() => controller.setDirection(direction)}
            >
              {DIRECTION_LABEL[direction]}
            </S.Tab>
          ))}
        </S.Tabs>

        <S.Alert tone="info" data-testid="wallet-state">
          {v.walletBlocker === 'NOT_CONNECTED' && (
            <>
              Connect an injected browser wallet to use this lane.{' '}
              <S.SmallButton type="button" onClick={onConnect}>
                Connect wallet
              </S.SmallButton>
            </>
          )}
          {v.walletBlocker === 'NOT_INJECTED' && (
            <>
              This lane supports injected browser wallets (for example MetaMask) only. WalletConnect and Coinbase Wallet
              link are disabled here.
            </>
          )}
          {v.walletBlocker === 'WRONG_CHAIN' && (
            <>
              Your wallet is on {chainLabel(s.wallet.chainId || 0)}. This direction starts on{' '}
              {chainLabel(v.sourceChainId)}.{' '}
              <S.SmallButton type="button" disabled={s.busy !== null} onClick={() => void controller.switchToSource()}>
                Switch to {chainLabel(v.sourceChainId)}
              </S.SmallButton>
            </>
          )}
          {!v.walletBlocker && (
            <>
              Wallet <S.Mono>{s.wallet.account}</S.Mono> on {chainLabel(s.wallet.chainId || 0)}
            </>
          )}
        </S.Alert>

        <S.Field>
          <S.FieldRow>
            <span>Amount ({lane.symbol})</span>
            <span>
              Balance: {s.chain.sourceBalance === undefined ? '…' : fmt(s.chain.sourceBalance)}{' '}
              {s.chain.sourceBalance !== undefined && (
                <S.SmallButton
                  type="button"
                  onClick={() => controller.setAmount(formatUnits(s.chain.sourceBalance || '0', lane.decimals))}
                >
                  Max
                </S.SmallButton>
              )}
            </span>
          </S.FieldRow>
          <S.Input
            aria-label="Amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
            value={s.amountText}
            onChange={(e) => controller.setAmount(e.target.value)}
          />
        </S.Field>
        <S.Field>
          <span>Recipient on {chainLabel(v.destinationChainId)}</span>
          <S.MonoInput
            aria-label="Recipient"
            autoComplete="off"
            spellCheck={false}
            placeholder={s.wallet.account || '0x…'}
            value={s.recipientText}
            onChange={(e) => controller.setRecipient(e.target.value)}
          />
        </S.Field>

        <S.Rows aria-label="Transfer details">
          <dt>You send</dt>
          <dd>{v.grossRaw ? fmt(v.grossRaw) : '—'}</dd>
          <dt>Bridge fee</dt>
          <dd>
            {s.direction === 'RH_TO_ONYX'
              ? `0 ${lane.symbol} (deposits carry no fee)`
              : quote
              ? fmt(quote.fee)
              : expectedFee
              ? `≈ ${fmt(expectedFee)}`
              : '—'}
          </dd>
          <dt>Recipient gets</dt>
          <dd>{net ? fmt(net) : '—'}</dd>
          {s.direction === 'ONYX_TO_RH' && (
            <>
              <dt>Max fee (burn maxFee)</dt>
              <dd>{quote ? fmt(quote.suggestedMaxFee) : '—'}</dd>
              <dt>On-chain fee check</dt>
              <dd>
                {!quote
                  ? '—'
                  : s.quote.onchain
                  ? `minter feeFor = ${fmt(s.quote.onchain.fee)}`
                  : s.quote.onchainFailure
                  ? 'mismatch / unavailable'
                  : '…'}
              </dd>
              <dt>Minimum exit</dt>
              <dd>{limits ? fmt(limits.exit.minExit) : '—'}</dd>
              <dt>Fee rule</dt>
              <dd>{limits ? `max(${fmt(limits.fee.minFee)}, ${limits.fee.feeBps} bps of gross, rounded up)` : '—'}</dd>
              <dt>Quote expires</dt>
              <dd>{quote ? new Date(quote.expiresAtMs).toISOString().slice(11, 19) + ' UTC' : '—'}</dd>
            </>
          )}
          {s.direction === 'RH_TO_ONYX' && limits && (
            <>
              <dt>Minimum deposit</dt>
              <dd>{fmt(limits.deposit.minAmount)}</dd>
            </>
          )}
          <dt>Per-transaction max</dt>
          <dd>{limits ? fmt(s.direction === 'RH_TO_ONYX' ? limits.deposit.perTxMax : limits.exit.perTxMax) : '—'}</dd>
          <dt>Remaining capacity</dt>
          <dd>{s.chain.remainingCapacity === undefined ? '…' : fmt(s.chain.remainingCapacity)}</dd>
          <dt>Approval (exact)</dt>
          <dd>{s.chain.allowance === undefined ? '…' : fmt(s.chain.allowance)}</dd>
          <dt>Gas balance</dt>
          <dd>{s.chain.nativeBalance === undefined ? '…' : `${formatUnits(s.chain.nativeBalance, 18)} ${native}`}</dd>
          <dt>Allowlist</dt>
          <dd>
            {s.chain.restricted === undefined
              ? '…'
              : s.chain.restricted
              ? s.chain.senderAllowed
                ? 'restricted mode · you are allowed'
                : 'restricted mode · not allowlisted'
              : 'open'}
          </dd>
        </S.Rows>

        {v.amountError && <S.Alert tone="bad">{v.amountError}</S.Alert>}
        {v.recipientError && <S.Alert tone="bad">{v.recipientError}</S.Alert>}
        {v.allowlistBlocker && (
          <S.Alert tone={v.allowlistBlocker === 'ALLOWLIST_UNKNOWN' ? 'info' : 'bad'} data-testid="allowlist">
            {ALLOWLIST_MESSAGE[v.allowlistBlocker]}
          </S.Alert>
        )}
        {v.balanceError && (
          <S.Alert tone={v.balanceError === 'BALANCE_UNKNOWN' ? 'info' : 'bad'}>
            {BALANCE_MESSAGE[v.balanceError]}
          </S.Alert>
        )}
        {v.capacityError === 'ABOVE_CAPACITY' && (
          <S.Alert tone="bad">Above the remaining on-chain bridge capacity for this direction.</S.Alert>
        )}
        {s.chain.failure && <S.Alert tone="warn">{s.chain.failure}</S.Alert>}
        {v.quoteError && <S.Alert tone="warn">{v.quoteError}</S.Alert>}
        {v.pendingRecord && (
          <S.Alert tone="warn">
            An earlier request in this direction is unresolved (see history). Resolve or dismiss it before sending
            again.
          </S.Alert>
        )}
        {s.history.status !== 'READY' && (
          <S.Alert tone="bad">
            Stored RH history is unreadable. Nothing was cleared; live actions stay disabled.
          </S.Alert>
        )}
        {s.notice && (
          <S.Alert tone="warn" role="alert">
            {s.notice}
          </S.Alert>
        )}

        <S.Actions>
          {(v.needsApproval || (!v.canBridge && !v.approvedRecord)) && (
            <S.Button type="button" disabled={!v.canApprove} onClick={() => void controller.approve()}>
              {s.busy === 'APPROVE'
                ? 'Confirm in wallet…'
                : v.grossRaw
                ? `Approve exactly ${fmt(v.grossRaw)}`
                : 'Approve the exact amount'}
            </S.Button>
          )}
          <S.Button type="button" disabled={!v.canBridge} onClick={() => void controller.bridge()}>
            {s.busy === 'BRIDGE' ? 'Confirm in wallet…' : disabledReason || bridgeLabel}
          </S.Button>
          {s.direction === 'ONYX_TO_RH' && (
            <S.Button
              type="button"
              secondary
              disabled={!v.grossRaw || s.busy !== null}
              onClick={() => void controller.refreshQuote()}
            >
              Refresh quote
            </S.Button>
          )}
        </S.Actions>
        <S.Small style={{ marginTop: '0.75rem' }}>
          Each step is one wallet request you confirm yourself. Nothing is retried or re-sent automatically. Bridge ETA
          follows source finality
          {s.api.state?.finality.robinhood.etaSeconds
            ? ` (Robinhood ≈ ${Math.round(s.api.state.finality.robinhood.etaSeconds / 60)} min)`
            : ''}
          .
        </S.Small>
      </S.Card>

      <S.Card aria-label="Balances">
        <S.Title>Balances</S.Title>
        <S.Rows>
          <dt>{lane.symbol} on Robinhood Chain Testnet</dt>
          <dd>{s.chain.rhBalance === undefined ? '—' : fmt(s.chain.rhBalance)}</dd>
          <dt>{lane.symbol} on Onyx Testnet (bridged)</dt>
          <dd>{s.chain.onyxBalance === undefined ? '—' : fmt(s.chain.onyxBalance)}</dd>
        </S.Rows>
      </S.Card>

      <S.Card aria-label="RH testnet history">
        <S.Title>History (this browser)</S.Title>
        {s.history.invalidRows > 0 && (
          <S.Alert tone="warn" data-testid="invalid-rows">
            {s.history.invalidRows} stored record(s) failed validation and are ignored (kept, not cleared).
          </S.Alert>
        )}
        {records.length === 0 ? (
          <S.Small>No Robinhood lane operations recorded in this browser.</S.Small>
        ) : (
          <S.List>
            {records.map((record) => (
              <RecordItem
                key={record.id}
                record={record}
                lane={lane}
                canDismiss={controller.canDismiss(record)}
                onDismiss={(id) => controller.dismiss(id)}
              />
            ))}
          </S.List>
        )}
        <S.Small style={{ marginTop: '0.75rem' }}>
          <S.LinkA href="#/bridge">Back to the Sepolia ↔ Onyx bridge</S.LinkA>
        </S.Small>
      </S.Card>
    </S.Page>
  );
}
