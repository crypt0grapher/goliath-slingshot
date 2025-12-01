import React, { useCallback } from 'react';
import styled from 'styled-components';
import { useDispatch } from 'react-redux';
import { ButtonPrimary, ButtonError } from '../../components/Button';
import { AutoColumn } from '../../components/Column';
import {
  NetworkSelector,
  BridgeAmountInput,
  BridgeSummary,
  DirectionSwapButton,
} from '../../components/bridge';
import { useBridgeForm, useBridgeApprove, useBridgeNetworkSwitch } from '../../hooks/bridge';
import { useActiveWeb3React } from '../../hooks';
import { useWalletModalToggle } from '../../state/application/hooks';
import { bridgeActions } from '../../state/bridge/reducer';
import { getButtonState } from '../../utils/bridge/validation';
import { Wrapper, FormContainer, NetworkRow, OutputContainer, OutputLabel, OutputAmount, ErrorMessage } from './styleds';

const ActionButton = styled(ButtonPrimary)`
  margin-top: 16px;
`;

const ErrorButton = styled(ButtonError)`
  margin-top: 16px;
`;

export default function BridgeForm() {
  const dispatch = useDispatch();
  const { account } = useActiveWeb3React();
  const toggleWalletModal = useWalletModalToggle();
  const bridgeForm = useBridgeForm();
  const { approve, isLoading: isApproveLoading } = useBridgeApprove(
    bridgeForm.selectedToken,
    bridgeForm.originNetwork
  );
  const { switchNetwork } = useBridgeNetworkSwitch();

  const {
    originNetwork,
    destinationNetwork,
    selectedToken,
    inputAmount,
    outputAmount,
    originBalance,
    direction,
    validation,
    needsApproval,
    isSubmitting,
    isApproving,
    setOriginNetwork,
    swapDirection,
    setSelectedToken,
    setInputAmount,
    setMaxAmount,
  } = bridgeForm;

  const buttonState = getButtonState(
    validation,
    needsApproval,
    isApproving || isApproveLoading,
    isSubmitting,
    selectedToken
  );

  const handleButtonClick = useCallback(async () => {
    if (validation.state === 'NOT_CONNECTED') {
      toggleWalletModal();
      return;
    }

    if (validation.state === 'WRONG_NETWORK') {
      await switchNetwork(originNetwork);
      return;
    }

    if (needsApproval) {
      await approve();
      return;
    }

    if (validation.isValid) {
      dispatch(bridgeActions.openConfirmModal());
    }
  }, [
    validation,
    needsApproval,
    originNetwork,
    approve,
    switchNetwork,
    toggleWalletModal,
    dispatch,
  ]);

  return (
    <Wrapper>
      <AutoColumn gap="md">
        <FormContainer>
          <NetworkRow>
            <NetworkSelector
              selectedNetwork={originNetwork}
              onSelect={setOriginNetwork}
              label="From"
            />
          </NetworkRow>

          <BridgeAmountInput
            value={inputAmount}
            onUserInput={setInputAmount}
            selectedToken={selectedToken}
            onTokenSelect={setSelectedToken}
            balance={originBalance}
            onMax={setMaxAmount}
            showMaxButton={true}
          />

          <DirectionSwapButton onClick={swapDirection} />

          <NetworkRow>
            <NetworkSelector
              selectedNetwork={destinationNetwork}
              onSelect={() => {}}
              label="To"
              disabled
            />
          </NetworkRow>

          <OutputContainer>
            <OutputLabel>You will receive</OutputLabel>
            <OutputAmount>
              {outputAmount || '0'} {selectedToken}
            </OutputAmount>
          </OutputContainer>
        </FormContainer>

        <BridgeSummary direction={direction} recipient={null} account={account} />

        {validation.errorMessage && <ErrorMessage>{validation.errorMessage}</ErrorMessage>}

        {buttonState.variant === 'error' ? (
          <ErrorButton onClick={handleButtonClick} disabled={buttonState.disabled}>
            {buttonState.text}
          </ErrorButton>
        ) : (
          <ActionButton onClick={handleButtonClick} disabled={buttonState.disabled}>
            {buttonState.text}
          </ActionButton>
        )}
      </AutoColumn>
    </Wrapper>
  );
}
