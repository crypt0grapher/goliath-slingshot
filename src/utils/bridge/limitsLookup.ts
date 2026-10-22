import { type LimitsResponse } from '../../services/bridgeApi';
import { type BridgeDirection } from '../../state/bridge/types';

export interface MinAmountResult {
  amount: string;
  formatted: string;
}

/**
 * Read a token minimum from /bridge/limits.
 * The live API uses goliathToEthereum / ethereumToGoliath.
 * Older responses used goliathToSepolia / sepoliaToGoliath.
 * A missing direction or token returns null. It must not throw:
 * useBridgeForm calls this during render, and a throw blanks #/bridge.
 */
export function getMinAmountFromLimits(
  limits: LimitsResponse | null,
  token: string,
  direction: BridgeDirection
): MinAmountResult | null {
  if (!limits) return null;

  const dirLimits =
    direction === 'GOLIATH_TO_SEPOLIA'
      ? limits.goliathToSepolia ?? limits.goliathToEthereum
      : limits.sepoliaToGoliath ?? limits.ethereumToGoliath;

  const tokenLimits = dirLimits?.tokens?.[token];
  if (!tokenLimits) return null;

  return {
    amount: tokenLimits.minAmount,
    formatted: tokenLimits.minAmountFormatted,
  };
}
