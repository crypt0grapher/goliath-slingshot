// SPDX-License-Identifier: Apache-2.0
import type { BridgeAsset } from '../../constants/bridge/registry';

export function bridgeAssetDisplayName(asset: Pick<BridgeAsset, 'symbol' | 'name'>): string {
  return asset.symbol === 'ETH' && /^Ether · (Robinhood|Sepolia) origin$/.test(asset.name) ? 'Ethereum' : asset.name;
}

export function isBlankOrZeroAmount(amount: string | undefined): boolean {
  return amount !== undefined && (amount === '' || /^(?:0+(?:\.0*)?|\.0+)$/.test(amount));
}
