// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { ButtonPrimary } from '../../components/Button';
import { AutoColumn } from '../../components/Column';
import { NetworkSelector, BridgeAmountInput, BridgeSummary, DirectionSwapButton } from '../../components/bridge';
import { observationText, ObservationValue } from '../../components/bridge/BridgeSummary';
import { bridgeAssetDisplayName } from '../../components/bridge/presentation';
import { BridgeSessionProvider, useOptionalBridgeSession, useBridgeSession } from '../../hooks/bridge/BridgeSession';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';
import { networksForSource } from '../../constants/bridge/registry';
import {
  Wrapper,
  FormContainer,
  NetworkRow,
  OutputContainer,
  OutputLabel,
  OutputAmount,
  OutputBalance,
  ErrorMessage,
} from './styleds';

function StandardCard() {
  const s = useBridgeSession();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const form = s.selection;
  const destinationChoices = networksForSource(form.originNetwork, s.rhEnabled);
  const sourceChoices = s.rhEnabled
    ? [BridgeNetwork.SEPOLIA, BridgeNetwork.GOLIATH, BridgeNetwork.ROBINHOOD]
    : [BridgeNetwork.SEPOLIA, BridgeNetwork.GOLIATH];
  const label = !s.account
    ? t('connectWallet')
    : !s.walletMatches
    ? t('switchTo', { network: NETWORK_METADATA[form.originNetwork].shortName })
    : s.busy
    ? t('confirming')
    : s.canApprove
    ? t('approve')
    : t('confirmBridge');
  const disabled = s.busy || (!!s.account && s.walletMatches && !s.canApprove && !s.canConfirm);
  const action = () =>
    !s.account ? s.connect() : !s.walletMatches ? s.switchToSource() : s.canApprove ? s.approve() : s.openConfirm();
  return (
    <Wrapper data-testid="standard-bridge-form">
      <AutoColumn gap="md">
        <FormContainer>
          <NetworkRow>
            <NetworkSelector
              selectedNetwork={form.originNetwork}
              onSelect={(network) => dispatch(bridgeActions.setOriginNetwork(network))}
              label={t('from')}
              allowedNetworks={sourceChoices}
            />
          </NetworkRow>
          <BridgeAmountInput
            value={form.inputAmount}
            onUserInput={(amount) => dispatch(bridgeActions.setInputAmount(amount))}
            selectedAssetKey={form.selectedAssetKey}
            assetKeys={s.route.assets}
            onTokenSelect={(key) => dispatch(bridgeActions.setSelectedAsset(key))}
            balance={observationText(s.sourceBalance)}
            onMax={s.setMax}
            showMaxButton={s.maxEnabled}
          />
          <DirectionSwapButton onClick={() => dispatch(bridgeActions.swapDirection())} />
          <NetworkRow>
            <NetworkSelector
              selectedNetwork={form.destinationNetwork}
              onSelect={(network) => dispatch(bridgeActions.setDestinationNetwork(network))}
              label={t('toLabel')}
              allowedNetworks={destinationChoices}
              disabled={destinationChoices.length === 1}
            />
          </NetworkRow>
          <OutputContainer>
            <OutputLabel>{t('youWillReceiveBridge')}</OutputLabel>
            <OutputAmount>
              <ObservationValue value={s.net} symbol={s.asset.symbol} inputAmount={form.inputAmount} />
            </OutputAmount>
          </OutputContainer>
        </FormContainer>
        {s.recipientEditable && (
          <label>
            {t('recipient')} · {NETWORK_METADATA[form.destinationNetwork].displayName}
            <input
              aria-label="Bridge recipient"
              value={form.recipient || ''}
              placeholder={s.account || '0x…'}
              onChange={(event) => dispatch(bridgeActions.setRecipient(event.target.value || null))}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '8px', marginTop: '6px' }}
            />
          </label>
        )}
        <BridgeSummary
          symbol={s.asset.symbol}
          inputAmount={form.inputAmount}
          fee={s.fee}
          net={s.net}
          eta={s.eta}
          perTxMax={s.perTxMax}
          remainingCapacity={s.remainingCapacity}
        />
        <OutputContainer as="section" aria-label="Balances">
          <OutputLabel>{t('bridgeBalances', { defaultValue: 'Balances' })}</OutputLabel>
          <OutputBalance>
            {s.asset.symbol} · {NETWORK_METADATA[form.originNetwork].displayName}:{' '}
            <ObservationValue value={s.sourceBalance} symbol={s.asset.symbol} />
          </OutputBalance>
          <OutputBalance>
            {s.asset.symbol} · {NETWORK_METADATA[form.destinationNetwork].displayName}:{' '}
            <ObservationValue value={s.destinationBalance} symbol={s.asset.symbol} />
          </OutputBalance>
          {s.asset.symbol === 'ETH' && <OutputBalance>{bridgeAssetDisplayName(s.asset)}</OutputBalance>}
        </OutputContainer>
        {s.notice && <ErrorMessage role="status">{t(s.notice)}</ErrorMessage>}
        {form.inputAmount && s.account && s.fee.status !== 'ready' && (
          <button type="button" onClick={s.refreshDetails} disabled={s.busy}>
            Refresh bridge details
          </button>
        )}
        <ButtonPrimary onClick={action} disabled={disabled}>
          {label}
        </ButtonPrimary>
      </AutoColumn>
    </Wrapper>
  );
}
export default function BridgeForm() {
  const session = useOptionalBridgeSession();
  return session ? (
    <StandardCard />
  ) : (
    <BridgeSessionProvider>
      <StandardCard />
    </BridgeSessionProvider>
  );
}
