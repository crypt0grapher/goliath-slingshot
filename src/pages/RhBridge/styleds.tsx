import styled from 'styled-components';

export const Page = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 1rem;
`;

export const Card = styled.section`
  position: relative;
  max-width: 560px;
  width: 100%;
  padding: 1rem;
  border-radius: 1.6rem;
  background: ${({ theme }) => theme.bg1};
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px;
  color: ${({ theme }) => theme.text1};
  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    width: calc(100% - 1rem);
    border-radius: 1.2rem;
  `}
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid ${({ theme }) => theme.bg3};
`;

export const Title = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
`;

export const Small = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.text2};
`;

export const Badge = styled.span<{ tone: 'ok' | 'warn' | 'bad' | 'info' }>`
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  color: #fff;
  background: ${({ tone, theme }) =>
    tone === 'ok' ? theme.green1 : tone === 'warn' ? theme.yellow2 : tone === 'bad' ? theme.red1 : theme.bg5};
`;

export const Tabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: ${({ theme }) => theme.bg2};
  margin-bottom: 0.75rem;
`;

export const Tab = styled.button<{ active: boolean }>`
  border: none;
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  font-weight: 600;
  color: ${({ theme, active }) => (active ? theme.text1 : theme.text2)};
  background: ${({ theme, active }) => (active ? theme.bg1 : 'transparent')};
`;

export const Field = styled.label`
  display: block;
  padding: 0.75rem;
  border-radius: 16px;
  background: ${({ theme }) => theme.bg2};
  margin-bottom: 0.5rem;
  font-size: 13px;
  color: ${({ theme }) => theme.text2};
`;

export const FieldRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
`;

export const Input = styled.input`
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: ${({ theme }) => theme.text1};
  font-size: 18px;
  padding: 6px 0 0;
  font-family: inherit;
  min-width: 0;
`;

export const MonoInput = styled(Input)`
  font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
`;

export const Rows = styled.dl`
  margin: 0.5rem 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 13px;
  dt {
    color: ${({ theme }) => theme.text2};
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
`;

export const Alert = styled.p<{ tone?: 'bad' | 'warn' | 'info' }>`
  margin: 0.5rem 0;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  font-size: 13px;
  background: ${({ theme }) => theme.bg2};
  border-left: 3px solid
    ${({ theme, tone }) => (tone === 'bad' ? theme.red1 : tone === 'warn' ? theme.yellow2 : theme.bg5)};
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
`;

export const Button = styled.button<{ secondary?: boolean }>`
  width: 100%;
  padding: 14px;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.primary1};
  color: ${({ theme, secondary }) => (secondary ? theme.text1 : '#fff')};
  background: ${({ theme, secondary }) => (secondary ? 'transparent' : theme.primary1)};
  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

export const SmallButton = styled.button`
  border: 1px solid ${({ theme }) => theme.bg4};
  background: transparent;
  color: ${({ theme }) => theme.text1};
  border-radius: 8px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
`;

export const Mono = styled.code`
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
`;

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const Item = styled.li`
  padding: 0.75rem;
  border-radius: 16px;
  background: ${({ theme }) => theme.bg2};
  font-size: 13px;
`;

export const LinkA = styled.a`
  color: ${({ theme }) => theme.text1};
  text-decoration: underline;
`;
