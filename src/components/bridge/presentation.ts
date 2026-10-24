// SPDX-License-Identifier: Apache-2.0
import type { BridgeAsset } from '../../constants/bridge/registry';

export function bridgeAssetDisplayName(asset: Pick<BridgeAsset, 'symbol' | 'name'>): string {
  return asset.symbol === 'ETH' && /^Ether · (Robinhood|Sepolia) origin$/.test(asset.name) ? 'Ethereum' : asset.name;
}

export function isBlankOrZeroAmount(amount: string | undefined): boolean {
  return amount !== undefined && (amount === '' || /^(?:0+(?:\.0*)?|\.0+)$/.test(amount));
}

export function formatBridgeEta(seconds: number | null | undefined): string | undefined {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const total = Math.ceil(seconds),
    minutes = Math.floor(total / 60),
    remainder = total % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (remainder || !minutes) parts.push(`${remainder} ${remainder === 1 ? 'second' : 'seconds'}`);
  return `~${parts.join(' ')}`;
}
