import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';
import { BridgeTokenSymbol } from '../../constants/bridge/tokens';
import { isValidAmountString, isPositiveAmount, compareAmounts } from './amounts';

// ============================================
// Validation Result Types
// ============================================

export type ValidationState =
  | 'NOT_CONNECTED'
  | 'WRONG_NETWORK'
  | 'EMPTY_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_TOO_SMALL'
  | 'AMOUNT_TOO_LARGE'
  | 'INSUFFICIENT_BALANCE'
  | 'BRIDGE_PAUSED'
  | 'BRIDGE_UNAVAILABLE'
  | 'NEEDS_APPROVAL'
  | 'READY';

// Maximum amount for bridging FROM Goliath (to prevent testnet token abuse)
export const GOLIATH_TO_SEPOLIA_MAX_ETH = '0.05';

export interface TranslatableText {
  key: string;
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  state: ValidationState;
  isValid: boolean;
  buttonText: TranslatableText;
  errorMessage: TranslatableText | null;
  disableButton: boolean;
}

export interface ValidationInput {
  account: string | null | undefined;
  chainId: number | undefined;
  originNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string;
  originBalance: string;
  minAmount: string;
  bridgeEnabled: boolean;
}

// ============================================
// Validation Logic
// ============================================

export function validateBridgeInput(input: ValidationInput): ValidationResult {
  const {
    account,
    chainId,
    originNetwork,
    selectedToken,
    inputAmount,
    originBalance,
    minAmount,
    bridgeEnabled,
  } = input;

  // 1. Wallet not connected
  if (!account) {
    return {
      state: 'NOT_CONNECTED',
      isValid: false,
      buttonText: { key: 'connectWallet' },
      errorMessage: null,
      disableButton: false,
    };
  }

  // 2. Bridge disabled
  if (!bridgeEnabled) {
    return {
      state: 'BRIDGE_UNAVAILABLE',
      isValid: false,
      buttonText: { key: 'bridgeUnavailable' },
      errorMessage: { key: 'bridgeTemporarilyUnavailable' },
      disableButton: true,
    };
  }

  // 3. Wrong network
  const expectedChainId = NETWORK_METADATA[originNetwork].chainId;
  if (chainId !== expectedChainId) {
    return {
      state: 'WRONG_NETWORK',
      isValid: false,
      buttonText: { key: 'switchTo', params: { network: NETWORK_METADATA[originNetwork].shortName } },
      errorMessage: null,
      disableButton: false,
    };
  }

  // 4. Empty amount
  if (!inputAmount || inputAmount.trim() === '') {
    return {
      state: 'EMPTY_AMOUNT',
      isValid: false,
      buttonText: { key: 'enterAnAmount' },
      errorMessage: null,
      disableButton: true,
    };
  }

  // 5. Invalid amount format
  if (!isValidAmountString(inputAmount)) {
    return {
      state: 'INVALID_AMOUNT',
      isValid: false,
      buttonText: { key: 'invalidAmount' },
      errorMessage: { key: 'pleaseEnterValidNumber' },
      disableButton: true,
    };
  }

  // 6. Zero amount
  if (!isPositiveAmount(inputAmount)) {
    return {
      state: 'EMPTY_AMOUNT',
      isValid: false,
      buttonText: { key: 'enterAnAmount' },
      errorMessage: null,
      disableButton: true,
    };
  }

  // 7. Amount too small
  if (compareAmounts(inputAmount, minAmount, selectedToken, originNetwork) < 0) {
    return {
      state: 'AMOUNT_TOO_SMALL',
      isValid: false,
      buttonText: { key: 'amountTooSmall' },
      errorMessage: { key: 'minimumAmountIs', params: { amount: minAmount, token: selectedToken } },
      disableButton: true,
    };
  }

  // 8. Amount too large (only for Goliath -> Sepolia to prevent testnet abuse)
  if (
    originNetwork === BridgeNetwork.GOLIATH &&
    selectedToken === 'ETH' &&
    compareAmounts(inputAmount, GOLIATH_TO_SEPOLIA_MAX_ETH, selectedToken, originNetwork) > 0
  ) {
    return {
      state: 'AMOUNT_TOO_LARGE',
      isValid: false,
      buttonText: { key: 'amountExceedsLimit' },
      errorMessage: { key: 'maximumAmountTestnet', params: { amount: GOLIATH_TO_SEPOLIA_MAX_ETH } },
      disableButton: true,
    };
  }

  // 9. Insufficient balance
  if (
    originBalance &&
    compareAmounts(inputAmount, originBalance, selectedToken, originNetwork) > 0
  ) {
    return {
      state: 'INSUFFICIENT_BALANCE',
      isValid: false,
      buttonText: { key: 'insufficientTokenBalance', params: { token: selectedToken } },
      errorMessage: null,
      disableButton: true,
    };
  }

  // 10. All checks passed
  return {
    state: 'READY',
    isValid: true,
    buttonText: { key: 'bridgeToken', params: { token: selectedToken } },
    errorMessage: null,
    disableButton: false,
  };
}

// ============================================
// Button State Derivation
// ============================================

export function getButtonState(
  validation: ValidationResult,
  needsApproval: boolean,
  isApproving: boolean,
  isSubmitting: boolean,
  selectedToken: BridgeTokenSymbol
): { text: TranslatableText; disabled: boolean; variant: 'primary' | 'error' | 'secondary' } {
  // Loading states
  if (isApproving) {
    return {
      text: { key: 'approvingToken', params: { token: selectedToken } },
      disabled: true,
      variant: 'primary',
    };
  }

  if (isSubmitting) {
    return {
      text: { key: 'bridging' },
      disabled: true,
      variant: 'primary',
    };
  }

  // Special states from validation
  if (validation.state === 'NOT_CONNECTED') {
    return {
      text: { key: 'connectWallet' },
      disabled: false,
      variant: 'primary',
    };
  }

  if (validation.state === 'WRONG_NETWORK') {
    return {
      text: validation.buttonText,
      disabled: false,
      variant: 'secondary',
    };
  }

  // Approval needed
  if (validation.isValid && needsApproval) {
    return {
      text: { key: 'approveToken', params: { token: selectedToken } },
      disabled: false,
      variant: 'primary',
    };
  }

  // Default to validation result
  return {
    text: validation.buttonText,
    disabled: validation.disableButton,
    variant: validation.isValid ? 'primary' : 'error',
  };
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
