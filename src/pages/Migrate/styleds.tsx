import styled, { keyframes } from 'styled-components';

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

// ---------------------------------------------------------------------------
// Page Layout
// ---------------------------------------------------------------------------

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const MigrateHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.bg3};
`;

export const MigrateTitle = styled.h2`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0;
`;

// ---------------------------------------------------------------------------
// Card Body
// ---------------------------------------------------------------------------

export const MigrateBody = styled.div`
  position: relative;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 16px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 0.75rem;
    gap: 12px;
  `}
`;

// ---------------------------------------------------------------------------
// Gate Screens (Connect Wallet / Switch Network)
// ---------------------------------------------------------------------------

export const GateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 20px;
  text-align: center;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 24px 16px;
    gap: 12px;
  `}
`;

export const GateText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.text2};
  margin: 0;
  line-height: 1.5;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
  `}
`;

export const GateIcon = styled.div`
  color: ${({ theme }) => theme.text3};
  margin-bottom: 4px;
`;

// ---------------------------------------------------------------------------
// Skeleton Placeholders
// ---------------------------------------------------------------------------

export const SkeletonBlock = styled.div<{ height?: string }>`
  width: 100%;
  height: ${({ height }) => height ?? '120px'};
  border-radius: 16px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.bg3} 25%,
    ${({ theme }) => theme.bg2} 50%,
    ${({ theme }) => theme.bg3} 75%
  );
  background-size: 400px 100%;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

// ---------------------------------------------------------------------------
// Content Sections
// ---------------------------------------------------------------------------

export const ContentSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    gap: 12px;
  `}
`;

// ---------------------------------------------------------------------------
// Error Banner
// ---------------------------------------------------------------------------

export const ErrorBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.red1 + '20'};
  color: ${({ theme }) => theme.red1};
  font-size: 14px;
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 12px;
    font-size: 13px;
  `}
`;

// ---------------------------------------------------------------------------
// Phase-2 Slot (empty placeholder for future stats/history)
// ---------------------------------------------------------------------------

export const Phase2Slot = styled.div`
  /* Reserved for phase-2 features (stats banner, history panel).
     Renders nothing when feature flags are off. */
`;
