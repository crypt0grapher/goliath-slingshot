// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal';
import { ButtonPrimary } from '../../components/Button';
import { selectIsConfirmModalOpen } from '../../state/bridge/selectors';
import { useBridgeSession } from '../../hooks/bridge/BridgeSession';
import { NETWORK_METADATA } from '../../constants/bridge/networks';
import BridgeSummary from '../../components/bridge/BridgeSummary';

const Content = styled.div`
  padding: 1rem;
  width: 100%;
  box-sizing: border-box;
  h3 {
    text-align: center;
  }
`;
export default function BridgeConfirmModal() {
  const { t } = useTranslation();
  const open = useSelector(selectIsConfirmModalOpen);
  const s = useBridgeSession();
  return (
    <Modal isOpen={open && s.confirmationValid} onDismiss={s.closeConfirm}>
      <Content>
        <h3>{t('confirmBridge')}</h3>
        <p>
          {s.confirmation?.amount} {s.asset.symbol} · {s.asset.name}
        </p>
        <p>
          {NETWORK_METADATA[s.selection.originNetwork].displayName} →{' '}
          {NETWORK_METADATA[s.selection.destinationNetwork].displayName}
        </p>
        <BridgeSummary
          symbol={s.asset.symbol}
          fee={s.fee}
          net={s.net}
          eta={s.eta}
          recipient={s.confirmation?.recipient || ''}
          perTxMax={s.perTxMax}
          remainingCapacity={s.remainingCapacity}
        />
        <ButtonPrimary onClick={s.confirm} disabled={s.busy || !s.confirmationValid}>
          {s.busy ? t('confirming') : t('confirmBridge')}
        </ButtonPrimary>
        <p>{t('bridgeConfirmWarning')}</p>
      </Content>
    </Modal>
  );
}
