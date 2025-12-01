import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { bridgeActions } from '../../state/bridge/reducer';
import {
  selectBridgeForm,
  selectIsSubmitting,
  selectIsApproving,
  selectDirection,
} from '../../state/bridge/selectors';
import { useBridgeAllowance } from './useBridgeAllowance';
import { useBridgeBalances } from './useBridgeBalances';
import { validateBridgeInput, ValidationResult } from '../../utils/bridge/validation';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, tokenRequiresApproval } from '../../constants/bridge/tokens';
import { bridgeConfig } from '../../config/bridgeConfig';
import { formatAmount, calculateMaxSpendable } from '../../utils/bridge/amounts';
import { BridgeDirection } from '../../state/bridge/types';

export interface UseBridgeFormReturn {
  // Form values
  originNetwork: BridgeNetwork;
  destinationNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string;

  // Derived values
  direction: BridgeDirection;
  outputAmount: string; // Same as input (1:1 bridge)

  // Balances
  originBalance: string;
  isBalanceLoading: boolean;

  // Allowance
  hasAllowance: boolean;
  isAllowanceLoading: boolean;
  needsApproval: boolean;

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
}

export function useBridgeForm(): UseBridgeFormReturn {
  const dispatch = useDispatch();
  const { account, chainId } = useActiveWeb3React();

  // Redux state
  const form = useSelector(selectBridgeForm);
  const direction = useSelector(selectDirection);
  const isSubmitting = useSelector(selectIsSubmitting);
  const isApproving = useSelector(selectIsApproving);

  // Balances
  const { balance: originBalance, balanceAtomic, isLoading: isBalanceLoading } = useBridgeBalances(
    form.selectedToken,
    form.originNetwork
  );

  // Allowance (only for ERC-20 tokens)
  const needsApprovalCheck = tokenRequiresApproval(form.selectedToken, form.originNetwork);
  const { hasAllowance, isLoading: isAllowanceLoading } = useBridgeAllowance(
    form.selectedToken,
    form.originNetwork,
    form.inputAmount,
    { skip: !needsApprovalCheck }
  );

  // Validation
  const validation = useMemo(() => {
    return validateBridgeInput({
      account,
      chainId,
      originNetwork: form.originNetwork,
      selectedToken: form.selectedToken,
      inputAmount: form.inputAmount,
      originBalance,
      minAmount: bridgeConfig.minAmount,
      bridgeEnabled: bridgeConfig.bridgeEnabled,
    });
  }, [account, chainId, form.originNetwork, form.selectedToken, form.inputAmount, originBalance]);

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
    if (balanceAtomic > BigInt(0)) {
      const maxSpendable = calculateMaxSpendable(
        balanceAtomic,
        form.selectedToken,
        form.originNetwork
      );
      const maxFormatted = formatAmount(maxSpendable, form.selectedToken, form.originNetwork);
      dispatch(bridgeActions.setInputAmount(maxFormatted));
    }
  }, [balanceAtomic, form.selectedToken, form.originNetwork, dispatch]);

  const resetForm = useCallback(() => {
    dispatch(bridgeActions.resetForm());
  }, [dispatch]);

  return {
    // Form values
    originNetwork: form.originNetwork,
    destinationNetwork: form.destinationNetwork,
    selectedToken: form.selectedToken,
    inputAmount: form.inputAmount,

    // Derived
    direction,
    outputAmount: form.inputAmount, // 1:1 bridge

    // Balances
    originBalance,
    isBalanceLoading,

    // Allowance
    hasAllowance,
    isAllowanceLoading,
    needsApproval,

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
  };
}
