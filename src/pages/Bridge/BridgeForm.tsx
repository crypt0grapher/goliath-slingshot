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
import { getButtonState, GOLIATH_TO_SEPOLIA_MAX_ETH } from '../../utils/bridge/validation';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { Wrapper, FormContainer, NetworkRow, OutputContainer, OutputLabel, OutputAmount, OutputBalance, ErrorMessage } from './styleds';

const ActionButton = styled(ButtonPrimary)`
  margin-top: 16px;
`;

const ErrorButton = styled(ButtonError)`
  margin-top: 16px;
`;

const InfoMessage = styled.div`
  background-color: rgba(33, 114, 229, 0.1);
  border: 1px solid rgba(33, 114, 229, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.text2};
  line-height: 1.5;
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
    destinationBalance,
    direction,
    validation,
    needsApproval,
    refetchAllowance,
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
      const approved = await approve();
      if (approved) {
        refetchAllowance();
      }
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
    refetchAllowance,
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
            <OutputBalance>
              Balance: {destinationBalance} {selectedToken}
            </OutputBalance>
          </OutputContainer>
        </FormContainer>

        <BridgeSummary direction={direction} recipient={null} account={account} />

        {originNetwork === BridgeNetwork.GOLIATH && (
          <InfoMessage>
            Testnet limit: Maximum {GOLIATH_TO_SEPOLIA_MAX_ETH} ETH per transaction when bridging from Goliath to Sepolia to prevent abuse of testnet token minting.
          </InfoMessage>
        )}

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
