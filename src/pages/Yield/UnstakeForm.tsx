import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits, formatUnits } from '@ethersproject/units';
import { Input } from '../../components/NumericalInput';
import { ButtonPrimary } from '../../components/Button';
import { selectUnstakeInput, selectContractBalance } from '../../state/yield/selectors';
import { yieldActions } from '../../state/yield/slice';
import { formatTokenAmount, InputContainer, InputRow, MaxButton, PreviewRow, WarningBanner } from './styleds';

interface UnstakeFormProps {
  stXCNBalance: string | null;
  isPaused: boolean;
  onUnstake: (amountWad: string) => void;
}

export default function UnstakeForm({ stXCNBalance, isPaused, onUnstake }: UnstakeFormProps) {
  const dispatch = useDispatch();
  const unstakeInput = useSelector(selectUnstakeInput);
  const contractBalance = useSelector(selectContractBalance);
  const { t } = useTranslation();

  const handleInput = (value: string) => {
    dispatch(yieldActions.setUnstakeInput(value));
  };

  const handleMax = () => {
    if (!stXCNBalance) return;
    try {
      dispatch(yieldActions.setUnstakeInput(formatUnits(stXCNBalance, 18)));
    } catch {
      dispatch(yieldActions.setUnstakeInput('0'));
    }
  };

  const { parsedAmount, error: inputError } = useMemo(() => {
    if (!unstakeInput || unstakeInput === '0') return { parsedAmount: null, error: null };
    try {
      const wad = parseUnits(unstakeInput, 18);
      if (wad.lte(0)) return { parsedAmount: null, error: null };
      if (!stXCNBalance || BigNumber.from(stXCNBalance).isZero()) {
        return { parsedAmount: wad, error: 'noBalance' as const };
      }
      if (wad.gt(BigNumber.from(stXCNBalance))) {
        return { parsedAmount: wad, error: 'insufficient' as const };
      }
      return { parsedAmount: wad, error: null };
    } catch {
      return { parsedAmount: null, error: null };
    }
  }, [unstakeInput, stXCNBalance]);

  const buttonText = useMemo(() => {
    if (isPaused) return t('yield.stakingPaused');
    if (!stXCNBalance || BigNumber.from(stXCNBalance || '0').isZero()) return t('yield.noStXCN');
    if (!parsedAmount) return t('yield.enterAmount');
    if (inputError === 'noBalance') return t('yield.noStXCN');
    if (inputError === 'insufficient') return t('yield.insufficientStXCN');
    return t('yield.unstakeStXCN');
  }, [isPaused, stXCNBalance, parsedAmount, inputError]);

  const showSolvencyWarning = useMemo(() => {
    if (!parsedAmount || !contractBalance) return false;
    try {
      return parsedAmount.gt(BigNumber.from(contractBalance));
    } catch {
      return false;
    }
  }, [parsedAmount, contractBalance]);

  const isDisabled = isPaused || !parsedAmount || !!inputError;

  const handleSubmit = () => {
    if (parsedAmount && !isDisabled) {
      onUnstake(parsedAmount.toString());
    }
  };

  return (
    <div>
      <InputContainer>
        <InputRow>
          <Input value={unstakeInput} onUserInput={handleInput} placeholder="0.0" fontSize="24px" />
          <MaxButton onClick={handleMax}>{t('yield.max')}</MaxButton>
        </InputRow>
      </InputContainer>
      <PreviewRow>
        <span>{t('yield.balanceStXCN', { amount: formatTokenAmount(stXCNBalance) })}</span>
      </PreviewRow>
      {parsedAmount && !inputError && (
        <PreviewRow>
          <span>{t('yield.receiveXCN', { amount: formatTokenAmount(parsedAmount.toString()) })}</span>
        </PreviewRow>
      )}
      {showSolvencyWarning && (
        <WarningBanner>{t('yield.solvencyWarning')}</WarningBanner>
      )}
      <ButtonPrimary onClick={handleSubmit} disabled={isDisabled} style={{ marginTop: '8px' }}>
        {buttonText}
      </ButtonPrimary>
    </div>
  );
}
