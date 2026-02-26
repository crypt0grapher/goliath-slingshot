import styled from 'styled-components';
import { formatUnits } from '@ethersproject/units';

// ── Layout ──────────────────────────────────────────────────────────────────

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const YieldHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.bg3};
`;

export const YieldTitle = styled.h2`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0;
`;

export const YieldBody = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 16px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 0.75rem;
  `}
`;

// ── Gate (wallet-not-connected / chain-not-supported) ───────────────────────

export const GateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  gap: 16px;
`;

export const GateText = styled.div`
  font-size: 16px;
  color: ${({ theme }) => theme.text2};
`;

export const GateIcon = styled.div`
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.text2};
`;

// ── Balance display ─────────────────────────────────────────────────────────

export const BalanceContainer = styled.div`
  padding: 20px 16px;
  text-align: center;
`;

export const BalanceLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  margin-bottom: 8px;
`;

export const BalanceValue = styled.div`
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 26px;
  `}
`;

export const BalanceSymbol = styled.span`
  font-size: 18px;
  font-weight: 400;
  color: ${({ theme }) => theme.text2};
  margin-left: 8px;
`;

// ── Tabs ─────────────────────────────────────────────────────────────────────

export const TabContainer = styled.div`
  display: flex;
  flex-direction: row;
  border-radius: 12px;
  background: ${({ theme }) => theme.bg2};
  padding: 4px;
`;

export const Tab = styled.button<{ active: boolean }>`
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  background: ${({ active, theme }) => (active ? theme.bg3 : 'transparent')};
  color: ${({ active, theme }) => (active ? theme.text1 : theme.text2)};

  &:hover {
    background: ${({ active, theme }) => (active ? theme.bg3 : theme.bg2)};
  }
`;

// ── Input ────────────────────────────────────────────────────────────────────

export const InputContainer = styled.div`
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 12px;
  padding: 12px;
`;

export const InputRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

export const MaxButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.primary1};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;

  &:hover {
    opacity: 0.8;
  }
`;

// ── Preview / Stats ──────────────────────────────────────────────────────────

export const PreviewRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text2};
  padding: 4px 0;
`;

export const StatsContainer = styled.div`
  background: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  padding: 16px;
  margin-top: 8px;
`;

export const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
`;

export const StatLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
`;

export const StatValue = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
`;

// ── History ──────────────────────────────────────────────────────────────────

export const HistoryContainer = styled.div`
  max-width: 500px;
  width: 100%;
  margin-top: 16px;
  padding: 0 0.2rem;
`;

export const HistoryItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.bg3};

  &:last-child {
    border-bottom: none;
  }
`;

export const HistoryType = styled.span<{ type: 'stake' | 'unstake' }>`
  font-size: 13px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${({ type, theme }) => (type === 'stake' ? theme.green1 + '20' : theme.text2 + '20')};
  color: ${({ type, theme }) => (type === 'stake' ? theme.green1 : theme.text2)};
`;

export const HistoryAmount = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
`;

export const HistoryTimestamp = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.text2};
`;

export const HistoryLink = styled.a`
  font-size: 13px;
  color: ${({ theme }) => theme.primary1};
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;

  &:hover {
    text-decoration: underline;
  }
`;

// ── Banners ──────────────────────────────────────────────────────────────────

export const ErrorBanner = styled.div`
  padding: 12px;
  background-color: ${({ theme }) => theme.red1 + '20'};
  border-radius: 12px;
  color: ${({ theme }) => theme.red1};
  font-size: 14px;
`;

export const PausedBanner = styled.div`
  padding: 12px;
  background-color: ${({ theme }) => theme.yellow1 + '20'};
  border-radius: 12px;
  color: ${({ theme }) => theme.yellow1};
  font-size: 14px;
  text-align: center;
`;

// ── Utilities ────────────────────────────────────────────────────────────────

export function formatTokenAmount(weiString: string | null, decimals = 1, addCommas = false): string {
  if (!weiString || weiString === '0') return '0';
  try {
    const formatted = formatUnits(weiString, 18);
    const [intPart, decPart] = formatted.split('.');
    const truncatedDec = decPart ? decPart.slice(0, decimals) : '';
    const displayInt = addCommas ? Number(intPart).toLocaleString('en-US') : intPart;
    return truncatedDec ? `${displayInt}.${truncatedDec}` : displayInt;
  } catch {
    return '0';
  }
}
