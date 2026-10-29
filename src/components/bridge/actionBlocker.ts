// SPDX-License-Identifier: Apache-2.0
// Concise, state-grounded reasons. Raw provider and backend strings are never copied through.
export type BlockerCode =
  | 'CONNECT'
  | 'WRONG_NETWORK'
  | 'WALLET_PROMPT'
  | 'IN_FLIGHT'
  | 'INVALID_RECIPIENT'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_GAS'
  | 'CHECKING'
  | 'UNAVAILABLE'
  | 'HELD'
  | 'CAPACITY'
  | 'QUOTE'
  | 'ELIGIBILITY'
  | 'HISTORY';

export interface ActionBlocker {
  code: BlockerCode;
  message: string;
  retryBalance: boolean;
}

export interface BlockerInput {
  connected: boolean;
  walletMatches: boolean;
  walletPrompt: boolean;
  inFlight: boolean;
  recipientValid: boolean;
  amountValid: boolean;
  balance?: 'ok' | 'unknown' | 'insufficient';
  gas?: 'ok' | 'unknown' | 'insufficient';
  checking: boolean;
  held: boolean;
  capacityExceeded: boolean;
  quoteReady: boolean;
  eligible: boolean;
  historyReady: boolean;
  authorityFresh: boolean;
}

const TEXT: Record<BlockerCode, string> = {
  CONNECT: 'Connect a wallet to continue.',
  WRONG_NETWORK: 'Switch to the source network.',
  WALLET_PROMPT: 'Confirm the request in your wallet.',
  IN_FLIGHT: 'A transfer is already in progress.',
  INVALID_RECIPIENT: 'Enter a valid recipient.',
  INVALID_AMOUNT: 'Enter a valid amount.',
  INSUFFICIENT_BALANCE: 'The wallet balance is too low.',
  INSUFFICIENT_GAS: 'The wallet does not have enough gas.',
  CHECKING: 'Checking bridge details.',
  UNAVAILABLE: 'Bridge details are unavailable.',
  HELD: 'New transfers are paused for this asset.',
  CAPACITY: 'The amount is above the remaining capacity.',
  QUOTE: 'The fee quote is not ready.',
  ELIGIBILITY: 'This wallet is not eligible for the transfer.',
  HISTORY: 'Stored history is unavailable, so new transfers stay off.',
};

export function presentBlocker(input: BlockerInput): ActionBlocker | null {
  let code: BlockerCode | null = null;
  if (!input.connected) code = 'CONNECT';
  else if (!input.walletMatches) code = 'WRONG_NETWORK';
  else if (input.walletPrompt) code = 'WALLET_PROMPT';
  else if (input.inFlight) code = 'IN_FLIGHT';
  else if (!input.recipientValid) code = 'INVALID_RECIPIENT';
  else if (!input.amountValid) code = 'INVALID_AMOUNT';
  else if (input.balance === 'insufficient') code = 'INSUFFICIENT_BALANCE';
  else if (input.gas === 'insufficient') code = 'INSUFFICIENT_GAS';
  else if (input.authorityFresh && input.held) code = 'HELD';
  else if (input.authorityFresh && !input.eligible) code = 'ELIGIBILITY';
  else if (input.authorityFresh && input.capacityExceeded) code = 'CAPACITY';
  else if (input.authorityFresh && !input.quoteReady) code = 'QUOTE';
  else if (input.authorityFresh && !input.historyReady) code = 'HISTORY';
  else if (input.checking) code = 'CHECKING';
  else if (!input.authorityFresh || input.balance === 'unknown' || input.gas === 'unknown') code = 'UNAVAILABLE';
  if (!code) return null;
  return { code, message: TEXT[code], retryBalance: code === 'UNAVAILABLE' || code === 'CHECKING' };
}
