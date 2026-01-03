import { ChainId, Currency, CurrencyAmount, ETHER, Fraction, Percent } from '@uniswap/sdk';
import React from 'react';
import { Text } from 'rebass';
import { ButtonPrimary } from '../../components/Button';
import { RowBetween, RowFixed } from '../../components/Row';
import CurrencyLogo from '../../components/CurrencyLogo';
import { Field } from '../../state/mint/actions';
import { TYPE } from '../../theme';
import { useActiveWeb3React } from '../../hooks';

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

export function ConfirmAddModalBottom({
  noLiquidity,
  price,
  currencies,
  parsedAmounts,
  poolTokenPercentage,
  onAdd,
}: {
  noLiquidity?: boolean;
  price?: Fraction;
  currencies: { [field in Field]?: Currency };
  parsedAmounts: { [field in Field]?: CurrencyAmount };
  poolTokenPercentage?: Percent;
  onAdd: () => void;
}) {
  const { chainId } = useActiveWeb3React();

  // Get display symbols (XCN for native on Goliath)
  const symbolA = getCurrencySymbol(currencies[Field.CURRENCY_A], chainId);
  const symbolB = getCurrencySymbol(currencies[Field.CURRENCY_B], chainId);

  return (
    <>
      <RowBetween>
        <TYPE.body>{symbolA} Deposited</TYPE.body>
        <RowFixed>
          <CurrencyLogo currency={currencies[Field.CURRENCY_A]} style={{ marginRight: '8px' }} />
          <TYPE.body>{parsedAmounts[Field.CURRENCY_A]?.toSignificant(10)}</TYPE.body>
        </RowFixed>
      </RowBetween>
      <RowBetween>
        <TYPE.body>{symbolB} Deposited</TYPE.body>
        <RowFixed>
          <CurrencyLogo currency={currencies[Field.CURRENCY_B]} style={{ marginRight: '8px' }} />
          <TYPE.body>{parsedAmounts[Field.CURRENCY_B]?.toSignificant(10)}</TYPE.body>
        </RowFixed>
      </RowBetween>
      <RowBetween>
        <TYPE.body>Rates</TYPE.body>
        <TYPE.body>
          {`1 ${symbolA} = ${price?.toSignificant(4)} ${symbolB}`}
        </TYPE.body>
      </RowBetween>
      <RowBetween style={{ justifyContent: 'flex-end' }}>
        <TYPE.body>
          {`1 ${symbolB} = ${price?.invert().toSignificant(4)} ${symbolA}`}
        </TYPE.body>
      </RowBetween>
      <RowBetween>
        <TYPE.body>Share of Pool:</TYPE.body>
        <TYPE.body>{noLiquidity ? '100' : poolTokenPercentage?.toSignificant(4)}%</TYPE.body>
      </RowBetween>
      <ButtonPrimary style={{ margin: '20px 0 0 0' }} onClick={onAdd}>
        <Text fontWeight={500} fontSize={20}>
          {noLiquidity ? 'Create Pool & Supply' : 'Confirm Supply'}
        </Text>
      </ButtonPrimary>
    </>
  );
}
