// Pure derivation of what the RH lane page may do right now. Every live action is
// disabled unless the API is healthy, bound to the manifest and not held, the wallet is
// an injected wallet on the source chain, and amount, recipient, balance, gas, allowlist
// on-chain capacity and (for exits) a fresh fee quote equal to the minter's on-chain fee all check out.
import { LaneBinding } from '../../config/rhBridge';
import { chainPair, RhDirection } from '../../constants/rhBridge';
import { HistoryView, RhRecord, sameBindings } from '../../state/rhBridge/history';
import { ApiFailure } from '../../services/rhBridge/api';
import {
  GateResult,
  laneGate,
  OnchainFee,
  parseUnits,
  validateAmount,
  validateFeeQuote,
  validateRecipient,
} from '../../services/rhBridge/lane';
import { Assets, EffectiveState, FeeQuote, Health, Limits } from '../../services/rhBridge/schema';
import type { V2Snapshot } from './v2';
import { deriveV2View } from './v2';

export interface WalletState {
  account: string | null; // lowercase
  chainId: number | null;
  isInjected: boolean;
  hasProvider: boolean;
}
export interface ApiSnapshot {
  assets?: Assets;
  limits?: Limits;
  health?: Health;
  state?: EffectiveState;
  failure?: ApiFailure | 'NO_CLIENT';
  updatedAtMs?: number;
}
export interface QuoteSnapshot {
  forGross?: string;
  value?: FeeQuote;
  failure?: string;
  onchain?: OnchainFee; // StockBridgeMinter.feeFor() and ceiling inputs matching `value`
  onchainFailure?: string;
}
export interface ChainSnapshot {
  key?: string; // account|direction|recipient the reads belong to
  decimals?: number;
  sourceBalance?: string;
  rhBalance?: string;
  onyxBalance?: string;
  allowance?: string;
  nativeBalance?: string;
  restricted?: boolean;
  senderAllowed?: boolean;
  recipientAllowed?: boolean; // escrow check (deposit)
  recipientMintAllowed?: boolean; // minter check (deposit destination)
  remainingCapacity?: string; // on-chain room for one transfer in this direction (raw)
  failure?: string;
}
export interface LaneSnapshot {
  direction: RhDirection;
  amountText: string;
  recipientText: string;
  wallet: WalletState;
  api: ApiSnapshot;
  quote: QuoteSnapshot;
  chain: ChainSnapshot;
  history: HistoryView;
  busy: null | 'APPROVE' | 'BRIDGE' | 'SWITCH';
  notice: string | null;
  v2?: V2Snapshot | null;
  // Presentation only; freshness and action authority still come from v2.
  v2Loading?: boolean;
  // Display only: last complete read for this exact context; never consulted by action derivation.
  v2Display?: V2Snapshot | null;
}

export const chainKey = (account: string | null, direction: RhDirection, recipient: string | null): string =>
  [account || '', direction, recipient || ''].join('|');

export interface LaneView {
  gate: GateResult;
  sourceChainId: number;
  destinationChainId: number;
  grossRaw?: string;
  amountError?: string;
  recipient?: string;
  recipientError?: string;
  walletBlocker?: 'NOT_CONNECTED' | 'NOT_INJECTED' | 'WRONG_CHAIN';
  allowlistBlocker?: 'SENDER_NOT_ALLOWLISTED' | 'RECIPIENT_NOT_ALLOWLISTED' | 'ALLOWLIST_UNKNOWN';
  quoteError?: string;
  balanceError?: 'INSUFFICIENT_BALANCE' | 'NO_GAS' | 'BALANCE_UNKNOWN' | 'DECIMALS_MISMATCH';
  capacityError?: 'ABOVE_CAPACITY' | 'CAPACITY_UNKNOWN';
  pendingRecord?: RhRecord; // a record that blocks new sends (see `blocks`)
  approvedRecord?: RhRecord;
  needsApproval: boolean;
  canApprove: boolean;
  canBridge: boolean;
}

const AMOUNT_MESSAGES: Record<string, string> = {
  RH_INVALID_AMOUNT: 'Enter a valid amount.',
  RH_TOO_MANY_DECIMALS: 'Too many decimal places.',
  RH_AMOUNT_ZERO: 'Enter an amount above zero.',
  RH_AMOUNT_BELOW_MIN: 'Below the minimum deposit.',
  RH_AMOUNT_BELOW_MIN_EXIT: 'Below the minimum exit amount.',
  RH_AMOUNT_ABOVE_PER_TX_MAX: 'Above the per-transaction maximum.',
};
const RECIPIENT_MESSAGES: Record<string, string> = {
  RH_RECIPIENT_INVALID: 'Enter a 0x EVM address.',
  RH_RECIPIENT_CHECKSUM: 'Address checksum is wrong.',
  RH_RECIPIENT_ZERO_OR_LONG_ZERO: 'Zero and long-zero (0x000…) addresses are not accepted.',
  RH_RECIPIENT_IS_CONTRACT: 'A bridge or token contract cannot be the recipient.',
};
const message = (error: unknown, table: Record<string, string>, fallback: string): string => {
  const code = error instanceof Error ? error.message : '';
  return table[code] || fallback;
};

// Records that block a new send in the same direction for the same account: any open prompt,
// an approval still pending on chain, and an uncertain deposit/burn (it may have been
// broadcast). An uncertain APPROVAL does not block: approve() sets an exact allowance, so a
// deliberate re-approval can never move funds twice.
const blocks = (r: RhRecord): boolean =>
  r.stage === 'WALLET_PROMPT' ||
  (r.stage === 'SOURCE_PENDING' && r.step === 'APPROVE') ||
  (r.stage === 'UNCERTAIN' && r.step === 'BRIDGE');

export function deriveView(s: LaneSnapshot, lane: LaneBinding, nowMs: number): LaneView {
  if ('v2' in s) return deriveV2View(s, lane, nowMs);
  const { source, destination } = chainPair(s.direction);
  const gate = laneGate({
    direction: s.direction,
    lane,
    nowMs,
    assets: s.api.assets,
    health: s.api.health,
    state: s.api.state,
    limits: s.api.limits,
  });
  const view: LaneView = {
    gate,
    sourceChainId: source,
    destinationChainId: destination,
    needsApproval: false,
    canApprove: false,
    canBridge: false,
  };

  if (!s.wallet.account) view.walletBlocker = 'NOT_CONNECTED';
  else if (!s.wallet.isInjected || !s.wallet.hasProvider) view.walletBlocker = 'NOT_INJECTED';
  else if (s.wallet.chainId !== source) view.walletBlocker = 'WRONG_CHAIN';

  if (s.amountText.trim()) {
    try {
      const gross = parseUnits(s.amountText, lane.decimals);
      if (s.api.limits) validateAmount(s.direction, gross, s.api.limits);
      view.grossRaw = gross;
    } catch (error) {
      view.amountError = message(error, AMOUNT_MESSAGES, 'Enter a valid amount.');
    }
  }
  const recipientInput = s.recipientText.trim() || s.wallet.account || '';
  if (recipientInput) {
    try {
      view.recipient = validateRecipient(recipientInput, lane);
    } catch (error) {
      view.recipientError = message(error, RECIPIENT_MESSAGES, 'Invalid recipient.');
    }
  }

  const account = s.wallet.account;
  const ours = s.history.records.filter(
    (r) => r.account === account && r.direction === s.direction && sameBindings(r.bindings, lane)
  );
  view.pendingRecord = ours.find(blocks);
  view.approvedRecord = ours.find(
    (r) => r.stage === 'APPROVED' && r.recipient === view.recipient && r.grossRaw === view.grossRaw
  );

  const chainFresh = s.chain.key === chainKey(account, s.direction, view.recipient || null);
  if (chainFresh && view.grossRaw) {
    if (s.chain.decimals !== undefined && s.chain.decimals !== lane.decimals) view.balanceError = 'DECIMALS_MISMATCH';
    else if (
      s.chain.sourceBalance === undefined ||
      s.chain.nativeBalance === undefined ||
      s.chain.decimals === undefined
    )
      view.balanceError = 'BALANCE_UNKNOWN';
    else if (BigInt(s.chain.sourceBalance) < BigInt(view.grossRaw)) view.balanceError = 'INSUFFICIENT_BALANCE';
    else if (BigInt(s.chain.nativeBalance) === BigInt(0)) view.balanceError = 'NO_GAS';
    if (s.chain.restricted === undefined || s.chain.senderAllowed === undefined)
      view.allowlistBlocker = 'ALLOWLIST_UNKNOWN';
    else if (s.chain.restricted && !s.chain.senderAllowed) view.allowlistBlocker = 'SENDER_NOT_ALLOWLISTED';
    else if (
      s.chain.restricted &&
      s.direction === 'RH_TO_ONYX' &&
      (s.chain.recipientAllowed === false || s.chain.recipientMintAllowed === false)
    ) {
      view.allowlistBlocker = 'RECIPIENT_NOT_ALLOWLISTED';
    } else if (
      s.chain.restricted &&
      s.direction === 'RH_TO_ONYX' &&
      (s.chain.recipientAllowed === undefined || s.chain.recipientMintAllowed === undefined)
    ) {
      view.allowlistBlocker = 'ALLOWLIST_UNKNOWN';
    }
    if (s.chain.remainingCapacity === undefined) view.capacityError = 'CAPACITY_UNKNOWN';
    else if (BigInt(view.grossRaw) > BigInt(s.chain.remainingCapacity)) view.capacityError = 'ABOVE_CAPACITY';
  } else if (view.grossRaw) {
    view.balanceError = 'BALANCE_UNKNOWN';
  }

  if (s.direction === 'ONYX_TO_RH' && view.grossRaw) {
    if (!s.quote.value || s.quote.forGross !== view.grossRaw) view.quoteError = s.quote.failure || 'No fee quote yet.';
    else if (s.api.limits) {
      try {
        validateFeeQuote(s.quote.value, view.grossRaw, s.api.limits, lane, nowMs);
      } catch (error) {
        view.quoteError =
          (error as Error).message === 'RH_QUOTE_EXPIRED'
            ? 'Quote expired. Refresh the quote.'
            : 'The fee quote failed validation.';
      }
      if (!view.quoteError) {
        if (s.quote.onchainFailure) view.quoteError = s.quote.onchainFailure;
        else if (!s.quote.onchain) view.quoteError = 'Checking the on-chain fee…';
      }
    }
  }

  const ready =
    gate.open &&
    !view.walletBlocker &&
    !!view.grossRaw &&
    !view.amountError &&
    !!view.recipient &&
    !view.recipientError &&
    !view.balanceError &&
    !view.allowlistBlocker &&
    !view.capacityError &&
    !view.pendingRecord &&
    s.busy === null &&
    s.history.status === 'READY' &&
    chainFresh;
  if (ready && view.grossRaw && s.chain.allowance !== undefined) {
    view.needsApproval = !view.approvedRecord && BigInt(s.chain.allowance) < BigInt(view.grossRaw);
    view.canApprove = view.needsApproval;
    view.canBridge = !view.needsApproval && !view.quoteError;
  }
  return view;
}
