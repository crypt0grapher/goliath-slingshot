import React, { useCallback } from 'react';
import styled from 'styled-components';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Lock } from 'react-feather';
import { selectStakeToggle, selectIsToggleLocked } from '../../state/migration/selectors';
import { migrationActions } from '../../state/migration/slice';

// ---------------------------------------------------------------------------
// Toggle Switch (custom slider-style for on/off with disabled support)
// ---------------------------------------------------------------------------

const SwitchTrack = styled.div<{ isOn: boolean; disabled: boolean }>`
  position: relative;
  width: 48px;
  height: 26px;
  border-radius: 13px;
  background-color: ${({ isOn, disabled, theme }) =>
    disabled ? theme.bg3 : isOn ? theme.primary1 : theme.text4};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
`;

const SwitchThumb = styled.div<{ isOn: boolean }>`
  position: absolute;
  top: 3px;
  left: ${({ isOn }) => (isOn ? '24px' : '3px')};
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.white};
  transition: left 0.2s ease;
`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg3};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 12px;
  `}
`;

const LabelSection = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-right: 12px;
`;

const Label = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  line-height: 1.3;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
  `}
`;

const Description = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.text3};
  margin-top: 2px;
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
  `}
`;

const ControlSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const LockedIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.text3};
  white-space: nowrap;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StakeOnGoliathToggle() {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const stakeOnGoliath = useSelector(selectStakeToggle);
  const isToggleLocked = useSelector(selectIsToggleLocked);

  const handleToggle = useCallback(() => {
    if (!isToggleLocked) {
      dispatch(migrationActions.toggleStakePreference());
    }
  }, [dispatch, isToggleLocked]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isToggleLocked) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dispatch(migrationActions.toggleStakePreference());
      }
    },
    [dispatch, isToggleLocked]
  );

  return (
    <Container>
      <LabelSection>
        <Label id="stake-toggle-label">{t('migration.toggle.stakeOnGoliath')}</Label>
        <Description id="stake-toggle-description">
          {t('migration.toggle.autoStakeDescription')}
        </Description>
      </LabelSection>
      <ControlSection>
        {isToggleLocked && (
          <LockedIndicator aria-hidden="true">
            <Lock size={12} />
            {t('migration.toggle.lockedHint')}
          </LockedIndicator>
        )}
        <SwitchTrack
          role="switch"
          aria-checked={stakeOnGoliath}
          aria-labelledby="stake-toggle-label"
          aria-describedby="stake-toggle-description"
          aria-disabled={isToggleLocked}
          tabIndex={0}
          isOn={stakeOnGoliath}
          disabled={isToggleLocked}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
        >
          <SwitchThumb isOn={stakeOnGoliath} />
        </SwitchTrack>
      </ControlSection>
    </Container>
  );
}
