import { RH_LANE } from '../../../config/rhBridge';
import { buildApproval, buildBridgeCall } from '../lane';
import { readWalletContext, sendLaneTransaction, switchWalletChain } from '../wallet';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const HASH = '0x' + 'cd'.repeat(32);
const rpcError = (code: number | string, message = 'error') => Object.assign(new Error(message), { code });

type Handler = (method: string, params?: unknown[]) => unknown;
function provider(handler: Handler) {
  const calls: { method: string; params?: unknown[] }[] = [];
  return {
    calls,
    request: jest.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      calls.push({ method, params });
      return handler(method, params);
    }),
  };
}
const wallet = (chainId: string, accounts: string[] = [ACCOUNT], send: () => unknown = () => HASH) =>
  provider((method) => {
    if (method === 'eth_chainId') return chainId;
    if (method === 'eth_accounts') return accounts;
    if (method === 'eth_sendTransaction') return send();
    throw rpcError(4200);
  });

describe('switchWalletChain', () => {
  test('switches directly when the chain is known', async () => {
    const p = provider(() => null);
    await expect(switchWalletChain(p, 46630)).resolves.toBe('SWITCHED');
    expect(p.calls).toEqual([{ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xb626' }] }]);
  });

  test('4902: adds the keyless Robinhood testnet then switches', async () => {
    let first = true;
    const p = provider((method) => {
      if (method === 'wallet_switchEthereumChain' && first) {
        first = false;
        throw rpcError(4902, 'Unrecognized chain ID');
      }
      return null;
    });
    await expect(switchWalletChain(p, 46630)).resolves.toBe('SWITCHED');
    expect(p.calls.map((c) => c.method)).toEqual([
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
    ]);
    expect(p.calls[1].params).toEqual([
      {
        chainId: '0xb626',
        chainName: 'Robinhood Chain Testnet',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
        blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com'],
      },
    ]);
  });

  test('4902 for Onyx adds the public Onyx testnet RPC', async () => {
    let first = true;
    const p = provider((method) => {
      if (method === 'wallet_switchEthereumChain' && first) {
        first = false;
        throw rpcError(4902);
      }
      return null;
    });
    await switchWalletChain(p, 8901);
    expect((p.calls[1].params as any)[0]).toMatchObject({
      chainId: '0x22c5',
      rpcUrls: ['https://rpc.testnet.onyx.org'],
    });
  });

  test('user rejection of switch or add is reported, other errors fail, nothing else is attempted', async () => {
    const rejectSwitch = provider(() => {
      throw rpcError(4001);
    });
    await expect(switchWalletChain(rejectSwitch, 46630)).resolves.toBe('REJECTED');
    expect(rejectSwitch.calls).toHaveLength(1);

    const rejectAdd = provider((method) => {
      if (method === 'wallet_switchEthereumChain') throw rpcError(4902);
      throw rpcError(4001);
    });
    await expect(switchWalletChain(rejectAdd, 46630)).resolves.toBe('REJECTED');
    expect(rejectAdd.calls.map((c) => c.method)).toEqual(['wallet_switchEthereumChain', 'wallet_addEthereumChain']);

    const other = provider(() => {
      throw rpcError(-32603);
    });
    await expect(switchWalletChain(other, 46630)).resolves.toBe('FAILED');
    expect(other.calls).toHaveLength(1);
  });
});

describe('readWalletContext', () => {
  test('reads chain and lowercase account', async () => {
    await expect(readWalletContext(wallet('0xb626', ['0x7dBe71B743e3e9f542324Dd032D080e9fA1A243A']))).resolves.toEqual({
      chainId: 46630,
      account: ACCOUNT,
    });
    await expect(readWalletContext(wallet('0x22c5', []))).resolves.toEqual({ chainId: 8901, account: null });
    await expect(readWalletContext(wallet('nope'))).rejects.toThrow('RH_WALLET_READ_FAILED');
  });
});

describe('sendLaneTransaction', () => {
  const approve = buildApproval('RH_TO_ONYX', RH_LANE, '1000');
  const burn = buildBridgeCall('ONYX_TO_RH', RH_LANE, {
    gross: '12000000000000000',
    recipient: ACCOUNT,
    maxFee: '2800000000000000',
  });

  test('sends exactly the built call from the confirmed account with value 0', async () => {
    const p = wallet('0xb626');
    await expect(sendLaneTransaction(p, ACCOUNT, approve)).resolves.toEqual({ kind: 'SENT', txHash: HASH });
    const send = p.calls.find((c) => c.method === 'eth_sendTransaction');
    expect(send?.params).toEqual([
      { from: ACCOUNT, to: RH_LANE.token, data: approve.data, value: '0x0', chainId: '0xb626' },
    ]);
    expect(p.calls.map((c) => c.method)).toEqual(['eth_chainId', 'eth_accounts', 'eth_sendTransaction']);
  });

  test('chain race: wallet on the wrong chain at send time never prompts', async () => {
    const p = wallet('0xb626');
    await expect(sendLaneTransaction(p, ACCOUNT, burn)).rejects.toThrow('RH_WALLET_CONTEXT_CHANGED');
    expect(p.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });

  test('account race: a different selected account never prompts', async () => {
    const p = wallet('0x22c5', ['0xaa91057c8f98af30c44bb8708399bf4daa188a81']);
    await expect(sendLaneTransaction(p, ACCOUNT, burn)).rejects.toThrow('RH_WALLET_CONTEXT_CHANGED');
    const locked = wallet('0x22c5', []);
    await expect(sendLaneTransaction(locked, ACCOUNT, burn)).rejects.toThrow('RH_WALLET_CONTEXT_CHANGED');
    expect([...p.calls, ...locked.calls].some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });

  test('4001 rejection is NOT_SENT; ambiguous errors are UNCERTAIN and the call is made exactly once', async () => {
    const rejected = wallet('0x22c5', [ACCOUNT], () => {
      throw rpcError(4001, 'User denied transaction signature.');
    });
    await expect(sendLaneTransaction(rejected, ACCOUNT, burn)).resolves.toEqual({ kind: 'NOT_SENT', code: '4001' });
    const internal = wallet('0x22c5', [ACCOUNT], () => {
      throw rpcError(-32603, 'Internal JSON-RPC error.');
    });
    await expect(sendLaneTransaction(internal, ACCOUNT, burn)).resolves.toEqual({ kind: 'UNCERTAIN', code: '-32603' });
    const noCode = wallet('0x22c5', [ACCOUNT], () => {
      throw new Error('timeout');
    });
    await expect(sendLaneTransaction(noCode, ACCOUNT, burn)).resolves.toEqual({ kind: 'UNCERTAIN', code: 'UNKNOWN' });
    const garbage = wallet('0x22c5', [ACCOUNT], () => '0x1234');
    await expect(sendLaneTransaction(garbage, ACCOUNT, burn)).resolves.toEqual({
      kind: 'UNCERTAIN',
      code: 'INVALID_HASH',
    });
    for (const p of [rejected, internal, noCode, garbage])
      expect(p.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);
  });
});
