import reducer, { yieldActions } from '../../state/yield/slice';

describe('yield slice', () => {
  it('FE-UT-013: initial state has correct defaults', () => {
    const state = reducer(undefined, { type: 'unknown' });
    expect(state.activeTab).toBe('stake');
    expect(state.isProtocolLoading).toBe(true);
    expect(state.isPaused).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.totalSupply).toBeNull();
    expect(state.userBalance).toBeNull();
    expect(state.stakeInput).toBe('');
    expect(state.unstakeInput).toBe('');
    expect(state.error).toBeNull();
    expect(state.pendingTxHash).toBeNull();
    expect(state.isConfirmModalOpen).toBe(false);
  });

  it('FE-UT-014: setProtocolData updates all fields', () => {
    const state = reducer(undefined, yieldActions.setProtocolData({
      totalSupply: '1000000',
      rewardRateRay: '278000000000000000000000000',
      feePercentBps: 1000,
      cumulativeIndex: '1050000000000000000000000000',
      lastUpdateTimestamp: 1700000000,
      isPaused: false,
    }));
    expect(state.totalSupply).toBe('1000000');
    expect(state.rewardRateRay).toBe('278000000000000000000000000');
    expect(state.feePercentBps).toBe(1000);
    expect(state.cumulativeIndex).toBe('1050000000000000000000000000');
    expect(state.lastUpdateTimestamp).toBe(1700000000);
    expect(state.isPaused).toBe(false);
    expect(state.isProtocolLoading).toBe(false);
  });

  it('FE-UT-015: setUserData updates user fields', () => {
    const state = reducer(undefined, yieldActions.setUserData({
      userBalance: '5000000000000000000',
      userScaledBalance: '4800000000000000000',
    }));
    expect(state.userBalance).toBe('5000000000000000000');
    expect(state.userScaledBalance).toBe('4800000000000000000');
  });

  it('FE-UT-016: clearUserData resets user fields to null', () => {
    let state = reducer(undefined, yieldActions.setUserData({
      userBalance: '5000',
      userScaledBalance: '4800',
    }));
    state = reducer(state, yieldActions.clearUserData());
    expect(state.userBalance).toBeNull();
    expect(state.userScaledBalance).toBeNull();
  });

  it('FE-UT-017: setActiveTab switches and clears inputs', () => {
    let state = reducer(undefined, yieldActions.setStakeInput('100'));
    state = reducer(state, yieldActions.setError('some error'));
    state = reducer(state, yieldActions.setActiveTab('unstake'));
    expect(state.activeTab).toBe('unstake');
    expect(state.stakeInput).toBe('');
    expect(state.unstakeInput).toBe('');
    expect(state.error).toBeNull();
  });

  it('FE-UT-018: setError sets error, clearError clears it', () => {
    let state = reducer(undefined, yieldActions.setError('Transaction failed'));
    expect(state.error).toBe('Transaction failed');
    state = reducer(state, yieldActions.clearError());
    expect(state.error).toBeNull();
  });

  it('FE-UT-019: modal open/close lifecycle', () => {
    let state = reducer(undefined, yieldActions.openConfirmModal());
    expect(state.isConfirmModalOpen).toBe(true);
    state = reducer(state, yieldActions.setPendingTxHash('0xabc'));
    expect(state.pendingTxHash).toBe('0xabc');
    state = reducer(state, yieldActions.closeConfirmModal());
    expect(state.isConfirmModalOpen).toBe(false);
    expect(state.pendingTxHash).toBeNull();
  });
});
