import { getMinAmountFromLimits } from '../limitsLookup';
import { type LimitsResponse } from '../../../services/bridgeApi';

const ethereumShape: LimitsResponse = {
  goliathToEthereum: {
    feeBps: 25,
    tokens: {
      ETH: {
        minAmount: '10000000000000000',
        minAmountFormatted: '0.01',
        minFee: '3000000000000000',
        minFeeFormatted: '0.003',
      },
    },
  },
  ethereumToGoliath: {
    feeBps: 0,
    tokens: {
      ETH: {
        minAmount: '0',
        minAmountFormatted: '0',
        minFee: '0',
        minFeeFormatted: '0',
      },
    },
  },
};

const sepoliaShape: LimitsResponse = {
  goliathToSepolia: ethereumShape.goliathToEthereum,
  sepoliaToGoliath: ethereumShape.ethereumToGoliath,
};

describe('getMinAmountFromLimits', () => {
  it('reads the live ethereum key names without throwing', () => {
    expect(getMinAmountFromLimits(ethereumShape, 'ETH', 'GOLIATH_TO_SEPOLIA')).toEqual({
      amount: '10000000000000000',
      formatted: '0.01',
    });
    expect(getMinAmountFromLimits(ethereumShape, 'ETH', 'SEPOLIA_TO_GOLIATH')).toEqual({
      amount: '0',
      formatted: '0',
    });
  });

  it('still reads the older sepolia key names', () => {
    expect(getMinAmountFromLimits(sepoliaShape, 'ETH', 'GOLIATH_TO_SEPOLIA')?.formatted).toBe('0.01');
  });

  it('returns null when the direction or token is absent', () => {
    expect(getMinAmountFromLimits(ethereumShape, 'USDC', 'GOLIATH_TO_SEPOLIA')).toBeNull();
    expect(getMinAmountFromLimits({} as LimitsResponse, 'ETH', 'GOLIATH_TO_SEPOLIA')).toBeNull();
    expect(getMinAmountFromLimits(null, 'ETH', 'GOLIATH_TO_SEPOLIA')).toBeNull();
  });
});
