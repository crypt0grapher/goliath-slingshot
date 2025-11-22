import { CurrencyAmount, ETHER, JSBI, Token, Trade } from '@uniswap/sdk';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowDown } from 'react-feather';
import { Text } from 'rebass';
import { ThemeContext } from 'styled-components';
import AddressInputPanel from '../../components/AddressInputPanel';
import { ButtonError, ButtonPrimary, ButtonConfirmed } from '../../components/Button';
import Card, { GreyCard } from '../../components/Card';
import Column, { AutoColumn } from '../../components/Column';
import ConfirmSwapModal from '../../components/swap/ConfirmSwapModal';
import CurrencyInputPanel from '../../components/CurrencyInputPanel';
import { SwapPoolTabs } from '../../components/NavigationTabs';
import { AutoRow, RowBetween } from '../../components/Row';
import confirmPriceImpactWithoutFee from '../../components/swap/confirmPriceImpactWithoutFee';
import { ArrowWrapper, BottomGrouping, SwapCallbackError, Wrapper } from '../../components/swap/styleds';
import TradePrice from '../../components/swap/TradePrice';
import TokenWarningModal from '../../components/TokenWarningModal';
import ProgressSteps from '../../components/ProgressSteps';
import SwapHeader from '../../components/swap/SwapHeader';
import AdvancedSwapDetailsDropdown from '../../components/swap/AdvancedSwapDetailsDropdown';
import { useActiveWeb3React } from '../../hooks';
import { useCurrency, useAllTokens } from '../../hooks/Tokens';
import { ApprovalState, useApproveCallbackFromTrade } from '../../hooks/useApproveCallback';
import { useSwapCallback } from '../../hooks/useSwapCallback';
import useWrapCallback, { WrapType } from '../../hooks/useWrapCallback';
import { useToggleSettingsMenu, useWalletModalToggle } from '../../state/application/hooks';
import { Field } from '../../state/swap/actions';
import {
  useDefaultsFromURLSearch,
  useDerivedSwapInfo,
  useSwapActionHandlers,
  useSwapState,
} from '../../state/swap/hooks';
import { useExpertModeManager, useUserSlippageTolerance, useUserSingleHopOnly } from '../../state/user/hooks';
import { LinkStyledButton, TYPE } from '../../theme';
import { maxAmountSpend } from '../../utils/maxAmountSpend';
import { computeTradePriceBreakdown, warningSeverity } from '../../utils/prices';
import AppBody from '../AppBody';
import { ClickableText } from '../Pool/styleds';
import Loader from '../../components/Loader';
import { WXCN } from '../../constants';

export default function Swap() {
  const loadedUrlParams = useDefaultsFromURLSearch();

  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.inputCurrencyId),
    useCurrency(loadedUrlParams?.outputCurrencyId),
  ];
  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false);
  const urlLoadedTokens: Token[] = useMemo(
    () => [loadedInputCurrency, loadedOutputCurrency]?.filter((c): c is Token => c instanceof Token) ?? [],
    [loadedInputCurrency, loadedOutputCurrency]
  );
  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true);
  }, []);

  // dismiss warning if all imported tokens are in active lists
  const defaultTokens = useAllTokens();
  const importTokensNotInDefault =
    urlLoadedTokens &&
    urlLoadedTokens.filter((token: Token) => {
      return !Boolean(token.address in defaultTokens);
    });

  const { account } = useActiveWeb3React();
  const theme = useContext(ThemeContext);

  // toggle wallet when disconnected
  const toggleWalletModal = useWalletModalToggle();

  // for expert mode
  const toggleSettings = useToggleSettingsMenu();
  const [isExpertMode] = useExpertModeManager();

  // get custom setting values for user
  const [allowedSlippage] = useUserSlippageTolerance();

  // swap state
  const { independentField, typedValue, recipient } = useSwapState();
  const { v2Trade, currencyBalances, parsedAmount, currencies, inputError: swapInputError } = useDerivedSwapInfo();
  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError,
  } = useWrapCallback(currencies[Field.INPUT], currencies[Field.OUTPUT], typedValue);

  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE;

  // Detect if this is an XCN → Token swap (not XCN → WXCN which is handled by wrap)
  // These need special handling due to WXCN decimal scaling
  const isXCNToToken = currencies[Field.INPUT] === ETHER &&
    currencies[Field.OUTPUT] instanceof Token &&
    currencies[Field.OUTPUT]?.symbol !== 'WXCN';

  // For XCN → Token swaps, we need to wrap first then swap
  // So we hide the direct trade and show wrap + swap flow
  const trade = showWrap ? undefined : v2Trade;

  // State for two-step XCN swap process
  const [xcnSwapStep, setXcnSwapStep] = useState<'idle' | 'wrapping' | 'approving' | 'swapping' | 'done'>('idle');

  // Get wrap callback for XCN → WXCN (used in two-step process)
  const {
    execute: executeXcnWrap,
  } = useWrapCallback(
    isXCNToToken ? ETHER : undefined,
    isXCNToToken ? WXCN : undefined,
    isXCNToToken ? typedValue : undefined
  );


  const parsedAmounts = showWrap
    ? {
        [Field.INPUT]: parsedAmount,
        [Field.OUTPUT]: parsedAmount,
      }
    : {
        [Field.INPUT]: independentField === Field.INPUT ? parsedAmount : trade?.inputAmount,
        [Field.OUTPUT]: independentField === Field.OUTPUT ? parsedAmount : trade?.outputAmount,
      };

  const { onSwitchTokens, onCurrencySelection, onUserInput, onChangeRecipient } = useSwapActionHandlers();
  const isValid = !swapInputError;
  const dependentField: Field = independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT;

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value);
    },
    [onUserInput]
  );
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value);
    },
    [onUserInput]
  );

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    showConfirm: boolean;
    tradeToConfirm: Trade | undefined;
    attemptingTxn: boolean;
    swapErrorMessage: string | undefined;
    txHash: string | undefined;
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined,
  });

  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: showWrap
      ? parsedAmounts[independentField]?.toExact() ?? ''
      : parsedAmounts[dependentField]?.toSignificant(7) ?? '',
  };

  const route = trade?.route;
  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] && currencies[Field.OUTPUT] && parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0))
  );
  const noRoute = !route;

  // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallbackFromTrade(trade, allowedSlippage);

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false);

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true);
    }
  }, [approval, approvalSubmitted]);

  const maxAmountInput: CurrencyAmount | undefined = maxAmountSpend(currencyBalances[Field.INPUT]);
  const atMaxAmountInput = Boolean(maxAmountInput && parsedAmounts[Field.INPUT]?.equalTo(maxAmountInput));

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapCallback(trade, allowedSlippage, recipient);

  const { priceImpactWithoutFee } = computeTradePriceBreakdown(trade);

  const [singleHopOnly] = useUserSingleHopOnly();

  const handleSwap = useCallback(() => {
    if (priceImpactWithoutFee && !confirmPriceImpactWithoutFee(priceImpactWithoutFee)) {
      return;
    }
    if (!swapCallback) {
      return;
    }
    setSwapState({ attemptingTxn: true, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: undefined });
    swapCallback()
      .then((hash) => {
        setSwapState({ attemptingTxn: false, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: hash });
      })
      .catch((error) => {
        setSwapState({
          attemptingTxn: false,
          tradeToConfirm,
          showConfirm,
          swapErrorMessage: error.message,
          txHash: undefined,
        });
      });
  }, [priceImpactWithoutFee, swapCallback, tradeToConfirm, showConfirm]);

  // Handler for XCN → Token two-step swap (wrap first, then swap)
  const handleXCNSwap = useCallback(async () => {
    if (!executeXcnWrap || !isXCNToToken) return;

    try {
      // Step 1: Wrap XCN to WXCN
      setXcnSwapStep('wrapping');
      setSwapState({ attemptingTxn: true, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: undefined });

      await executeXcnWrap();

      // After wrapping, user needs to:
      // 1. Wait for wrap tx to confirm
      // 2. Approve WXCN for the router
      // 3. Execute the swap with WXCN as input

      setXcnSwapStep('done');
      setSwapState({
        attemptingTxn: false,
        tradeToConfirm,
        showConfirm: false,
        swapErrorMessage: undefined,
        txHash: undefined,
      });

      // Show success message - user should now swap WXCN to target token
      alert('XCN wrapped to WXCN successfully! Now select WXCN as input and swap to your desired token.');

    } catch (error: any) {
      setXcnSwapStep('idle');
      setSwapState({
        attemptingTxn: false,
        tradeToConfirm,
        showConfirm,
        swapErrorMessage: error.message || 'Wrap failed',
        txHash: undefined,
      });
    }
  }, [executeXcnWrap, isXCNToToken, tradeToConfirm, showConfirm]);

  // errors
  const [showInverted, setShowInverted] = useState<boolean>(false);

  // warnings on slippage
  const priceImpactSeverity = warningSeverity(priceImpactWithoutFee);

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED)) &&
    !(priceImpactSeverity > 3 && !isExpertMode);

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({ showConfirm: false, tradeToConfirm, attemptingTxn, swapErrorMessage, txHash });
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, '');
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash]);

  const handleAcceptChanges = useCallback(() => {
    setSwapState({ tradeToConfirm: trade, swapErrorMessage, txHash, attemptingTxn, showConfirm });
  }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash]);

  const handleInputSelect = useCallback(
    (inputCurrency) => {
      setApprovalSubmitted(false); // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, inputCurrency);
    },
    [onCurrencySelection]
  );

  const handleMaxInput = useCallback(() => {
    if (maxAmountInput) {
      const exactValue = maxAmountInput.toExact();
      console.log('DEBUG MAX BUTTON:', {
        maxAmountInputRaw: maxAmountInput.raw.toString(),
        toExact: exactValue,
        toSignificant: maxAmountInput.toSignificant(7),
        numerator: maxAmountInput.numerator.toString(),
        denominator: maxAmountInput.denominator.toString(),
        currencyDecimals: maxAmountInput.currency.decimals,
        currencySymbol: maxAmountInput.currency.symbol
      });
      onUserInput(Field.INPUT, exactValue);
    }
  }, [maxAmountInput, onUserInput]);

  const handleOutputSelect = useCallback(
    (outputCurrency) => onCurrencySelection(Field.OUTPUT, outputCurrency),
    [onCurrencySelection]
  );

  return (
    <>
      <TokenWarningModal
        isOpen={importTokensNotInDefault.length > 0 && !dismissTokenWarning}
        tokens={importTokensNotInDefault}
        onConfirm={handleConfirmTokenWarning}
      />
      <SwapPoolTabs active={'swap'} />
      <AppBody>
        <SwapHeader />
        <Wrapper id="swap-page">
          <ConfirmSwapModal
            isOpen={showConfirm}
            trade={trade}
            originalTrade={tradeToConfirm}
            onAcceptChanges={handleAcceptChanges}
            attemptingTxn={attemptingTxn}
            txHash={txHash}
            recipient={recipient}
            allowedSlippage={allowedSlippage}
            onConfirm={handleSwap}
            swapErrorMessage={swapErrorMessage}
            onDismiss={handleConfirmDismiss}
          />

          <AutoColumn gap={'md'}>
            <CurrencyInputPanel
              label={independentField === Field.OUTPUT && !showWrap && trade ? 'From (estimated)' : 'From'}
              value={formattedAmounts[Field.INPUT]}
              showMaxButton={!atMaxAmountInput}
              currency={currencies[Field.INPUT]}
              onUserInput={handleTypeInput}
              onMax={handleMaxInput}
              onCurrencySelect={handleInputSelect}
              otherCurrency={currencies[Field.OUTPUT]}
              id="swap-currency-input"
            />
            <AutoColumn justify="space-between">
              <AutoRow justify={isExpertMode ? 'space-between' : 'center'} style={{ padding: '0 1rem' }}>
                <ArrowWrapper clickable>
                  <ArrowDown
                    size="16"
                    onClick={() => {
                      setApprovalSubmitted(false); // reset 2 step UI for approvals
                      onSwitchTokens();
                    }}
                    color={currencies[Field.INPUT] && currencies[Field.OUTPUT] ? theme.primary1 : theme.text2}
                  />
                </ArrowWrapper>
                {recipient === null && !showWrap && isExpertMode ? (
                  <LinkStyledButton id="add-recipient-button" onClick={() => onChangeRecipient('')}>
                    + Add a send (optional)
                  </LinkStyledButton>
                ) : null}
              </AutoRow>
            </AutoColumn>
            <CurrencyInputPanel
              value={formattedAmounts[Field.OUTPUT]}
              onUserInput={handleTypeOutput}
              label={independentField === Field.INPUT && !showWrap && trade ? 'To (estimated)' : 'To'}
              showMaxButton={false}
              currency={currencies[Field.OUTPUT]}
              onCurrencySelect={handleOutputSelect}
              otherCurrency={currencies[Field.INPUT]}
              id="swap-currency-output"
            />

            {recipient !== null && !showWrap ? (
              <>
                <AutoRow justify="space-between" style={{ padding: '0 1rem' }}>
                  <ArrowWrapper clickable={false}>
                    <ArrowDown size="16" color={theme.text2} />
                  </ArrowWrapper>
                  <LinkStyledButton id="remove-recipient-button" onClick={() => onChangeRecipient(null)}>
                    - Remove send
                  </LinkStyledButton>
                </AutoRow>
                <AddressInputPanel id="recipient" value={recipient} onChange={onChangeRecipient} />
              </>
            ) : null}

            {showWrap ? null : (
              <Card padding={showWrap ? '.25rem 1rem 0 1rem' : '0px'} borderRadius={'20px'}>
                <AutoColumn gap="8px" style={{ padding: '3px 4px' }}>
                  {Boolean(trade) && (
                    <RowBetween align="center">
                      <Text fontWeight={500} fontSize={14} color={theme.text2}>
                        Price
                      </Text>
                      <TradePrice
                        price={trade?.executionPrice}
                        showInverted={showInverted}
                        setShowInverted={setShowInverted}
                      />
                    </RowBetween>
                  )}
                  <RowBetween align="center">
                    <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                      Slippage Tolerance
                    </ClickableText>
                    <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                      {allowedSlippage / 100}%
                    </ClickableText>
                  </RowBetween>
                </AutoColumn>
              </Card>
            )}
          </AutoColumn>

          <BottomGrouping>
            {!account ? (
              <ButtonPrimary onClick={toggleWalletModal}>Connect Wallet</ButtonPrimary>
            ) : showWrap ? (
              <ButtonPrimary disabled={Boolean(wrapInputError)} onClick={onWrap}>
                {wrapInputError ??
                  (wrapType === WrapType.WRAP ? 'Wrap' : wrapType === WrapType.UNWRAP ? 'Unwrap' : null)}
              </ButtonPrimary>
            ) : isXCNToToken ? (
              <AutoColumn gap="md">
                <TYPE.main style={{ textAlign: 'center', marginBottom: '8px' }}>
                  ⚠️ XCN swaps require wrapping first
                </TYPE.main>
                <ButtonPrimary
                  onClick={handleXCNSwap}
                  disabled={!parsedAmount || xcnSwapStep === 'wrapping'}
                >
                  {xcnSwapStep === 'wrapping' ? (
                    <AutoRow gap="6px" justify="center">
                      Wrapping XCN... <Loader stroke="white" />
                    </AutoRow>
                  ) : (
                    `Wrap ${typedValue || '0'} XCN to WXCN`
                  )}
                </ButtonPrimary>
                <TYPE.small style={{ textAlign: 'center', color: '#888' }}>
                  After wrapping, select WXCN as input to complete the swap
                </TYPE.small>
              </AutoColumn>
            ) : noRoute && userHasSpecifiedInputOutput ? (
              <GreyCard style={{ textAlign: 'center' }}>
                <TYPE.main mb="4px">Insufficient liquidity for this trade.</TYPE.main>
                {singleHopOnly && <TYPE.main mb="4px">Try enabling multi-hop trades.</TYPE.main>}
              </GreyCard>
            ) : showApproveFlow ? (
              <RowBetween>
                <ButtonConfirmed
                  onClick={approveCallback}
                  disabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
                  width="48%"
                  altDisabledStyle={approval === ApprovalState.PENDING} // show solid button while waiting
                  confirmed={approval === ApprovalState.APPROVED}
                >
                  {approval === ApprovalState.PENDING ? (
                    <AutoRow gap="6px" justify="center">
                      Approving <Loader stroke="white" />
                    </AutoRow>
                  ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                    'Approved'
                  ) : (
                    'Approve ' + currencies[Field.INPUT]?.symbol
                  )}
                </ButtonConfirmed>
                <ButtonError
                  onClick={() => {
                    if (isExpertMode) {
                      handleSwap();
                    } else {
                      setSwapState({
                        tradeToConfirm: trade,
                        attemptingTxn: false,
                        swapErrorMessage: undefined,
                        showConfirm: true,
                        txHash: undefined,
                      });
                    }
                  }}
                  width="48%"
                  id="swap-button"
                  disabled={
                    !isValid || approval !== ApprovalState.APPROVED || (priceImpactSeverity > 3 && !isExpertMode)
                  }
                  error={isValid && priceImpactSeverity > 2}
                >
                  <Text fontSize={16} fontWeight={500}>
                    {priceImpactSeverity > 3 && !isExpertMode
                      ? `Price Impact High`
                      : `Swap${priceImpactSeverity > 2 ? ' Anyway' : ''}`}
                  </Text>
                </ButtonError>
              </RowBetween>
            ) : (
              <ButtonError
                onClick={() => {
                  if (isExpertMode) {
                    handleSwap();
                  } else {
                    setSwapState({
                      tradeToConfirm: trade,
                      attemptingTxn: false,
                      swapErrorMessage: undefined,
                      showConfirm: true,
                      txHash: undefined,
                    });
                  }
                }}
                id="swap-button"
                disabled={!isValid || (priceImpactSeverity > 3 && !isExpertMode) || !!swapCallbackError}
                error={isValid && priceImpactSeverity > 2 && !swapCallbackError}
              >
                <Text fontSize={20} fontWeight={500}>
                  {swapInputError
                    ? swapInputError
                    : priceImpactSeverity > 3 && !isExpertMode
                    ? `Price Impact Too High`
                    : `Swap${priceImpactSeverity > 2 ? ' Anyway' : ''}`}
                </Text>
              </ButtonError>
            )}
            {showApproveFlow && (
              <Column style={{ marginTop: '1rem' }}>
                <ProgressSteps steps={[approval === ApprovalState.APPROVED]} />
              </Column>
            )}
            {isExpertMode && swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
          </BottomGrouping>
        </Wrapper>

        {trade && <AdvancedSwapDetailsDropdown trade={trade} />}
      </AppBody>
    </>
  );
}
