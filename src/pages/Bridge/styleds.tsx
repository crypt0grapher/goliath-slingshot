import styled from 'styled-components';

export const Wrapper = styled.div`
  position: relative;
  padding: 1rem;
`;

export const BridgeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.bg3};
`;

export const BridgeTitle = styled.h2`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0;
`;

export const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const NetworkRow = styled.div`
  margin-bottom: 8px;
`;

export const OutputContainer = styled.div`
  padding: 1rem;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 16px;
`;

export const OutputLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  margin-bottom: 8px;
`;

export const OutputAmount = styled.div`
  font-size: 28px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
`;

export const BottomSection = styled.div`
  margin-top: 16px;
`;

export const ErrorMessage = styled.div`
  padding: 12px;
  background-color: ${({ theme }) => theme.red1 + '20'};
  border-radius: 12px;
  color: ${({ theme }) => theme.red1};
  font-size: 14px;
  margin-top: 8px;
`;
