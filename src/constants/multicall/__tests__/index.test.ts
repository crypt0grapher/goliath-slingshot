import { MULTICALL_ABI, MULTICALL_NETWORKS } from '../index';

describe('MULTICALL_NETWORKS', () => {
  it('has an entry for Sepolia (11155111)', () => {
    expect(MULTICALL_NETWORKS[11155111]).toBeDefined();
    expect(MULTICALL_NETWORKS[11155111]).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');
  });

  it('has an entry for Goliath Testnet (8901)', () => {
    expect(MULTICALL_NETWORKS[8901]).toBeDefined();
    expect(MULTICALL_NETWORKS[8901]).toBe('0xF912C1ad454aaaE03A1d72C53702F3dc0B4fcb69');
  });

  it('all entries are valid Ethereum addresses', () => {
    const addressRegex = /^0x[0-9a-fA-F]{40}$/;
    for (const [chainId, address] of Object.entries(MULTICALL_NETWORKS)) {
      expect(address).toMatch(addressRegex);
    }
  });
});

describe('MULTICALL_ABI', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MULTICALL_ABI)).toBe(true);
    expect(MULTICALL_ABI.length).toBeGreaterThan(0);
  });

  it('includes getEthBalance function', () => {
    const getEthBalance = MULTICALL_ABI.find(
      (entry: any) => entry.name === 'getEthBalance' && entry.type === 'function'
    );
    expect(getEthBalance).toBeDefined();
    expect(getEthBalance.inputs).toHaveLength(1);
    expect(getEthBalance.inputs[0].type).toBe('address');
    expect(getEthBalance.outputs[0].type).toBe('uint256');
  });

  it('includes aggregate function', () => {
    const aggregate = MULTICALL_ABI.find(
      (entry: any) => entry.name === 'aggregate' && entry.type === 'function'
    );
    expect(aggregate).toBeDefined();
    expect(aggregate.inputs).toHaveLength(1);
    expect(aggregate.inputs[0].type).toBe('tuple[]');
  });
});
