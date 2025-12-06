import React from 'react';
import styled from 'styled-components';
import { useSelector, useDispatch } from 'react-redux';
import Modal from '../../components/Modal';
import { ButtonPrimary } from '../../components/Button';
import { selectBridgeForm, selectIsConfirmModalOpen } from '../../state/bridge/selectors';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';
import { useActiveWeb3React } from '../../hooks';
import { useBridgeDeposit, useBridgeBurn } from '../../hooks/bridge';
import { getStaticEtaEstimate } from '../../utils/bridge/eta';

const ContentWrapper = styled.div`
  padding: 1rem;
  width: 100%;
  box-sizing: border-box;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0 0 16px 0;
  text-align: center;
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.bg3};

  &:last-of-type {
    border-bottom: none;
  }
`;

const DetailLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
`;

const DetailValue = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
`;

const AmountHighlight = styled.div`
  text-align: center;
  padding: 20px;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  margin-bottom: 16px;
`;

const AmountText = styled.div`
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
`;

const TokenSymbol = styled.span`
  font-size: 20px;
  color: ${({ theme }) => theme.text2};
  margin-left: 8px;
`;

const DirectionText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  margin-top: 8px;
`;

const ButtonContainer = styled.div`
  margin-top: 16px;
`;

const WarningText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};
  text-align: center;
  margin-top: 12px;
`;

export default function BridgeConfirmModal() {
  const dispatch = useDispatch();
  const { account } = useActiveWeb3React();
  const isOpen = useSelector(selectIsConfirmModalOpen);
  const form = useSelector(selectBridgeForm);
  const { deposit, isLoading: isDepositing } = useBridgeDeposit();
  const { burn, isLoading: isBurning } = useBridgeBurn();

  const isLoading = isDepositing || isBurning;

  const originMetadata = NETWORK_METADATA[form.originNetwork];
  const destMetadata = NETWORK_METADATA[form.destinationNetwork];
  const direction =
    form.originNetwork === BridgeNetwork.SEPOLIA ? 'SEPOLIA_TO_GOLIATH' : 'GOLIATH_TO_SEPOLIA';
  const eta = getStaticEtaEstimate(direction);

  const handleClose = () => {
    if (!isLoading) {
      dispatch(bridgeActions.closeConfirmModal());
    }
  };

  const handleConfirm = async () => {
    if (!account) return;

    try {
      if (form.originNetwork === BridgeNetwork.SEPOLIA) {
        await deposit(form.selectedToken, form.inputAmount, account);
      } else {
        await burn(form.selectedToken, form.inputAmount, account);
      }
    } catch (error) {
      console.error('Bridge transaction failed:', error);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Modal isOpen={isOpen} onDismiss={handleClose}>
      <ContentWrapper>
        <Title>Confirm Bridge</Title>

        <AmountHighlight>
          <AmountText>
            {form.inputAmount}
            <TokenSymbol>{form.selectedToken}</TokenSymbol>
          </AmountText>
          <DirectionText>
            {originMetadata.shortName} → {destMetadata.shortName}
          </DirectionText>
        </AmountHighlight>

        <DetailRow>
          <DetailLabel>From Network</DetailLabel>
          <DetailValue>{originMetadata.displayName}</DetailValue>
        </DetailRow>

        <DetailRow>
          <DetailLabel>To Network</DetailLabel>
          <DetailValue>{destMetadata.displayName}</DetailValue>
        </DetailRow>

        <DetailRow>
          <DetailLabel>Recipient</DetailLabel>
          <DetailValue>{account ? truncateAddress(account) : '-'}</DetailValue>
        </DetailRow>

        <DetailRow>
          <DetailLabel>Bridge Fee</DetailLabel>
          <DetailValue style={{ color: '#27AE60' }}>Free</DetailValue>
        </DetailRow>

        <DetailRow>
          <DetailLabel>Estimated Time</DetailLabel>
          <DetailValue>{eta}</DetailValue>
        </DetailRow>

        <ButtonContainer>
          <ButtonPrimary onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Confirming...' : 'Confirm Bridge'}
          </ButtonPrimary>
        </ButtonContainer>

        <WarningText>
          By confirming, you agree to bridge your assets. This action cannot be undone.
        </WarningText>
      </ContentWrapper>
    </Modal>
  );
}
