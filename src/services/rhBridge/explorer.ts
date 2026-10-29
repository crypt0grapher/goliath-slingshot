// Explorer links built from the reviewed deployment explorers, never from API-supplied URLs.
import { ONYX_NATIVE_TX_EXPLORER, RH_EXPLORERS } from '../../config/rhBridge';
import { ONYX_TESTNET_CHAIN_ID } from '../../constants/rhBridge';

const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
// Hedera consensus timestamp "<sec>.<nanos>" or transaction id "<shard>.<realm>.<num>@<sec>.<nanos>".
const HEDERA_TX_ID = /^(\d+\.\d+\.\d+@)?\d+\.\d+$/;

export function laneTxUrl(chainId: number, id: string): string | null {
  const base = RH_EXPLORERS[chainId];
  if (!base || typeof id !== 'string') return null;
  if (EVM_HASH.test(id)) return `${base}/tx/${id.toLowerCase()}`;
  if (chainId === ONYX_TESTNET_CHAIN_ID && HEDERA_TX_ID.test(id)) return `${ONYX_NATIVE_TX_EXPLORER}/${id}`;
  return null;
}
