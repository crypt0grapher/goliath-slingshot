import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { YieldState } from './types';

const initialState: YieldState = {
  // Protocol data
  totalSupply: null,
  rewardRateRay: null,
  feePercentBps: null,
  cumulativeIndex: null,
  lastUpdateTimestamp: null,
  isPaused: false,

  // User data
  userBalance: null,
  userScaledBalance: null,

  // UI state
  activeTab: 'stake',
  stakeInput: '',
  unstakeInput: '',
  isConfirmModalOpen: false,
  pendingTxHash: null,

  // Loading/error
  isLoading: false,
  isProtocolLoading: true,
  error: null,
};

const yieldSlice = createSlice({
  name: 'yield',
  initialState,
  reducers: {
    // ========================================
    // Protocol Data
    // ========================================
    setProtocolData(
      state,
      action: PayloadAction<{
        totalSupply: string;
        rewardRateRay: string;
        feePercentBps: number;
        cumulativeIndex: string;
        lastUpdateTimestamp: number;
        isPaused: boolean;
      }>
    ) {
      const { totalSupply, rewardRateRay, feePercentBps, cumulativeIndex, lastUpdateTimestamp, isPaused } =
        action.payload;
      state.totalSupply = totalSupply;
      state.rewardRateRay = rewardRateRay;
      state.feePercentBps = feePercentBps;
      state.cumulativeIndex = cumulativeIndex;
      state.lastUpdateTimestamp = lastUpdateTimestamp;
      state.isPaused = isPaused;
      state.isProtocolLoading = false;
    },

    // ========================================
    // User Data
    // ========================================
    setUserData(
      state,
      action: PayloadAction<{
        userBalance: string;
        userScaledBalance: string;
      }>
    ) {
      const { userBalance, userScaledBalance } = action.payload;
      state.userBalance = userBalance;
      state.userScaledBalance = userScaledBalance;
    },

    clearUserData(state) {
      state.userBalance = null;
      state.userScaledBalance = null;
    },

    // ========================================
    // UI Actions
    // ========================================
    setActiveTab(state, action: PayloadAction<'stake' | 'unstake'>) {
      state.activeTab = action.payload;
      state.stakeInput = '';
      state.unstakeInput = '';
      state.error = null;
    },

    setStakeInput(state, action: PayloadAction<string>) {
      state.stakeInput = action.payload;
      state.error = null;
    },

    setUnstakeInput(state, action: PayloadAction<string>) {
      state.unstakeInput = action.payload;
      state.error = null;
    },

    // ========================================
    // Modal Actions
    // ========================================
    openConfirmModal(state) {
      state.isConfirmModalOpen = true;
    },

    closeConfirmModal(state) {
      state.isConfirmModalOpen = false;
      state.pendingTxHash = null;
    },

    setPendingTxHash(state, action: PayloadAction<string | null>) {
      state.pendingTxHash = action.payload;
    },

    // ========================================
    // Loading / Error
    // ========================================
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    clearError(state) {
      state.error = null;
    },
  },
});

export const yieldActions = yieldSlice.actions;
export default yieldSlice.reducer;
