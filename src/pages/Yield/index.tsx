import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { ETHER } from '@uniswap/sdk';
import { Lock, Wifi } from 'react-feather';
import AppBody from '../AppBody';
import { ButtonPrimary } from '../../components/Button';
import { useActiveWeb3React } from '../../hooks';
import { useNetworkSwitch, GOLIATH_TESTNET_CHAIN_ID } from '../../hooks/useNetworkSwitch';
import { useWalletModalToggle } from '../../state/application/hooks';
import { useCurrencyBalance } from '../../state/wallet/hooks';
import { useYieldData, useStake, useUnstake, useStakingEvents } from '../../hooks/yield';
import { yieldActions } from '../../state/yield/slice';
import {
  selectActiveTab,
  selectUserBalance,
  selectRewardRateRay,
  selectFeePercentBps,
  selectTotalSupply,
  selectIsPaused,
  selectIsConfirmModalOpen,
  selectPendingTxHash,
  selectError,
} from '../../state/yield/selectors';
import AnimatedBalance from './AnimatedBalance';
import StakeForm from './StakeForm';
import UnstakeForm from './UnstakeForm';
import ProtocolStats from './ProtocolStats';
import TransactionHistory from './TransactionHistory';
import StakeConfirmModal from './StakeConfirmModal';
import {
  PageWrapper,
  YieldHeader,
  YieldTitle,
  YieldBody,
  GateContainer,
  GateText,
  GateIcon,
  TabContainer,
  Tab,
  ErrorBanner,
  PausedBanner,
} from './styleds';

export default function Yield() {
  const { t } = useTranslation();
  const { account, chainId } = useActiveWeb3React();
  const dispatch = useDispatch();
  const toggleWalletModal = useWalletModalToggle();
  const { switchToGoliath, isLoading: isSwitching } = useNetworkSwitch();

  // Hooks -- useYieldData auto-polls protocol + user data on mount
  const { refetch } = useYieldData();
  const { stake, isLoading: isStaking } = useStake(refetch);
  const { unstake, isLoading: isUnstaking } = useUnstake(refetch);
  const { events, isLoading: isEventsLoading, totalPrincipal } = useStakingEvents();

  // XCN balance via the same multicall approach used in Swap.
  // RPC and multicall3 return 18-dec native balances on chain 8901.
  const xcnCurrencyBalance = useCurrencyBalance(account ?? undefined, ETHER);
  const xcnBalance = useMemo(() => {
    if (!xcnCurrencyBalance) return null;
    return xcnCurrencyBalance.raw.toString();
  }, [xcnCurrencyBalance]);

  // Redux selectors
  const activeTab = useSelector(selectActiveTab);
  const userBalance = useSelector(selectUserBalance);
  const rewardRateRay = useSelector(selectRewardRateRay);
  const feePercentBps = useSelector(selectFeePercentBps);
  const totalSupply = useSelector(selectTotalSupply);
  const isPaused = useSelector(selectIsPaused);
  const isConfirmModalOpen = useSelector(selectIsConfirmModalOpen);
  const pendingTxHash = useSelector(selectPendingTxHash);
  const error = useSelector(selectError);

  const isConnected = !!account;
  const isCorrectChain = chainId === GOLIATH_TESTNET_CHAIN_ID;

  const handleStake = (amountWad: string) => {
    dispatch(yieldActions.openConfirmModal());
    stake(amountWad);
  };

  const handleUnstake = (amountWad: string) => {
    dispatch(yieldActions.openConfirmModal());
    unstake(amountWad);
  };

  const handleDismissModal = () => {
    dispatch(yieldActions.closeConfirmModal());
  };

  const pendingText = activeTab === 'stake' ? t('yield.stakingPending') : t('yield.unstakingPending');

  const canStake = isConnected && isCorrectChain;

  return (
    <PageWrapper>
      <AppBody>
        <YieldHeader>
          <YieldTitle>{t('yield.pageTitle')}</YieldTitle>
        </YieldHeader>
        <YieldBody>
          {/* Gate: not connected */}
          {!isConnected && (
            <GateContainer>
              <GateIcon>
                <Lock size={32} />
              </GateIcon>
              <GateText>{t('yield.connectWalletPrompt')}</GateText>
              <ButtonPrimary onClick={toggleWalletModal}>{t('yield.connectWallet')}</ButtonPrimary>
            </GateContainer>
          )}
          {/* Gate: wrong network */}
          {isConnected && !isCorrectChain && (
            <GateContainer>
              <GateIcon>
                <Wifi size={32} />
              </GateIcon>
              <GateText>{t('yield.switchNetworkPrompt')}</GateText>
              <ButtonPrimary onClick={switchToGoliath} disabled={isSwitching}>
                {isSwitching ? t('yield.switchingNetwork') : t('yield.switchToGoliath')}
              </ButtonPrimary>
            </GateContainer>
          )}
          {/* Staking controls: only when connected to Goliath */}
          {canStake && (
            <>
              <AnimatedBalance
                balance={userBalance}
                rewardRateRay={rewardRateRay}
                feePercentBps={feePercentBps}
                isConnected={isConnected}
              />
              {isPaused && <PausedBanner>{t('yield.stakingPausedBanner')}</PausedBanner>}
              <TabContainer>
                <Tab active={activeTab === 'stake'} onClick={() => dispatch(yieldActions.setActiveTab('stake'))}>
                  {t('yield.tabStake')}
                </Tab>
                <Tab active={activeTab === 'unstake'} onClick={() => dispatch(yieldActions.setActiveTab('unstake'))}>
                  {t('yield.tabUnstake')}
                </Tab>
              </TabContainer>
              {activeTab === 'stake' ? (
                <StakeForm xcnBalance={xcnBalance} isPaused={isPaused} onStake={handleStake} />
              ) : (
                <UnstakeForm stXCNBalance={userBalance} isPaused={isPaused} onUnstake={handleUnstake} />
              )}
              {error && <ErrorBanner>{error}</ErrorBanner>}
            </>
          )}
          {/* Protocol stats: always visible */}
          <ProtocolStats
            totalSupply={totalSupply}
            rewardRateRay={rewardRateRay}
            feePercentBps={feePercentBps}
            userBalance={userBalance}
            totalPrincipal={totalPrincipal}
            isConnected={isConnected}
          />
        </YieldBody>
      </AppBody>
      {canStake && <TransactionHistory events={events} isLoading={isEventsLoading} />}
      <StakeConfirmModal
        isOpen={isConfirmModalOpen}
        onDismiss={handleDismissModal}
        attemptingTxn={isStaking || isUnstaking}
        txHash={pendingTxHash || undefined}
        pendingText={pendingText}
        errorMessage={error || undefined}
      />
    </PageWrapper>
  );
}
