import { BigNumber } from '@ethersproject/bignumber';
import { TransactionResponse } from '@ethersproject/providers';
import { ChainId, Currency, ETHER, TokenAmount } from '@uniswap/sdk';
import React, { useCallback, useContext, useState } from 'react';
import { AlertTriangle, Plus } from 'react-feather';
import { RouteComponentProps } from 'react-router-dom';
import { Text } from 'rebass';
import styled, { ThemeContext } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { ButtonError, ButtonPrimary } from '../../components/Button';
import { LightCard } from '../../components/Card';
import { AutoColumn, ColumnCenter } from '../../components/Column';
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../components/TransactionConfirmationModal';
import CurrencyInputPanel from '../../components/CurrencyInputPanel';
import DoubleCurrencyLogo from '../../components/DoubleLogo';
import { AddRemoveTabs } from '../../components/NavigationTabs';
import Row, { RowBetween, RowFlat } from '../../components/Row';

import { ROUTER_ADDRESS } from '../../constants';
import { PairState } from '../../data/Reserves';
import { useActiveWeb3React } from '../../hooks';
import { useNetworkSwitch, GOLIATH_TESTNET_CHAIN_ID } from '../../hooks/useNetworkSwitch';
import { useCurrency } from '../../hooks/Tokens';
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback';
import useTransactionDeadline from '../../hooks/useTransactionDeadline';
import { useWalletModalToggle } from '../../state/application/hooks';
import { Field } from '../../state/mint/actions';
import { useDerivedMintInfo, useMintActionHandlers, useMintState } from '../../state/mint/hooks';

import { useTransactionAdder } from '../../state/transactions/hooks';
import { useIsExpertMode, useUserSlippageTolerance } from '../../state/user/hooks';
import { TYPE } from '../../theme';
import { calculateGasMargin, calculateSlippageAmount, getRouterContract } from '../../utils';
import { maxAmountSpend } from '../../utils/maxAmountSpend';
import { wrappedCurrency } from '../../utils/wrappedCurrency';
import { safeToExact, isDustAmount } from '../../utils/safeAmountFormatting';
import AppBody from '../AppBody';
import { Dots, Wrapper } from '../Pool/styleds';
import { ConfirmAddModalBottom } from './ConfirmAddModalBottom';
import { currencyId } from '../../utils/currencyId';
import { PoolPriceBar } from './PoolPriceBar';

// Error message styled component
const ErrorCard = styled(LightCard)`
  padding: 12px;
  margin-top: 8px;
  background-color: ${({ theme }) => theme.red1}20;
  border: 1px solid ${({ theme }) => theme.red1};
`;

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.red1};
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

/**
 * Get the display symbol for a currency, showing XCN for native token on Goliath
 */
function getCurrencySymbol(currency: Currency | undefined, chainId: ChainId | undefined): string {
  if (!currency) return '';
  if (currency === ETHER) {
    return chainId === ChainId.GOLIATH_TESTNET ? 'XCN' : 'ETH';
  }
  return currency.symbol || '';
}

export default function AddLiquidity({
  match: {
    params: { currencyIdA, currencyIdB },
  },
  history,
}: RouteComponentProps<{ currencyIdA?: string; currencyIdB?: string }>) {
  const { t } = useTranslation();
  const { account, chainId, library } = useActiveWeb3React();
  const theme = useContext(ThemeContext);
  const { switchToGoliath, isLoading: isSwitchingNetwork } = useNetworkSwitch();
  const isWrongNetwork = account && chainId !== GOLIATH_TESTNET_CHAIN_ID;

  const currencyA = useCurrency(currencyIdA);
  const currencyB = useCurrency(currencyIdB);

  const toggleWalletModal = useWalletModalToggle(); // toggle wallet when disconnected

  const expertMode = useIsExpertMode();

  // mint state
  const { independentField, typedValue, otherTypedValue } = useMintState();
  const {
    dependentField,
    currencies,
    pairState,
    currencyBalances,
    parsedAmounts,
    price,
    noLiquidity,
    liquidityMinted,
    poolTokenPercentage,
    error: errorKey,
    errorParams,
  } = useDerivedMintInfo(currencyA ?? undefined, currencyB ?? undefined);

  const error = errorKey ? t(errorKey, errorParams) : undefined;

  const { onFieldAInput, onFieldBInput } = useMintActionHandlers(noLiquidity);

  const isValid = !errorKey;

  // modal and loading
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const [attemptingTxn, setAttemptingTxn] = useState<boolean>(false); // clicked confirm
  const [txError, setTxError] = useState<string | null>(null); // error message for user

  // txn values
  const deadline = useTransactionDeadline(); // custom from users settings
  const [allowedSlippage] = useUserSlippageTolerance(); // custom from users
  const [txHash, setTxHash] = useState<string>('');

  // get formatted amounts
  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: noLiquidity ? otherTypedValue : parsedAmounts[dependentField]?.toSignificant(7) ?? '',
  };

  // get the max amounts user can add
  const maxAmounts: { [field in Field]?: TokenAmount } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmountSpend(currencyBalances[field]),
      };
    },
    {}
  );

  const atMaxAmounts: { [field in Field]?: TokenAmount } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmounts[field]?.equalTo(parsedAmounts[field] ?? '0'),
      };
    },
    {}
  );

  // check whether the user has approved the router on the tokens
  const [approvalA, approveACallback] = useApproveCallback(parsedAmounts[Field.CURRENCY_A], ROUTER_ADDRESS);
  const [approvalB, approveBCallback] = useApproveCallback(parsedAmounts[Field.CURRENCY_B], ROUTER_ADDRESS);

  const addTransaction = useTransactionAdder();

  async function onAdd() {
    if (!chainId || !library || !account) return;
    const router = getRouterContract(chainId, library, account);

    const { [Field.CURRENCY_A]: parsedAmountA, [Field.CURRENCY_B]: parsedAmountB } = parsedAmounts;
    if (!parsedAmountA || !parsedAmountB || !currencyA || !currencyB || !deadline) return;

    // Clear any previous error
    setTxError(null);

    const amountsMin = {
      [Field.CURRENCY_A]: calculateSlippageAmount(parsedAmountA, noLiquidity ? 0 : allowedSlippage)[0],
      [Field.CURRENCY_B]: calculateSlippageAmount(parsedAmountB, noLiquidity ? 0 : allowedSlippage)[0],
    };

    // Get proper symbols for display (XCN for native on Goliath)
    const symbolA = getCurrencySymbol(currencyA, chainId);
    const symbolB = getCurrencySymbol(currencyB, chainId);

    let estimate,
      method: (...args: any) => Promise<TransactionResponse>,
      args: Array<string | string[] | number>,
      value: BigNumber | null;

    // Check if either currency is native (XCN on Goliath, ETH on Ethereum)
    // The router's addLiquidityETH method handles automatic wrapping of the native token
    if (currencyA === ETHER || currencyB === ETHER) {
      const tokenBIsNative = currencyB === ETHER;
      estimate = router.estimateGas.addLiquidityETH;
      method = router.addLiquidityETH;

      // Get the ERC20 token (the one that's not native)
      const token = wrappedCurrency(tokenBIsNative ? currencyA : currencyB, chainId);
      if (!token) {
        setTxError('Invalid token configuration');
        return;
      }

      args = [
        token.address, // ERC20 token address
        (tokenBIsNative ? parsedAmountA : parsedAmountB).raw.toString(), // token desired
        amountsMin[tokenBIsNative ? Field.CURRENCY_A : Field.CURRENCY_B].toString(), // token min
        amountsMin[tokenBIsNative ? Field.CURRENCY_B : Field.CURRENCY_A].toString(), // native min
        account,
        deadline.toHexString(),
      ];
      // Native token amount sent as transaction value
      value = BigNumber.from((tokenBIsNative ? parsedAmountB : parsedAmountA).raw.toString());
    } else {
      // Both are ERC20 tokens
      estimate = router.estimateGas.addLiquidity;
      method = router.addLiquidity;

      const tokenA = wrappedCurrency(currencyA, chainId);
      const tokenB = wrappedCurrency(currencyB, chainId);
      if (!tokenA || !tokenB) {
        setTxError('Invalid token configuration');
        return;
      }

      args = [
        tokenA.address,
        tokenB.address,
        parsedAmountA.raw.toString(),
        parsedAmountB.raw.toString(),
        amountsMin[Field.CURRENCY_A].toString(),
        amountsMin[Field.CURRENCY_B].toString(),
        account,
        deadline.toHexString(),
      ];
      value = null;
    }

    setAttemptingTxn(true);

    try {
      // First try to estimate gas to catch issues early
      let estimatedGasLimit: BigNumber;
      try {
        estimatedGasLimit = await estimate(...args, value ? { value } : {});
      } catch (estimateError: any) {
        console.error('Gas estimation failed:', estimateError);

        // Provide helpful error messages based on common failures
        if (estimateError?.message?.includes('INSUFFICIENT_')) {
          throw new Error('Insufficient liquidity or token amounts are too low');
        }
        if (estimateError?.message?.includes('EXPIRED')) {
          throw new Error('Transaction deadline expired. Please try again.');
        }
        if (estimateError?.message?.includes('insufficient funds')) {
          throw new Error(`Insufficient ${symbolA === 'XCN' || symbolB === 'XCN' ? 'XCN' : 'token'} balance`);
        }

        // Use fallback gas limit for other cases
        console.warn('Using fallback gas limit');
        estimatedGasLimit = BigNumber.from(400000);
      }

      // Execute the transaction
      const response = await method(...args, {
        ...(value ? { value } : {}),
        gasLimit: calculateGasMargin(estimatedGasLimit),
      });

      setAttemptingTxn(false);

      addTransaction(response, {
        summary: `Add ${parsedAmountA.toSignificant(3)} ${symbolA} and ${parsedAmountB.toSignificant(3)} ${symbolB}`,
      });

      setTxHash(response.hash);
    } catch (error: any) {
      setAttemptingTxn(false);

      // Handle user rejection
      if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
        console.debug('User rejected transaction');
        setTxError('Transaction rejected');
        return;
      }

      console.error('Add liquidity error:', error);

      // Set user-friendly error message
      let errorMessage = 'Failed to add liquidity. ';
      if (error?.message) {
        if (error.message.includes('insufficient funds')) {
          errorMessage = `Insufficient ${symbolA === 'XCN' || symbolB === 'XCN' ? 'XCN' : 'token'} balance for this transaction.`;
        } else if (error.message.includes('INSUFFICIENT_')) {
          errorMessage = 'Insufficient liquidity or amounts too low.';
        } else if (error.message.includes('EXPIRED')) {
          errorMessage = 'Transaction deadline expired. Please try again.';
        } else if (error.message.includes('user rejected')) {
          errorMessage = 'Transaction rejected.';
        } else {
          errorMessage += error.message.substring(0, 100);
        }
      } else {
        errorMessage += 'Please try again.';
      }

      setTxError(errorMessage);
    }
  }

  // Get display symbols (XCN instead of ETH on Goliath)
  const displaySymbolA = getCurrencySymbol(currencies[Field.CURRENCY_A], chainId);
  const displaySymbolB = getCurrencySymbol(currencies[Field.CURRENCY_B], chainId);

  const modalHeader = () => {
    return noLiquidity ? (
      <AutoColumn gap="20px">
        <LightCard mt="20px" borderRadius="20px">
          <RowFlat style={{ justifyContent: 'center' }}>
            <Text fontSize="24px" fontWeight={500} lineHeight="28px" marginRight={10}>
              {displaySymbolA + '/' + displaySymbolB}
            </Text>
            <DoubleCurrencyLogo
              currency0={currencies[Field.CURRENCY_A]}
              currency1={currencies[Field.CURRENCY_B]}
              size={30}
            />
          </RowFlat>
        </LightCard>
      </AutoColumn>
    ) : (
      <AutoColumn gap="20px">
        <RowFlat style={{ marginTop: '20px' }}>
          <Text fontSize="48px" fontWeight={500} lineHeight="42px" marginRight={10}>
            {liquidityMinted?.toSignificant(6)}
          </Text>
          <DoubleCurrencyLogo
            currency0={currencies[Field.CURRENCY_A]}
            currency1={currencies[Field.CURRENCY_B]}
            size={30}
          />
        </RowFlat>
        <Row>
          <Text fontSize="24px">
            {displaySymbolA + '/' + displaySymbolB + ' Pool Tokens'}
          </Text>
        </Row>
        <TYPE.italic fontSize={12} textAlign="left" padding={'8px 0 0 0 '}>
          {`Output is estimated. If the price changes by more than ${
            allowedSlippage / 100
          }% your transaction will revert.`}
        </TYPE.italic>
      </AutoColumn>
    );
  };

  const modalBottom = () => {
    return (
      <ConfirmAddModalBottom
        price={price}
        currencies={currencies}
        parsedAmounts={parsedAmounts}
        noLiquidity={noLiquidity}
        onAdd={onAdd}
        poolTokenPercentage={poolTokenPercentage}
      />
    );
  };

  const pendingText = `Supplying ${parsedAmounts[Field.CURRENCY_A]?.toSignificant(6)} ${displaySymbolA} and ${parsedAmounts[Field.CURRENCY_B]?.toSignificant(6)} ${displaySymbolB}`;

  // Default native currency for URLs (XCN on Goliath, ETH elsewhere)
  const defaultNativeCurrency = chainId === ChainId.GOLIATH_TESTNET ? 'XCN' : 'ETH';

  const handleCurrencyASelect = useCallback(
    (currencyA: Currency) => {
      const newCurrencyIdA = currencyId(currencyA, chainId);
      if (newCurrencyIdA === currencyIdB) {
        history.push(`/add/${currencyIdB}/${currencyIdA}`);
      } else {
        history.push(`/add/${newCurrencyIdA}/${currencyIdB}`);
      }
    },
    [currencyIdB, history, currencyIdA, chainId]
  );
  const handleCurrencyBSelect = useCallback(
    (currencyB: Currency) => {
      const newCurrencyIdB = currencyId(currencyB, chainId);
      if (currencyIdA === newCurrencyIdB) {
        if (currencyIdB) {
          history.push(`/add/${currencyIdB}/${newCurrencyIdB}`);
        } else {
          history.push(`/add/${newCurrencyIdB}`);
        }
      } else {
        history.push(`/add/${currencyIdA ? currencyIdA : defaultNativeCurrency}/${newCurrencyIdB}`);
      }
    },
    [currencyIdA, history, currencyIdB, chainId, defaultNativeCurrency]
  );

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirm(false);
    setTxError(null); // Clear any error when dismissing
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onFieldAInput('');
    }
    setTxHash('');
  }, [onFieldAInput, txHash]);

  const isCreate = history.location.pathname.includes('/create');

  return (
    <>
      <AppBody>
        <AddRemoveTabs creating={isCreate} adding={true} />
        <Wrapper>
          <TransactionConfirmationModal
            isOpen={showConfirm}
            onDismiss={handleDismissConfirmation}
            attemptingTxn={attemptingTxn}
            hash={txHash}
            content={() => (
              <ConfirmationModalContent
                title={noLiquidity ? t('youAreCreatingPool') : t('youWillReceiveTitle')}
                onDismiss={handleDismissConfirmation}
                topContent={modalHeader}
                bottomContent={modalBottom}
              />
            )}
            pendingText={pendingText}
          />
          <AutoColumn gap="20px">
            {noLiquidity ||
              (isCreate ? (
                <ColumnCenter>
                  <LightCard>
                    <AutoColumn gap="10px">
                      <TYPE.link fontWeight={600} color={'primaryText1'}>
                        {t('firstLiquidityProvider')}
                      </TYPE.link>
                      <TYPE.link fontWeight={400} color={'primaryText1'}>
                        {t('ratioWillSetPrice')}
                      </TYPE.link>
                      <TYPE.link fontWeight={400} color={'primaryText1'}>
                        {t('clickSupplyToReview')}
                      </TYPE.link>
                    </AutoColumn>
                  </LightCard>
                </ColumnCenter>
              ) : (
                <ColumnCenter>
                  <LightCard>
                    <AutoColumn gap="10px">
                      <TYPE.link fontWeight={400} color={'primaryText1'}>
                        <b>{t('tip')}</b> {t('poolTip')}
                      </TYPE.link>
                    </AutoColumn>
                  </LightCard>
                </ColumnCenter>
              ))}
            <CurrencyInputPanel
              value={formattedAmounts[Field.CURRENCY_A]}
              onUserInput={onFieldAInput}
              onMax={() => {
                const maxA = maxAmounts[Field.CURRENCY_A];
                if (!maxA || isDustAmount(maxA)) {
                  onFieldAInput('0');
                  return;
                }
                onFieldAInput(safeToExact(maxA, '0'));
              }}
              onCurrencySelect={handleCurrencyASelect}
              showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
              currency={currencies[Field.CURRENCY_A]}
              id="add-liquidity-input-tokena"
              showCommonBases
            />
            <ColumnCenter>
              <Plus size="16" color={theme.text2} />
            </ColumnCenter>
            <CurrencyInputPanel
              value={formattedAmounts[Field.CURRENCY_B]}
              onUserInput={onFieldBInput}
              onCurrencySelect={handleCurrencyBSelect}
              onMax={() => {
                const maxB = maxAmounts[Field.CURRENCY_B];
                if (!maxB || isDustAmount(maxB)) {
                  onFieldBInput('0');
                  return;
                }
                onFieldBInput(safeToExact(maxB, '0'));
              }}
              showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
              currency={currencies[Field.CURRENCY_B]}
              id="add-liquidity-input-tokenb"
              showCommonBases
            />
            {currencies[Field.CURRENCY_A] && currencies[Field.CURRENCY_B] && pairState !== PairState.INVALID && (
              <>
                <LightCard padding="0px" borderRadius={'20px'}>
                  <RowBetween padding="1rem">
                    <TYPE.subHeader fontWeight={500} fontSize={14}>
                      {noLiquidity ? t('initialPrices') : t('prices')} {t('andPoolShare')}
                    </TYPE.subHeader>
                  </RowBetween>{' '}
                  <LightCard padding="1rem" borderRadius={'20px'}>
                    <PoolPriceBar
                      currencies={currencies}
                      poolTokenPercentage={poolTokenPercentage}
                      noLiquidity={noLiquidity}
                      price={price}
                    />
                  </LightCard>
                </LightCard>
              </>
            )}

            {!account ? (
              <ButtonPrimary onClick={toggleWalletModal}>{t('connectWallet')}</ButtonPrimary>
            ) : isWrongNetwork ? (
              <ButtonPrimary onClick={switchToGoliath} disabled={isSwitchingNetwork}>
                {isSwitchingNetwork ? t('switching') : t('switchToGoliath')}
              </ButtonPrimary>
            ) : (
              <AutoColumn gap={'md'}>
                {(approvalA === ApprovalState.NOT_APPROVED ||
                  approvalA === ApprovalState.PENDING ||
                  approvalB === ApprovalState.NOT_APPROVED ||
                  approvalB === ApprovalState.PENDING) &&
                  isValid && (
                    <RowBetween>
                      {approvalA !== ApprovalState.APPROVED && (
                        <ButtonPrimary
                          onClick={approveACallback}
                          disabled={approvalA === ApprovalState.PENDING}
                          width={approvalB !== ApprovalState.APPROVED ? '48%' : '100%'}
                        >
                          {approvalA === ApprovalState.PENDING ? (
                            <Dots>Approving {displaySymbolA}</Dots>
                          ) : (
                            'Approve ' + displaySymbolA
                          )}
                        </ButtonPrimary>
                      )}
                      {approvalB !== ApprovalState.APPROVED && (
                        <ButtonPrimary
                          onClick={approveBCallback}
                          disabled={approvalB === ApprovalState.PENDING}
                          width={approvalA !== ApprovalState.APPROVED ? '48%' : '100%'}
                        >
                          {approvalB === ApprovalState.PENDING ? (
                            <Dots>Approving {displaySymbolB}</Dots>
                          ) : (
                            'Approve ' + displaySymbolB
                          )}
                        </ButtonPrimary>
                      )}
                    </RowBetween>
                  )}
                <ButtonError
                  onClick={() => {
                    setTxError(null); // Clear previous error
                    expertMode ? onAdd() : setShowConfirm(true);
                  }}
                  disabled={!isValid || approvalA !== ApprovalState.APPROVED || approvalB !== ApprovalState.APPROVED}
                  error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
                >
                  <Text fontSize={20} fontWeight={500}>
                    {error ?? t('supply')}
                  </Text>
                </ButtonError>
                {/* Display error message if transaction failed */}
                {txError && (
                  <ErrorCard>
                    <ErrorText>
                      <AlertTriangle size={16} />
                      {txError}
                    </ErrorText>
                  </ErrorCard>
                )}
              </AutoColumn>
            )}
          </AutoColumn>
        </Wrapper>
      </AppBody>
    </>
  );
}
