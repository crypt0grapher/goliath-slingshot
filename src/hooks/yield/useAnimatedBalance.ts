import { useRef, useState, useEffect } from 'react';
import { formatUnits } from '@ethersproject/units';
import { ANIMATION_DECIMAL_PLACES } from '../../constants/staking';

function formatStatic(value: number): string {
  const fixed = value.toFixed(ANIMATION_DECIMAL_PLACES);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = Number(intPart).toLocaleString('en-US');
  return decPart ? `${formattedInt}.${decPart}` : formattedInt;
}

export function useAnimatedBalance(
  balance: string | null,
  rewardRateRay: string | null,
  feePercentBps: number | null
): { displayValue: string; isAnimating: boolean } {
  const [displayValue, setDisplayValue] = useState('0.000000');
  const [isAnimating, setIsAnimating] = useState(false);

  const rafRef = useRef<number>(0);
  const baseBalanceRef = useRef(0);
  const growthPerMsRef = useRef(0);
  const startTimeRef = useRef(0);

  // Recompute base values when inputs change
  useEffect(() => {
    if (!balance || balance === '0') {
      setDisplayValue('0.000000');
      setIsAnimating(false);
      return;
    }

    const balanceFloat = parseFloat(formatUnits(balance, 18));
    if (balanceFloat <= 0) {
      setDisplayValue('0.000000');
      setIsAnimating(false);
      return;
    }

    // Show static balance when animation params are not yet available
    if (!rewardRateRay || feePercentBps === null) {
      setDisplayValue(formatStatic(balanceFloat));
      setIsAnimating(false);
      return;
    }

    const rate = parseFloat(rewardRateRay) / 1e27;
    const netRate = (rate * (10000 - feePercentBps)) / 10000;
    const growthPerSecond = (balanceFloat * netRate) / 31536000;
    const growthPerMs = growthPerSecond / 1000;

    baseBalanceRef.current = balanceFloat;
    growthPerMsRef.current = growthPerMs;
    startTimeRef.current = performance.now();
    setIsAnimating(true);
  }, [balance, rewardRateRay, feePercentBps]);

  // RAF loop
  useEffect(() => {
    if (!isAnimating) return;

    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const currentBalance = baseBalanceRef.current + growthPerMsRef.current * elapsed;

      const fixed = currentBalance.toFixed(ANIMATION_DECIMAL_PLACES);
      const [intPart, decPart] = fixed.split('.');
      const formattedInt = Number(intPart).toLocaleString('en-US');
      setDisplayValue(decPart ? `${formattedInt}.${decPart}` : formattedInt);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isAnimating]);

  return { displayValue, isAnimating };
}
