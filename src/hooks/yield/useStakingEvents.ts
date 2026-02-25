import { useState, useEffect } from 'react';
import { BigNumber } from '@ethersproject/bignumber';
import { StakingEvent } from '../../state/yield/types';
import { useStakedXCNContract } from './useStakedXCNContract';
import { useActiveWeb3React } from '../index';
import { getReadonlyProvider } from '../../services/bridgeProviders';
import { BridgeNetwork } from '../../constants/bridge/networks';

export function useStakingEvents(): {
  events: StakingEvent[];
  isLoading: boolean;
  totalPrincipal: BigNumber;
} {
  const contract = useStakedXCNContract(false);
  const { account } = useActiveWeb3React();
  const [events, setEvents] = useState<StakingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPrincipal, setTotalPrincipal] = useState(BigNumber.from(0));

  useEffect(() => {
    if (!contract || !account) {
      setEvents([]);
      setTotalPrincipal(BigNumber.from(0));
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const stakedFilter = contract.filters.Staked(account);
        const unstakedFilter = contract.filters.Unstaked(account);
        const [stakedEvents, unstakedEvents] = await Promise.all([
          contract.queryFilter(stakedFilter),
          contract.queryFilter(unstakedFilter),
        ]);

        let principal = BigNumber.from(0);
        const parsed: StakingEvent[] = [];

        for (const e of stakedEvents) {
          const xcnAmount = e.args?.xcnAmount?.toString() || '0';
          const stXCNMinted = e.args?.stXCNMinted?.toString() || '0';
          principal = principal.add(BigNumber.from(xcnAmount));
          parsed.push({
            type: 'stake',
            txHash: e.transactionHash,
            user: account,
            xcnAmount,
            stXCNAmount: stXCNMinted,
            blockNumber: e.blockNumber,
            timestamp: null,
          });
        }

        for (const e of unstakedEvents) {
          const xcnReturned = e.args?.xcnReturned?.toString() || '0';
          const stXCNBurned = e.args?.stXCNBurned?.toString() || '0';
          principal = principal.sub(BigNumber.from(xcnReturned));
          parsed.push({
            type: 'unstake',
            txHash: e.transactionHash,
            user: account,
            xcnAmount: xcnReturned,
            stXCNAmount: stXCNBurned,
            blockNumber: e.blockNumber,
            timestamp: null,
          });
        }

        // Sort newest first
        parsed.sort((a, b) => b.blockNumber - a.blockNumber);

        // Resolve timestamps (deduplicated by block number)
        const goliathProvider = getReadonlyProvider(BridgeNetwork.GOLIATH);
        const uniqueBlocks = [...new Set(parsed.map((e) => e.blockNumber))];
        const blockTimestamps = new Map<number, number | null>();
        await Promise.all(
          uniqueBlocks.map(async (blockNum) => {
            try {
              const block = await goliathProvider.getBlock(blockNum);
              blockTimestamps.set(blockNum, block?.timestamp ?? null);
            } catch {
              blockTimestamps.set(blockNum, null);
            }
          })
        );

        for (const event of parsed) {
          event.timestamp = blockTimestamps.get(event.blockNumber) ?? null;
        }

        if (!cancelled) {
          setEvents(parsed);
          setTotalPrincipal(principal.lt(0) ? BigNumber.from(0) : principal);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch staking events:', err);
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contract, account]);

  return { events, isLoading, totalPrincipal };
}
