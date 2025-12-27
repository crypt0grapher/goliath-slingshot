import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import Settings from '../Settings';
import { RowBetween } from '../Row';
import { TYPE } from '../../theme';

const StyledSwapHeader = styled.div`
  padding: 12px 1rem 0px 1.5rem;
  margin-bottom: 0.4rem;
  width: 100%;
  color: ${({ theme }) => theme.text2};
`;

export default function SwapHeader() {
  const { t } = useTranslation();
  return (
    <StyledSwapHeader>
      <RowBetween>
        <TYPE.black fontWeight={500}>{t('swap')}</TYPE.black>
        <Settings />
      </RowBetween>
    </StyledSwapHeader>
  );
}
