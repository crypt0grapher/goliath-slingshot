import React, { useCallback, useEffect, useRef } from 'react';
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
import { useMigrationStaking } from '../../hooks/migration/useMigrationStaking';
import { selectOperation } from '../../state/migration/selectors';
import { migrationActions } from '../../state/migration/slice';
import { loadPendingMigration } from '../../state/migration/persistence';
import { BridgeNetwork } from '../../constants/bridge/networks';
import MigrationSummary from '../../components/migration/MigrationSummary';
import MigrationStepper from '../../components/migration/MigrationStepper';
import MigrationStatusPanel from '../../components/migration/MigrationStatusPanel';
import MigrationStatsBanner from '../../components/migration/MigrationStatsBanner';
import MigrationHistoryPanel from '../../components/migration/MigrationHistoryPanel';
import GoliathStakedBalance from '../../components/migration/GoliathStakedBalance';
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
  ProcessInfoCard,
  ProcessInfoTitle,
  ProcessInfoText,
} from './styleds';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sepolia chain ID for network gate check. */
const SEPOLIA_CHAIN_ID = 11155111;

/** Goliath testnet chain ID — needed for post-bridge staking. */
const GOLIATH_CHAIN_ID = 8901;

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
  const isSepolia = (chainId as number | undefined) === SEPOLIA_CHAIN_ID;
  const isGoliath = (chainId as number | undefined) === GOLIATH_CHAIN_ID;

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const { loading: dataLoading, error: dataError, refetch } = useMigrationData();

  // ---------------------------------------------------------------------------
  // Operation & preferences (read early for resume logic)
  // ---------------------------------------------------------------------------

  const operation = useSelector(selectOperation);

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
          stakeOnGoliath: pending.stakeOnGoliath,
        })
      );
      dispatch(migrationActions.lockToggle());
    }
  }, [account, dispatch]);

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

  // ---------------------------------------------------------------------------
  // Client-side staking (after bridge COMPLETED)
  // ---------------------------------------------------------------------------

  const resolvedStakeOnGoliath = operation?.stakeOnGoliath ?? migrationFields?.stakeOnGoliath ?? true;
  const bridgedAmount = operation?.amount ?? migrationFields?.amount ?? undefined;
  const isBridgeCompleted = operationStatus === 'COMPLETED';

  const {
    executeStake,
    stakingStatus: clientStakingStatus,
    stakingTxHash: clientStakingTxHash,
    stakingError: clientStakingError,
    retry: retryStake,
  } = useMigrationStaking(bridgedAmount, resolvedStakeOnGoliath, isBridgeCompleted);

  // ---------------------------------------------------------------------------
  // Auto-clear fully completed operation on unmount
  // ---------------------------------------------------------------------------
  // When the user navigates away from the Migrate page after a fully completed
  // migration (bridge COMPLETED + staking confirmed, or no staking), clear the
  // operation from Redux so returning to the page shows a clean state instead
  // of re-entering status view and re-triggering staking.

  const operationRef = useRef(operation);
  const clientStakingStatusRef = useRef(clientStakingStatus);
  const operationStatusRef = useRef(operationStatus);
  const resolvedStakeOnGoliathRef = useRef(resolvedStakeOnGoliath);

  useEffect(() => {
    operationRef.current = operation;
    clientStakingStatusRef.current = clientStakingStatus;
    operationStatusRef.current = operationStatus;
    resolvedStakeOnGoliathRef.current = resolvedStakeOnGoliath;
  });

  useEffect(() => {
    return () => {
      const op = operationRef.current;
      const status = operationStatusRef.current;
      const stakingDone = clientStakingStatusRef.current;
      const wantsStake = resolvedStakeOnGoliathRef.current;

      if (!op) return;

      const isFullyCompleted =
        status === 'COMPLETED' && (!wantsStake || stakingDone === 'confirmed');

      if (isFullyCompleted) {
        dispatch(migrationActions.clearOperation());
      }
    };
  }, [dispatch]);

  // ---------------------------------------------------------------------------
  // Network switch handlers
  // ---------------------------------------------------------------------------

  const handleSwitchNetwork = useCallback(async () => {
    await switchNetwork(BridgeNetwork.SEPOLIA);
  }, [switchNetwork]);

  const handleSwitchToGoliath = useCallback(async () => {
    await switchNetwork(BridgeNetwork.GOLIATH);
  }, [switchNetwork]);

  // ---------------------------------------------------------------------------
  // Determine loading state
  // ---------------------------------------------------------------------------

  const isLoading = dataLoading && !dataError && !isStatusView;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageWrapper>
      <AppBody>
        <MigrateHeader>
          <MigrateTitle>{t('migration.nav.pageTitle')}</MigrateTitle>
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

          {/* ---- Gate 2: Wrong network (allow Goliath when in status view for post-bridge staking) ---- */}
          {isConnected && !isSepolia && !(isGoliath && isStatusView) && (
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

          {/* ---- Connected + Correct Network (or Goliath in status view) ---- */}
          {isConnected && (isSepolia || (isGoliath && isStatusView)) && (
            <>
              {/* Phase-2: stats banner (renders nothing when flag is off) */}
              <MigrationStatsBanner />

              {/* Goliath staked balance (renders nothing when 0 or disconnected) */}
              <GoliathStakedBalance />

              <ProcessInfoCard role="region" aria-label={t('migration.process.title')}>
                <ProcessInfoTitle>{t('migration.process.title')}</ProcessInfoTitle>
                <ProcessInfoText>{t('migration.process.description')}</ProcessInfoText>
                <ProcessInfoText>{t('migration.process.signatureNotice')}</ProcessInfoText>
              </ProcessInfoCard>

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

              {/* Empty state: no XCN to migrate (only when fetch succeeded with zero balances, not on error) */}
              {!isLoading && !isStatusView && isEmpty && !dataError && (
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

              {/* Status mode: in-flight or resumed operation (persists through terminal states) */}
              {isStatusView && operation && (
                <MigrationStatusPanel
                  operationStatus={operationStatus}
                  stakeOnGoliath={resolvedStakeOnGoliath}
                  migrationFields={migrationFields}
                  originTxHash={operation.originTxHash}
                  destinationTxHash={migrationFields?.destinationTxHash ?? operation.destinationTxHash ?? null}
                  delayWarning={delayWarning}
                  pollingError={pollingError}
                  clientStakingStatus={clientStakingStatus}
                  clientStakingTxHash={clientStakingTxHash}
                  clientStakingError={clientStakingError}
                  onExecuteStake={executeStake}
                  onRetryStake={retryStake}
                  onSwitchToGoliath={handleSwitchToGoliath}
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
