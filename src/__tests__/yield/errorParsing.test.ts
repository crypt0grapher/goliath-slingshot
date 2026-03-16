import { parseTransactionError } from '../../hooks/yield/useStake';

describe('parseTransactionError', () => {
  it('returns user rejection message for code 4001', () => {
    const err = { code: 4001, message: 'User rejected' };
    expect(parseTransactionError(err)).toBe('Transaction rejected by user');
  });

  it('returns user rejection for ACTION_REJECTED code', () => {
    const err = { code: 'ACTION_REJECTED', message: 'User rejected' };
    expect(parseTransactionError(err)).toBe('Transaction rejected by user');
  });

  it('decodes ZeroAmount error selector 0x1f2a2005', () => {
    const err = {
      code: 3,
      message: '[Request ID: a9fc2a89-b223-439d-8df9-fe2b8e9eb1dd] execution reverted: CONTRACT_REVERT_EXECUTED',
      data: '0x1f2a2005',
    };
    expect(parseTransactionError(err)).toBe('Amount must be greater than zero');
  });

  it('decodes InsufficientBalance error selector 0xcf479181', () => {
    const err = {
      code: 3,
      data: '0xcf479181000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000005',
    };
    expect(parseTransactionError(err)).toBe('Insufficient stXCN balance');
  });

  it('decodes InsufficientContractBalance error selector 0xf51b158c', () => {
    const err = { data: '0xf51b158c0000' };
    expect(parseTransactionError(err)).toBe('Insufficient contract balance — please try a smaller amount');
  });

  it('decodes TransferFailed error selector 0x3204506f', () => {
    const err = { data: '0x3204506f' };
    expect(parseTransactionError(err)).toBe('Transfer failed');
  });

  it('decodes error selector from nested err.error.data', () => {
    const err = { error: { data: '0x1f2a2005' } };
    expect(parseTransactionError(err)).toBe('Amount must be greater than zero');
  });

  it('strips Request ID prefix from relay messages', () => {
    const err = {
      message: '[Request ID: a9fc2a89-b223-439d-8df9-fe2b8e9eb1dd] some error happened',
    };
    expect(parseTransactionError(err)).toBe('some error happened');
  });

  it('strips Request ID from reason when reason is meaningful', () => {
    const err = {
      reason: '[Request ID: abc-123] insufficient funds',
    };
    expect(parseTransactionError(err)).toBe('insufficient funds');
  });

  it('skips reason when it contains CONTRACT_REVERT_EXECUTED', () => {
    const err = {
      reason: 'execution reverted: CONTRACT_REVERT_EXECUTED',
      message: '[Request ID: abc-123] execution reverted: CONTRACT_REVERT_EXECUTED',
    };
    // Should fall through to message, stripping request ID
    const result = parseTransactionError(err);
    expect(result).not.toContain('Request ID');
    expect(result).toContain('CONTRACT_REVERT_EXECUTED');
  });

  it('returns generic message for unknown errors', () => {
    const err = {};
    expect(parseTransactionError(err)).toBe('Transaction failed');
  });

  it('truncates long messages to 200 chars', () => {
    const err = { message: 'x'.repeat(300) };
    expect(parseTransactionError(err).length).toBeLessThanOrEqual(200);
  });
});
