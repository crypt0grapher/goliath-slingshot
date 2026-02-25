import { AppState } from '../index';

export const selectYieldState = (state: AppState) => state.yield;

// UI state
export const selectActiveTab = (state: AppState) => state.yield.activeTab;
export const selectStakeInput = (state: AppState) => state.yield.stakeInput;
export const selectUnstakeInput = (state: AppState) => state.yield.unstakeInput;
export const selectIsConfirmModalOpen = (state: AppState) => state.yield.isConfirmModalOpen;
export const selectPendingTxHash = (state: AppState) => state.yield.pendingTxHash;

// Loading/error
export const selectIsProtocolLoading = (state: AppState) => state.yield.isProtocolLoading;
export const selectError = (state: AppState) => state.yield.error;

// Protocol data
export const selectIsPaused = (state: AppState) => state.yield.isPaused;
export const selectTotalSupply = (state: AppState) => state.yield.totalSupply;
export const selectRewardRateRay = (state: AppState) => state.yield.rewardRateRay;
export const selectFeePercentBps = (state: AppState) => state.yield.feePercentBps;
export const selectCumulativeIndex = (state: AppState) => state.yield.cumulativeIndex;
export const selectLastUpdateTimestamp = (state: AppState) => state.yield.lastUpdateTimestamp;

// User data
export const selectUserBalance = (state: AppState) => state.yield.userBalance;
export const selectUserScaledBalance = (state: AppState) => state.yield.userScaledBalance;
