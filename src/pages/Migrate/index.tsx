import React, { useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Lock, Wifi } from 'react-feather';
import AppBody from '../AppBody';
import { ButtonPrimary } from '../../components/Button';
import { useActiveWeb3React } from '../../hooks';
import { useWalletModalToggle } from '../../state/application/hooks';
import { useBridgeNetworkSwitch } from '../../hooks/bridge/useBridgeNetworkSwitch';
import { useMigrationData } from '../../hooks/migration/useMigrationData';
import { useMigrationFlow } from '../../hooks/migration/useMigrationFlow';
import { useMigrationStatusPolling } from '../../hooks/migration/useMigrationStatusPolling';
import { useMigrationTransactions } from '../../hooks/migration/useMigrationTransactions';
import { selectOperation, selectStakeToggle } from '../../state/migration/selectors';
import { migrationActions } from '../../state/migration/slice';
import { loadPendingMigration } from '../../state/migration/persistence';
import { BridgeNetwork } from '../../constants/bridge/networks';
import MigrationSummary from '../../components/migration/MigrationSummary';
import MigrationStepper from '../../components/migration/MigrationStepper';
import MigrationStatusPanel from '../../components/migration/MigrationStatusPanel';
import MigrationStatsBanner from '../../components/migration/MigrationStatsBanner';
import MigrationHistoryPanel from '../../components/migration/MigrationHistoryPanel';
import {
  PageWrapper,
  MigrateHeader,
  MigrateTitle,
  MigrateBody,
  GateContainer,
  GateText,
  GateIcon,
  SkeletonBlock,
  ContentSection,
  ErrorBanner,
} from './styleds';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sepolia chain ID for network gate check. */
const SEPOLIA_CHAIN_ID = 11155111;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Migrate() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { account, chainId } = useActiveWeb3React();
  const toggleWalletModal = useWalletModalToggle();
  const { switchNetwork, isLoading: isSwitching } = useBridgeNetworkSwitch();

  const isConnected = Boolean(account);
  const isCorrectNetwork = (chainId as number | undefined) === SEPOLIA_CHAIN_ID;

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const { loading: dataLoading, error: dataError, refetch } = useMigrationData();

  // ---------------------------------------------------------------------------
  // Operation & preferences (read early for resume logic)
  // ---------------------------------------------------------------------------

  const operation = useSelector(selectOperation);
  const stakeOnGoliath = useSelector(selectStakeToggle);

  // ---------------------------------------------------------------------------
  // Resume: restore pending operation from localStorage on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!account) return;

    const pending = loadPendingMigration(account);
    if (pending) {
      dispatch(
        migrationActions.setOperation({
          originTxHash: pending.originTxHash,
          intentId: pending.intentId,
          status: 'PENDING_ORIGIN_TX',
        })
      );
      // Restore the stake toggle preference: if the persisted value differs
      // from the current Redux value, toggle it before locking.
      if (pending.stakeOnGoliath !== stakeOnGoliath) {
        dispatch(migrationActions.toggleStakePreference());
      }
      dispatch(migrationActions.lockToggle());
    }
  }, [account, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: stakeOnGoliath deliberately excluded from deps to avoid re-running
  // on toggle changes -- we only want to restore on mount.

  // ---------------------------------------------------------------------------
  // Flow derivation
  // ---------------------------------------------------------------------------

  const {
    visibleSteps,
    isEmpty,
    isStatusView,
  } = useMigrationFlow();

  // ---------------------------------------------------------------------------
  // Transaction executors
  // ---------------------------------------------------------------------------

  const {
    executeClaim,
    executeApprove,
    executeUnstake,
    executeBridge,
  } = useMigrationTransactions(refetch);

  // Wrap executeBridge to pass the refetch callback
  const handleExecuteBridge = useCallback(async () => {
    await executeBridge(refetch);
  }, [executeBridge, refetch]);

  // ---------------------------------------------------------------------------
  // Status polling (for status view mode)
  // ---------------------------------------------------------------------------

  const {
    operationStatus,
    error: pollingError,
    migrationFields,
    delayWarning,
  } = useMigrationStatusPolling(
    isStatusView && operation ? operation.originTxHash : null,
    { senderAddress: account ?? undefined }
  );

  // Callback for "Start New Migration" from the status panel
  const handleStartNewMigration = useCallback(() => {
    dispatch(migrationActions.clearOperation());
    dispatch(migrationActions.setUiFlags({ isStatusView: false, isEmpty: false, isResumeMode: false }));
    refetch();
  }, [dispatch, refetch]);

  // ---------------------------------------------------------------------------
  // Network switch handler
  // ---------------------------------------------------------------------------

  const handleSwitchNetwork = useCallback(async () => {
    await switchNetwork(BridgeNetwork.SEPOLIA);
  }, [switchNetwork]);

  // ---------------------------------------------------------------------------
  // Determine loading state
  // ---------------------------------------------------------------------------

  const isLoading = dataLoading && !dataError && !isEmpty && !isStatusView;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageWrapper>
      <AppBody>
        <MigrateHeader>
          <MigrateTitle>{t('migration.nav.title')}</MigrateTitle>
        </MigrateHeader>

        <MigrateBody>
          {/* ---- Gate 1: Wallet not connected ---- */}
          {!isConnected && (
            <GateContainer>
              <GateIcon>
                <Lock size={40} aria-hidden="true" />
              </GateIcon>
              <GateText>{t('connectWalletToViewLiquidity')}</GateText>
              <ButtonPrimary onClick={toggleWalletModal} padding="12px 24px">
                {t('connectWallet')}
              </ButtonPrimary>
            </GateContainer>
          )}

          {/* ---- Gate 2: Wrong network ---- */}
          {isConnected && !isCorrectNetwork && (
            <GateContainer>
              <GateIcon>
                <Wifi size={40} aria-hidden="true" />
              </GateIcon>
              <GateText>
                {t('migration.error.switchNetworkPrompt', { network: 'Ethereum (Sepolia)' })}
              </GateText>
              <ButtonPrimary
                onClick={handleSwitchNetwork}
                disabled={isSwitching}
                padding="12px 24px"
              >
                {isSwitching
                  ? t('connecting')
                  : t('switchNetwork', { correctNetwork: 'Ethereum (Sepolia)' })}
              </ButtonPrimary>
            </GateContainer>
          )}

          {/* ---- Connected + Correct Network ---- */}
          {isConnected && isCorrectNetwork && (
            <>
              {/* Phase-2: stats banner (renders nothing when flag is off) */}
              <MigrationStatsBanner />

              {/* Data error */}
              {dataError && !dataLoading && (
                <ErrorBanner role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                  <span>{dataError}</span>
                </ErrorBanner>
              )}

              {/* Loading state: skeleton placeholders */}
              {isLoading && (
                <ContentSection>
                  <SkeletonBlock height="140px" aria-label={t('migration.summary.stakedXCN')} />
                  <SkeletonBlock height="200px" aria-label={t('migration.stepper.title')} />
                </ContentSection>
              )}

              {/* Empty state: no XCN to migrate (handled by stepper, but also shown at page level if isEmpty and not loading) */}
              {!isLoading && !isStatusView && isEmpty && (
                <MigrationStepper
                  executeClaim={executeClaim}
                  executeApprove={executeApprove}
                  executeUnstake={executeUnstake}
                  executeBridge={handleExecuteBridge}
                />
              )}

              {/* Stepper mode: summary + stepper */}
              {!isLoading && !isStatusView && !isEmpty && visibleSteps.length > 0 && (
                <ContentSection>
                  <MigrationSummary onRetry={refetch} />
                  <MigrationStepper
                    executeClaim={executeClaim}
                    executeApprove={executeApprove}
                    executeUnstake={executeUnstake}
                    executeBridge={handleExecuteBridge}
                  />
                </ContentSection>
              )}

              {/* Status mode: in-flight or resumed operation */}
              {isStatusView && operation && (
                <MigrationStatusPanel
                  operationStatus={operationStatus}
                  stakeOnGoliath={stakeOnGoliath}
                  migrationFields={migrationFields}
                  originTxHash={operation.originTxHash}
                  destinationTxHash={null}
                  delayWarning={delayWarning}
                  pollingError={pollingError}
                  onStartNewMigration={handleStartNewMigration}
                />
              )}

              {/* Phase-2: history panel (renders nothing when flag is off) */}
              <MigrationHistoryPanel />
            </>
          )}
        </MigrateBody>
      </AppBody>
    </PageWrapper>
  );
}
