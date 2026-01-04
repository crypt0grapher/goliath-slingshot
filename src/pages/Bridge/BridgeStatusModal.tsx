import React from 'react';
import styled from 'styled-components';
import { useSelector, useDispatch } from 'react-redux';
import { ExternalLink } from 'react-feather';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal';
import { ButtonPrimary, ButtonOutlined } from '../../components/Button';
import { selectActiveOperation, selectIsStatusModalOpen, selectPollingError } from '../../state/bridge/selectors';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeStatusStepper } from '../../components/bridge';
import { BridgeNetwork, getExplorerTxUrl } from '../../constants/bridge/networks';
import { useBridgeStatusPolling, useBridgeForm } from '../../hooks/bridge';
import { formatEta } from '../../utils/bridge/eta';

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

const AmountSection = styled.div`
  text-align: center;
  padding: 16px;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  margin-bottom: 20px;
`;

const AmountText = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
`;

const DirectionText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  margin-top: 4px;
`;

const StepperSection = styled.div`
  margin: 20px 0;
`;

const EtaSection = styled.div`
  text-align: center;
  padding: 12px;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  margin-bottom: 16px;
`;

const EtaLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
`;

const EtaValue = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin-left: 8px;
`;

const LinksSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
`;

const ExplorerLinkStyled = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  color: ${({ theme }) => theme.text1};
  text-decoration: none;
  font-size: 14px;

  &:hover {
    background-color: ${({ theme }) => theme.bg3};
  }
`;

const ButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ErrorSection = styled.div`
  padding: 12px;
  background-color: ${({ theme }) => theme.red1 + '20'};
  border-radius: 12px;
  color: ${({ theme }) => theme.red1};
  font-size: 14px;
  margin-bottom: 16px;
  text-align: center;
`;

const WarningSection = styled.div`
  padding: 12px;
  background-color: ${({ theme }) => theme.yellow2 + '20'};
  border: 1px solid ${({ theme }) => theme.yellow2};
  border-radius: 12px;
  color: ${({ theme }) => theme.yellow2};
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
`;

export default function BridgeStatusModal() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const isOpen = useSelector(selectIsStatusModalOpen);
  const operation = useSelector(selectActiveOperation);
  const pollingError = useSelector(selectPollingError);
  const { triggerBalanceRefresh } = useBridgeForm();

  // Start polling for status updates
  useBridgeStatusPolling(operation);

  const handleClose = () => {
    dispatch(bridgeActions.closeStatusModal());
    // Refresh balances when closing the modal to ensure fresh data
    triggerBalanceRefresh();
  };

  const handleBridgeMore = () => {
    dispatch(bridgeActions.closeStatusModal());
    dispatch(bridgeActions.resetForm());
    // Trigger aggressive polling to ensure balances are up to date
    triggerBalanceRefresh();
  };

  if (!operation) {
    return null;
  }

  const originNetwork =
    operation.direction === 'SEPOLIA_TO_GOLIATH' ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH;
  const destNetwork =
    operation.direction === 'SEPOLIA_TO_GOLIATH' ? BridgeNetwork.GOLIATH : BridgeNetwork.SEPOLIA;

  const originExplorerUrl = operation.originTxHash
    ? getExplorerTxUrl(originNetwork, operation.originTxHash)
    : null;

  const destExplorerUrl = operation.destinationTxHash
    ? getExplorerTxUrl(destNetwork, operation.destinationTxHash)
    : null;

  const isCompleted = operation.status === 'COMPLETED';
  const isFailed = operation.status === 'FAILED' || operation.status === 'EXPIRED';

  const directionLabel =
    operation.direction === 'SEPOLIA_TO_GOLIATH' ? 'Sepolia → Goliath' : 'Goliath → Sepolia';

  return (
    <Modal isOpen={isOpen} onDismiss={handleClose}>
      <ContentWrapper>
        <Title>
          {isCompleted ? t('bridgeComplete') : isFailed ? t('bridgeFailed') : t('bridgeInProgress')}
        </Title>

        <AmountSection>
          <AmountText>
            {operation.amountHuman} {operation.token}
          </AmountText>
          <DirectionText>{directionLabel}</DirectionText>
        </AmountSection>

        {isFailed && operation.errorMessage && (
          <ErrorSection>{operation.errorMessage}</ErrorSection>
        )}

        {!isFailed && pollingError && (
          <WarningSection>{pollingError}</WarningSection>
        )}

        {!isFailed && operation.status === 'DELAYED' && operation.errorMessage && (
          <WarningSection>{operation.errorMessage}</WarningSection>
        )}

        <StepperSection>
          <BridgeStatusStepper operation={operation} />
        </StepperSection>

        {!isCompleted && !isFailed && (
          <EtaSection>
            <EtaLabel>{t('estimatedLabel')}</EtaLabel>
            <EtaValue>{formatEta(operation, t)}</EtaValue>
          </EtaSection>
        )}

        <LinksSection>
          {originExplorerUrl && (
            <ExplorerLinkStyled href={originExplorerUrl} target="_blank" rel="noopener noreferrer">
              {t('viewOnExplorer', { network: originNetwork === BridgeNetwork.SEPOLIA ? 'Sepolia' : 'Goliath' })}
              <ExternalLink size={14} />
            </ExplorerLinkStyled>
          )}
          {destExplorerUrl && (
            <ExplorerLinkStyled href={destExplorerUrl} target="_blank" rel="noopener noreferrer">
              {t('viewOnExplorer', { network: destNetwork === BridgeNetwork.SEPOLIA ? 'Sepolia' : 'Goliath' })}
              <ExternalLink size={14} />
            </ExplorerLinkStyled>
          )}
        </LinksSection>

        <ButtonsContainer>
          {isCompleted && (
            <ButtonPrimary onClick={handleBridgeMore}>{t('bridgeMore')}</ButtonPrimary>
          )}
          <ButtonOutlined onClick={handleClose}>
            {isCompleted ? t('close') : t('closeBridgeContinues')}
          </ButtonOutlined>
        </ButtonsContainer>
      </ContentWrapper>
    </Modal>
  );
}
