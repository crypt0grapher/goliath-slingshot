import { useCallback, useMemo, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { bridgeActions } from '../../state/bridge/reducer';
import { selectBridgeForm, selectIsSubmitting, selectIsApproving, selectDirection } from '../../state/bridge/selectors';
import { useBridgeAllowance } from './useBridgeAllowance';
import { useBridgeBalances } from './useBridgeBalances';
import { useBridgeFee } from './useBridgeFee';
import { useBridgeLimits } from './useBridgeLimits';
import { validateBridgeInput, ValidationResult } from '../../utils/bridge/validation';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, tokenRequiresApproval } from '../../constants/bridge/tokens';
import { bridgeConfig } from '../../config/bridgeConfig';
import { formatAmount, calculateMaxSpendable } from '../../utils/bridge/amounts';
import { BridgeDirection } from '../../state/bridge/types';
import { FeeQuoteResponse } from '../../services/bridgeApi';
import { BRIDGE_ASSETS, routeFor } from '../../constants/bridge/registry';
const SAFETY_TIMEOUT_MS = 7 * 60 * 1000;

export interface UseBridgeFormReturn {
  active: boolean;
  balanceError: string | null;
  destinationBalanceError: string | null;
  // Form values
  originNetwork: BridgeNetwork;
  destinationNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string;

  // Derived values
  direction: BridgeDirection;
  outputAmount: string;

  // Fee data
  feeQuote: FeeQuoteResponse | null;
  isFeeLoading: boolean;
  isFeeStale: boolean;
  refreshQuote: () => void;
  quoteExpiresAt?: number;
  feeError: string | null;

  // Limits data
  minAmountFormatted: string | null;

  // Balances
  originBalance: string;
  destinationBalance: string;
  isBalanceLoading: boolean;
  isDestinationBalanceLoading: boolean;

  // Allowance
  hasAllowance: boolean;
  isAllowanceLoading: boolean;
  needsApproval: boolean;
  refetchAllowance: () => void;

  // Validation
  validation: ValidationResult;

  // Loading states
  isSubmitting: boolean;
  isApproving: boolean;

  // Actions
  setOriginNetwork: (network: BridgeNetwork) => void;
  swapDirection: () => void;
  setSelectedToken: (token: BridgeTokenSymbol) => void;
  setInputAmount: (amount: string) => void;
  setMaxAmount: () => void;
  resetForm: () => void;

  // Balance refresh (call after successful transactions)
  triggerBalanceRefresh: () => void;
}

export function useBridgeForm(enabled = true): UseBridgeFormReturn {
  const dispatch = useDispatch();
  const { account, chainId } = useActiveWeb3React();

  // Redux state
  const selection = useSelector(selectBridgeForm);
  const active = enabled && routeFor(selection.originNetwork, selection.destinationNetwork)?.engine === 'LEGACY';
  const selectedToken = BRIDGE_ASSETS[selection.selectedAssetKey].legacyToken || 'ETH';
  // Inactive legacy hooks receive a safe projection and skip reads. RH is never interpreted as Onyx.
  const form = {
    originNetwork: active ? selection.originNetwork : BridgeNetwork.SEPOLIA,
    destinationNetwork: active ? selection.destinationNetwork : BridgeNetwork.GOLIATH,
    selectedToken,
    inputAmount: active ? selection.inputAmount : '',
  };
  const direction = useSelector(selectDirection);
  const isSubmitting = useSelector(selectIsSubmitting);
  const isApproving = useSelector(selectIsApproving);

  // Safety timeout: auto-reset isSubmitting after 7 minutes to recover from any stuck state
  // This is a defense-in-depth mechanism in case the primary try-finally blocks fail
  const submittingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isSubmitting) {
      // Start safety timeout when submitting begins
      submittingTimeoutRef.current = setTimeout(() => {
        console.warn('Bridge: Safety timeout triggered - resetting stuck isSubmitting state');
        dispatch(bridgeActions.setSubmitting(false));
      }, SAFETY_TIMEOUT_MS);
    } else {
      // Clear timeout when submitting ends normally
      if (submittingTimeoutRef.current) {
        clearTimeout(submittingTimeoutRef.current);
        submittingTimeoutRef.current = null;
      }
    }

    return () => {
      if (submittingTimeoutRef.current) {
        clearTimeout(submittingTimeoutRef.current);
      }
    };
  }, [isSubmitting, dispatch]);

  // Balances
  const {
    balance: originBalance,
    balanceAtomic,
    isLoading: isBalanceLoading,
    error: balanceError,
    triggerAggressivePolling: triggerOriginPolling,
  } = useBridgeBalances(form.selectedToken, form.originNetwork, active);

  const {
    balance: destinationBalance,
    isLoading: isDestinationBalanceLoading,
    error: destinationBalanceError,
    triggerAggressivePolling: triggerDestPolling,
  } = useBridgeBalances(form.selectedToken, form.destinationNetwork, active);

  // Combined function to refresh both balances (call after transactions)
  const triggerBalanceRefresh = useCallback(() => {
    console.log('[Bridge Form] Triggering balance refresh for both networks');
    triggerOriginPolling();
    triggerDestPolling();
  }, [triggerOriginPolling, triggerDestPolling]);

  // Allowance (only for ERC-20 tokens)
  const needsApprovalCheck = tokenRequiresApproval(form.selectedToken, form.originNetwork);
  const {
    hasAllowance,
    isLoading: isAllowanceLoading,
    refetch: refetchAllowance,
  } = useBridgeAllowance(form.selectedToken, form.originNetwork, form.inputAmount, {
    skip: !active || !needsApprovalCheck,
  });

  // Limits (fetched once on mount)
  const { getMinAmount } = useBridgeLimits(active);

  // Determine effective minimum amount
  const limitsMinAmount = useMemo(() => {
    return getMinAmount(form.selectedToken, direction);
  }, [getMinAmount, form.selectedToken, direction]);

  const effectiveMinAmount = limitsMinAmount?.formatted ?? bridgeConfig.minAmount;
  const minAmountFormatted = direction === 'GOLIATH_TO_SEPOLIA' ? limitsMinAmount?.formatted ?? null : null;

  // Fee quote (debounced, only for G2S)
  const {
    feeQuote,
    isLoading: isFeeLoading,
    isStale: isFeeStale,
    refetch: refreshQuote,
    expiresAt: quoteExpiresAt,
    error: feeError,
  } = useBridgeFee({
    amount: form.inputAmount,
    token: form.selectedToken,
    direction,
    enabled: active,
  });

  // Output amount: use fee quote if available, otherwise input amount (1:1)
  const outputAmount = useMemo(() => {
    if (direction === 'GOLIATH_TO_SEPOLIA' && feeQuote) {
      return feeQuote.outputFormatted;
    }
    return direction === 'GOLIATH_TO_SEPOLIA' ? '' : form.inputAmount;
  }, [direction, feeQuote, form.inputAmount]);

  // Validation
  const validation = useMemo(() => {
    return validateBridgeInput({
      account,
      chainId,
      originNetwork: form.originNetwork,
      selectedToken: form.selectedToken,
      inputAmount: form.inputAmount,
      originBalance,
      minAmount: effectiveMinAmount,
      bridgeEnabled: active && bridgeConfig.bridgeEnabled,
    });
  }, [
    active,
    account,
    chainId,
    form.originNetwork,
    form.selectedToken,
    form.inputAmount,
    originBalance,
    effectiveMinAmount,
  ]);

  // Derived: needs approval
  const needsApproval = useMemo(() => {
    if (!needsApprovalCheck) return false;
    if (isAllowanceLoading) return false;
    return !hasAllowance;
  }, [needsApprovalCheck, hasAllowance, isAllowanceLoading]);

  // Actions
  const setOriginNetwork = useCallback(
    (network: BridgeNetwork) => {
      dispatch(bridgeActions.setOriginNetwork(network));
    },
    [dispatch]
  );

  const swapDirection = useCallback(() => {
    dispatch(bridgeActions.swapDirection());
  }, [dispatch]);

  const setSelectedToken = useCallback(
    (token: BridgeTokenSymbol) => {
      dispatch(bridgeActions.setSelectedToken(token));
    },
    [dispatch]
  );

  const setInputAmount = useCallback(
    (amount: string) => {
      dispatch(bridgeActions.setInputAmount(amount));
    },
    [dispatch]
  );

  const setMaxAmount = useCallback(() => {
    if (active && !balanceError && !isBalanceLoading && balanceAtomic > BigInt(0)) {
      const maxSpendable = calculateMaxSpendable(balanceAtomic, form.selectedToken, form.originNetwork);
      const maxFormatted = formatAmount(maxSpendable, form.selectedToken, form.originNetwork);
      dispatch(bridgeActions.setInputAmount(maxFormatted));
    }
  }, [active, balanceError, isBalanceLoading, balanceAtomic, form.selectedToken, form.originNetwork, dispatch]);

  const resetForm = useCallback(() => {
    dispatch(bridgeActions.resetForm());
  }, [dispatch]);

  return {
    active,
    balanceError,
    destinationBalanceError,
    // Form values
    originNetwork: form.originNetwork,
    destinationNetwork: form.destinationNetwork,
    selectedToken: form.selectedToken,
    inputAmount: form.inputAmount,

    // Derived
    direction,
    outputAmount,

    // Fee data
    feeQuote,
    isFeeLoading,
    isFeeStale,
    refreshQuote,
    quoteExpiresAt,
    feeError,

    // Limits data
    minAmountFormatted,

    // Balances
    originBalance,
    destinationBalance,
    isBalanceLoading,
    isDestinationBalanceLoading,

    // Allowance
    hasAllowance,
    isAllowanceLoading,
    needsApproval,
    refetchAllowance,

    // Validation
    validation,

    // Loading
    isSubmitting,
    isApproving,

    // Actions
    setOriginNetwork,
    swapDirection,
    setSelectedToken,
    setInputAmount,
    setMaxAmount,
    resetForm,

    // Balance refresh
    triggerBalanceRefresh,
  };
}
