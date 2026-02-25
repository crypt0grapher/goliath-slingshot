import {
  selectActiveTab,
  selectUserBalance,
} from '../../state/yield/selectors';
import { YieldState } from '../../state/yield/types';

// Create a minimal mock AppState
function createMockState(yieldOverrides: Partial<YieldState> = {}): any {
  return {
    yield: {
      totalSupply: null,
      rewardRateRay: null,
      feePercentBps: null,
      cumulativeIndex: null,
      lastUpdateTimestamp: null,
      isPaused: false,
      userBalance: null,
      userScaledBalance: null,
      activeTab: 'stake' as const,
      stakeInput: '',
      unstakeInput: '',
      isConfirmModalOpen: false,
      pendingTxHash: null,
      isLoading: false,
      isProtocolLoading: true,
      error: null,
      ...yieldOverrides,
    },
  };
}

describe('yield selectors', () => {
  it('FE-UT-020: selectActiveTab returns correct tab', () => {
    const state = createMockState({ activeTab: 'unstake' });
    expect(selectActiveTab(state)).toBe('unstake');
  });

  it('FE-UT-021: selectUserBalance returns balance string', () => {
    const state = createMockState({ userBalance: '1000' });
    expect(selectUserBalance(state)).toBe('1000');
  });
});
