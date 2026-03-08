import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits, formatUnits } from '@ethersproject/units';
import { Input } from '../../components/NumericalInput';
import { ButtonPrimary } from '../../components/Button';
import { selectStakeInput } from '../../state/yield/selectors';
import { yieldActions } from '../../state/yield/slice';
import { formatTokenAmount, InputContainer, InputRow, MaxButton, PreviewRow } from './styleds';

const MIN_GAS_RESERVE = parseUnits('0.01', 18);

interface StakeFormProps {
  xcnBalance: string | null;
  isPaused: boolean;
  onStake: (amountWad: string) => void;
}

export default function StakeForm({ xcnBalance, isPaused, onStake }: StakeFormProps) {
  const dispatch = useDispatch();
  const stakeInput = useSelector(selectStakeInput);
  const { t } = useTranslation();

  const handleInput = (value: string) => {
    dispatch(yieldActions.setStakeInput(value));
  };

  const handleMax = () => {
    if (!xcnBalance) return;
    try {
      const bal = BigNumber.from(xcnBalance);
      const max = bal.sub(MIN_GAS_RESERVE);
      if (max.lte(0)) {
        dispatch(yieldActions.setStakeInput('0'));
        return;
      }
      dispatch(yieldActions.setStakeInput(formatUnits(max, 18)));
    } catch {
      dispatch(yieldActions.setStakeInput('0'));
    }
  };

  const { parsedAmount, preview, error: inputError } = useMemo(() => {
    if (!stakeInput || stakeInput === '0') return { parsedAmount: null, preview: null, error: null };
    try {
      const wad = parseUnits(stakeInput, 18);
      if (wad.lte(0)) return { parsedAmount: null, preview: null, error: null };
      if (xcnBalance && wad.gt(BigNumber.from(xcnBalance))) {
        return { parsedAmount: wad, preview: wad, error: 'insufficient' as const };
      }
      return { parsedAmount: wad, preview: wad, error: null };
    } catch {
      return { parsedAmount: null, preview: null, error: null };
    }
  }, [stakeInput, xcnBalance]);

  const buttonText = useMemo(() => {
    if (isPaused) return t('yield.stakingPaused');
    if (!parsedAmount) return t('yield.enterAmount');
    if (inputError === 'insufficient') return t('yield.insufficientXCN');
    return t('yield.stakeXCN');
  }, [isPaused, parsedAmount, inputError]);

  const isDisabled = isPaused || !parsedAmount || !!inputError;

  const handleSubmit = () => {
    if (parsedAmount && !isDisabled) {
      onStake(parsedAmount.toString());
    }
  };

  return (
    <div>
      <InputContainer>
        <InputRow>
          <Input value={stakeInput} onUserInput={handleInput} placeholder="0.0" fontSize="24px" />
          <MaxButton onClick={handleMax}>{t('yield.max')}</MaxButton>
        </InputRow>
      </InputContainer>
      <PreviewRow>
        <span>{t('yield.balanceXCN', { amount: formatTokenAmount(xcnBalance) })}</span>

      </PreviewRow>
      {preview && (
        <PreviewRow>
          <span>{t('yield.receiveStXCN', { amount: formatTokenAmount(preview.toString()) })}</span>
        </PreviewRow>
      )}
      <ButtonPrimary onClick={handleSubmit} disabled={isDisabled} style={{ marginTop: '8px' }}>
        {buttonText}
      </ButtonPrimary>
    </div>
  );
}
