export interface YieldState {
  // Protocol data
  totalSupply: string | null;
  rewardRateRay: string | null;
  feePercentBps: number | null;
  cumulativeIndex: string | null;
  lastUpdateTimestamp: number | null;
  isPaused: boolean;

  // User data (xcnBalance is sourced via useCurrencyBalance in the Yield page)
  userBalance: string | null;
  userScaledBalance: string | null;

  // Contract solvency
  contractBalance: string | null;

  // UI state
  activeTab: 'stake' | 'unstake';
  stakeInput: string;
  unstakeInput: string;
  isConfirmModalOpen: boolean;
  pendingTxHash: string | null;

  // Loading/error
  isLoading: boolean;
  isProtocolLoading: boolean;
  error: string | null;
}

export interface StakingEvent {
  type: 'stake' | 'unstake';
  txHash: string;
  user: string;
  xcnAmount: string;
  stXCNAmount: string;
  blockNumber: number;
  timestamp: number | null;
}
