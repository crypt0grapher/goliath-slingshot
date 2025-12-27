# Technical Implementation Document (TID)
# Arabic Language Localization with RTL Support

**Document Version:** 1.0
**Date:** 2025-12-27
**Project:** CoolSwap-interface (Goliath Slingshot)
**Scope:** Arabic (ar) localization with Right-to-Left (RTL) interface support

---

## 1. Executive Technical Summary

### 1.1 Overview
This document outlines the technical implementation requirements for adding Arabic language support to the CoolSwap-interface React application. This involves two major workstreams:
1. **Localization (L10N):** Creating Arabic translation files with 269 translation keys
2. **Right-to-Left (RTL) Support:** Implementing bidirectional (BiDi) layout support for Arabic and other RTL languages

### 1.2 Key Technical Decisions
- **i18n Library:** Existing i18next implementation (v20.3.1) with react-i18next (v10.13.2)
- **Styling Approach:** styled-components v5.3.0 with RTL-aware CSS logical properties
- **RTL Detection:** Language-based direction detection via i18next
- **Font Strategy:** Include Arabic-supporting font alongside existing Inter font

### 1.3 Technology Stack Context
| Component | Technology | Version | RTL Considerations |
|-----------|------------|---------|-------------------|
| Frontend | React | 17.0.2 | Native RTL support via `dir` attribute |
| Styling | styled-components | 5.3.0 | Requires stylis-plugin-rtl or CSS logical properties |
| i18n | i18next | 20.3.1 | Built-in language direction detection |
| UI Library | rebass | 4.0.7 | Requires RTL prop handling |
| Popover | @popperjs/core | 2.9.2 | Built-in RTL support via placement |
| Modal | @reach/dialog | 0.15.0 | Requires RTL styling adjustments |

### 1.4 Risk Assessment
| Risk | Severity | Mitigation |
|------|----------|------------|
| Hebrew (iw) locale exists without RTL support | Medium | Implement RTL support will benefit both languages |
| Hardcoded directional CSS throughout codebase | High | Systematic audit and conversion to logical properties |
| styled-components lacks native RTL | Medium | Use stylis-plugin-rtl or manual CSS logical properties |
| Arabic font rendering issues | Low | Use Noto Sans Arabic or similar proven Arabic font |

---

## 2. Current i18n Implementation Analysis

### 2.1 i18n Configuration
**File:** `/Users/alex/goliath/CoolSwap-interface/src/i18n.ts`

**Current Configuration:**
```typescript
i18next
  .use(XHR)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: `./locales/{{lng}}.json`,
    },
    react: {
      useSuspense: true,
    },
    lng: languageOverride,
    fallbackLng: 'en',
    preload: ['en'],
    keySeparator: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lang',
    },
  });
```

**Key Observations:**
- Uses XHR backend to load translations from `/public/locales/`
- Language detection via querystring, navigator, and htmlTag
- No existing RTL direction handling
- No language-to-direction mapping

### 2.2 Existing Locale Files
**Location:** `/Users/alex/goliath/CoolSwap-interface/public/locales/`

| File | Language | Script Direction | Translation Keys |
|------|----------|------------------|------------------|
| en.json | English | LTR | 269 |
| de.json | German | LTR | 269 |
| es.json | Spanish | LTR | 269 |
| fr.json | French | LTR | 269 |
| ja.json | Japanese | LTR | 269 |
| ko.json | Korean | LTR | 269 |
| zh-CN.json | Chinese (Simplified) | LTR | 269 |
| zh-TW.json | Chinese (Traditional) | LTR | 269 |
| tr.json | Turkish | LTR | 269 |
| id.json | Indonesian | LTR | 269 |
| it-IT.json | Italian | LTR | 269 |
| ru.json | Russian | LTR | 269 |
| vi.json | Vietnamese | LTR | 269 |
| es-AR.json | Spanish (Argentina) | LTR | 269 |
| es-US.json | Spanish (US) | LTR | 269 |
| ro.json | Romanian | LTR | 269 |
| nl.json | Dutch | LTR | 269 |
| **iw.json** | **Hebrew** | **RTL** | 269 |

**Critical Finding:** Hebrew (iw.json) is already present but NO RTL support exists in the application. This implementation will benefit both Hebrew and Arabic.

### 2.3 Translation File Structure
Translation files use flat key-value JSON format with interpolation placeholders:

```json
{
  "noWallet": "No Ethereum wallet found",
  "balance": "Balance: {{ balanceInput }}",
  "supplying": "Supplying {{amountA}} {{symbolA}} and {{amountB}} {{symbolB}}"
}
```

---

## 3. Styling Architecture Analysis

### 3.1 Styling Stack
The application uses:
- **styled-components** (v5.3.0) for component styling
- **polished** (v4.1.3) for CSS utility functions
- **rebass** (v4.0.7) for base UI components
- **Inter font** (v3.19.1) via inter-ui package

### 3.2 Theme System
**File:** `/Users/alex/goliath/CoolSwap-interface/src/theme/index.tsx`

The theme provides:
- Color definitions (light/dark mode)
- Media query templates
- CSS snippet helpers (`flexColumnNoWrap`, `flexRowNoWrap`)
- Global styles via `createGlobalStyle`

**Current Global Styles:**
```css
html, input, textarea, button {
  font-family: 'Inter', sans-serif;
  font-display: fallback;
}
```

### 3.3 Theme Type Definitions
**File:** `/Users/alex/goliath/CoolSwap-interface/src/theme/styled.d.ts`

The DefaultTheme interface needs extension for RTL support:
- Add `direction: 'ltr' | 'rtl'` property
- Add `isRTL: boolean` helper property

---

## 4. RTL-Affected Components Audit

### 4.1 Files with Directional CSS Properties (47 files)

The following files contain directional CSS properties that require RTL adaptation:

#### Critical Priority (Core UI Components)
| File Path | Properties Found | Impact |
|-----------|------------------|--------|
| `/src/components/Header/index.tsx` | margin-right, margin-left, padding-left, padding-right, text-align, flex-direction | Header layout, navigation |
| `/src/components/CurrencyInputPanel/index.tsx` | margin-left, margin-right, padding-left, padding-right | Token input fields |
| `/src/components/Settings/index.tsx` | margin-left, text-align, right | Settings dropdown |
| `/src/components/Popups/index.tsx` | right, padding-left | Notification positioning |
| `/src/components/Modal/index.tsx` | border-radius corners | Modal appearance |
| `/src/theme/components.tsx` | margin-left, margin-right | Shared icons and links |
| `/src/components/swap/styleds.tsx` | margin-left, text-align, float | Swap UI elements |
| `/src/components/Button/index.tsx` | padding | Button layout |
| `/src/components/Row/index.tsx` | justify-content: flex-start | Row alignment |

#### High Priority (Core Features)
| File Path | Properties Found | Impact |
|-----------|------------------|--------|
| `/src/components/TransactionSettings/index.tsx` | margin-right, text-align | Settings panel |
| `/src/components/Web3Status/index.tsx` | margin-left | Wallet status |
| `/src/components/AccountDetails/index.tsx` | margin-left, padding-left, padding-right | Account modal |
| `/src/components/SearchModal/*.tsx` | margin-left, margin-right, padding-left | Token search |
| `/src/pages/Swap/index.tsx` | padding, flex layout | Main swap page |
| `/src/pages/Pool/index.tsx` | padding, layout | Pool page |
| `/src/pages/Bridge/*.tsx` | Various directional | Bridge feature |

#### Medium Priority (Secondary Features)
| File Path | Properties Found | Impact |
|-----------|------------------|--------|
| `/src/components/bridge/*.tsx` | Various directional | Bridge components |
| `/src/components/NavigationTabs/index.tsx` | Arrow icon orientation | Back navigation |
| `/src/components/Popover/index.tsx` | Arrow positioning | Tooltip arrows |
| `/src/components/Toggle/index.tsx` | border-radius | Toggle switch |
| `/src/components/ProgressSteps/index.tsx` | border-radius | Step indicators |
| `/src/components/WalletModal/*.tsx` | margin-left, padding | Wallet selection |

### 4.2 Directional Icon Analysis

**Files using directional icons (19 files):**

| Component | Icon | RTL Behavior Required |
|-----------|------|----------------------|
| NavigationTabs | ArrowLeft | Mirror to ArrowRight |
| SwapModalHeader | ArrowDown | No change needed |
| SwapRoute | ChevronRight | Mirror to ChevronLeft |
| ImportToken | ArrowLeft | Mirror to ArrowRight |
| ImportList | ArrowLeft | Mirror to ArrowRight |
| DirectionSwapButton | Various | Context-dependent |
| BridgeHistoryPanel | ChevronDown/Up | No change needed |
| NetworkSelector | ChevronDown | No change needed |
| BridgeTokenSelector | ChevronDown | No change needed |
| Button | ChevronDown | No change needed |
| PositionCard | ChevronDown/Up | No change needed |

### 4.3 Flexbox Direction Analysis (57 files)

Files using flex-direction that may need RTL reversal:
- Row-based layouts: Need `flex-direction: row` to become `row-reverse` in RTL
- Column-based layouts: Typically no change needed

**Key flex patterns identified:**
```css
/* Current pattern - needs RTL consideration */
flex-direction: row;
justify-content: flex-start;
justify-content: flex-end;
```

---

## 5. Implementation Scope

### 5.1 Files to Modify

#### A. i18n Configuration (2 files)
| File | Changes Required |
|------|------------------|
| `/src/i18n.ts` | Add RTL language list, direction detection |
| `/public/index.html` | Add `dir` attribute handling |

#### B. Theme System (3 files)
| File | Changes Required |
|------|------------------|
| `/src/theme/index.tsx` | Add RTL context provider, direction-aware global styles |
| `/src/theme/styled.d.ts` | Extend DefaultTheme with direction properties |
| `/src/theme/components.tsx` | Convert directional properties to logical |

#### C. Core Layout Components (8 files)
| File | Changes Required |
|------|------------------|
| `/src/pages/App.tsx` | Add RTL direction wrapper |
| `/src/index.tsx` | Integrate RTL provider |
| `/src/components/Header/index.tsx` | Convert to logical properties |
| `/src/components/Row/index.tsx` | RTL-aware flex alignment |
| `/src/components/Column/index.tsx` | RTL-aware spacing |
| `/src/components/Modal/index.tsx` | RTL border-radius |
| `/src/components/Popups/index.tsx` | RTL positioning |
| `/src/components/Popover/index.tsx` | RTL arrow placement |

#### D. Feature Components (25+ files)
All files listed in Section 4.1 require conversion of directional CSS to logical properties.

#### E. Icon Components (5 files)
| File | Changes Required |
|------|------------------|
| `/src/components/NavigationTabs/index.tsx` | Conditional arrow mirroring |
| `/src/components/swap/SwapRoute.tsx` | Conditional chevron mirroring |
| `/src/components/SearchModal/ImportToken.tsx` | Conditional arrow mirroring |
| `/src/components/SearchModal/ImportList.tsx` | Conditional arrow mirroring |
| `/src/components/SearchModal/Manage.tsx` | Conditional arrow mirroring |

### 5.2 Files to Create

| File | Purpose |
|------|---------|
| `/public/locales/ar.json` | Arabic translation file (269 keys) |
| `/src/hooks/useDirection.ts` | Custom hook for RTL detection |
| `/src/contexts/DirectionContext.tsx` | Direction context provider |
| `/src/utils/rtl.ts` | RTL utility functions |

### 5.3 Dependencies to Add

| Package | Version | Purpose |
|---------|---------|---------|
| stylis-plugin-rtl | ^2.1.1 | Automatic CSS RTL transformation for styled-components |
| @fontsource/noto-sans-arabic | latest | Arabic font support |

---

## 6. Detailed Implementation Specifications

### 6.1 RTL Language Configuration

**Create:** `/src/utils/rtl.ts`
```typescript
export const RTL_LANGUAGES = ['ar', 'he', 'iw', 'fa', 'ur'] as const;

export function isRTLLanguage(lang: string): boolean {
  const baseLang = lang.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.includes(baseLang as any);
}

export function getDirection(lang: string): 'ltr' | 'rtl' {
  return isRTLLanguage(lang) ? 'rtl' : 'ltr';
}
```

### 6.2 Direction Context Provider

**Create:** `/src/contexts/DirectionContext.tsx`
```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDirection, isRTLLanguage } from '../utils/rtl';

interface DirectionContextType {
  direction: 'ltr' | 'rtl';
  isRTL: boolean;
}

const DirectionContext = createContext<DirectionContextType>({
  direction: 'ltr',
  isRTL: false,
});

export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');

  useEffect(() => {
    const newDirection = getDirection(i18n.language);
    setDirection(newDirection);
    document.documentElement.setAttribute('dir', newDirection);
    document.documentElement.setAttribute('lang', i18n.language);
  }, [i18n.language]);

  return (
    <DirectionContext.Provider value={{ direction, isRTL: direction === 'rtl' }}>
      {children}
    </DirectionContext.Provider>
  );
}

export function useDirection() {
  return useContext(DirectionContext);
}
```

### 6.3 Theme Extension

**Modify:** `/src/theme/styled.d.ts` (additions)
```typescript
declare module 'styled-components' {
  export interface DefaultTheme extends Colors {
    // ... existing properties ...

    // RTL Support
    direction: 'ltr' | 'rtl';
    isRTL: boolean;
  }
}
```

### 6.4 CSS Logical Properties Migration

Convert physical properties to logical equivalents:

| Physical Property | Logical Property |
|-------------------|------------------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |
| `left` | `inset-inline-start` |
| `right` | `inset-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `border-radius: 8px 0 0 8px` | `border-start-start-radius: 8px; border-end-start-radius: 8px` |

**Example Conversion:**
```typescript
// Before
const StyledMenuButton = styled.button`
  margin-left: 8px;
  padding: 0.15rem 0.5rem;
`;

// After
const StyledMenuButton = styled.button`
  margin-inline-start: 8px;
  padding: 0.15rem 0.5rem;
`;
```

### 6.5 Conditional Icon Rendering

**Pattern for directional icons:**
```typescript
import { ArrowLeft, ArrowRight } from 'react-feather';
import { useDirection } from '../../contexts/DirectionContext';

function BackButton() {
  const { isRTL } = useDirection();
  const ArrowIcon = isRTL ? ArrowRight : ArrowLeft;

  return <ArrowIcon />;
}
```

### 6.6 Global Style Modifications

**Modify:** `/src/theme/index.tsx`
```typescript
export const ThemedGlobalStyle = createGlobalStyle<{ direction?: 'ltr' | 'rtl' }>`
  html {
    direction: ${({ direction }) => direction || 'ltr'};
    color: ${({ theme }) => theme.text1};
    background-color: ${({ theme }) => theme.bg2};
  }

  /* Arabic font stack */
  html[lang="ar"],
  html[lang="ar"] input,
  html[lang="ar"] textarea,
  html[lang="ar"] button {
    font-family: 'Noto Sans Arabic', 'Inter', sans-serif;
  }
`;
```

### 6.7 Popover/Tooltip RTL Handling

**Modify:** `/src/components/Popover/index.tsx`

The Popper.js library handles RTL automatically, but arrow positioning CSS needs updating:

```typescript
// Convert arrow positioning to logical properties
const Arrow = styled.div`
  &.arrow-left {
    inset-inline-end: -5px;
  }

  &.arrow-right {
    inset-inline-start: -5px;
  }
`;
```

---

## 7. Arabic Translation File Specification

### 7.1 File Details
- **Path:** `/public/locales/ar.json`
- **Encoding:** UTF-8
- **Keys:** 269 (matching en.json)
- **Script:** Arabic (RTL)

### 7.2 Translation Guidelines
1. **Interpolation:** Maintain `{{ variable }}` placeholders exactly
2. **Technical Terms:** Keep blockchain/crypto terms in English or use established Arabic equivalents
3. **Numbers:** Use Eastern Arabic numerals (if culturally appropriate) or Western Arabic numerals
4. **Punctuation:** Use Arabic punctuation marks where appropriate

### 7.3 Sample Translations
```json
{
  "noWallet": "لم يتم العثور على محفظة Ethereum",
  "wrongNetwork": "أنت متصل بالشبكة الخاطئة",
  "switchNetwork": "يرجى التبديل إلى {{ correctNetwork }}",
  "swap": "مبادلة",
  "pool": "تجمع السيولة",
  "bridge": "جسر",
  "connectWallet": "ربط المحفظة",
  "balance": "الرصيد: {{ balanceInput }}",
  "selectToken": "اختر عملة",
  "approve": "موافقة",
  "pending": "قيد الانتظار",
  "loading": "جاري التحميل"
}
```

---

## 8. Font Considerations

### 8.1 Arabic Font Requirements
- Must support full Arabic Unicode range (U+0600-U+06FF)
- Should support Arabic-Indic digits
- Must support kashida (tatweel) for text justification
- Should have similar x-height to Inter for visual consistency

### 8.2 Recommended Font: Noto Sans Arabic
- Designed by Google for universal language support
- Free and open source
- Excellent rendering at all sizes
- Available via @fontsource package

### 8.3 Font Loading Strategy
```typescript
// Add to package.json dependencies
"@fontsource/noto-sans-arabic": "latest"

// Import in src/index.tsx
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
```

---

## 9. Testing Strategy

### 9.1 RTL Visual Testing
- [ ] All text displays correctly right-to-left
- [ ] Navigation arrows point in correct direction
- [ ] Form inputs accept RTL text properly
- [ ] Modals and popups appear in correct positions
- [ ] Scroll behavior works correctly
- [ ] Number inputs work correctly (numbers should remain LTR)

### 9.2 Component-Level Testing
- [ ] Header layout mirrors correctly
- [ ] Swap interface functions properly
- [ ] Pool pages display correctly
- [ ] Bridge interface works in RTL
- [ ] Settings panel positions correctly
- [ ] Token search modal functions properly
- [ ] Wallet connection modal displays correctly

### 9.3 Browser Testing Matrix
| Browser | Versions | Priority |
|---------|----------|----------|
| Chrome | Latest 2 | High |
| Firefox | Latest 2 | High |
| Safari | Latest 2 | High |
| Edge | Latest 2 | Medium |
| Mobile Chrome | Latest | High |
| Mobile Safari | Latest | High |

### 9.4 Test URLs
- `?lang=ar` - Arabic RTL mode
- `?lang=iw` - Hebrew RTL mode (should also work after implementation)
- `?lang=en` - English LTR mode (regression test)

---

## 10. Implementation Phases

### Phase 1: Foundation (Estimated: 2-3 days)
**Objective:** Establish RTL infrastructure

| Task | Files | Acceptance Criteria |
|------|-------|---------------------|
| Create RTL utility functions | `/src/utils/rtl.ts` | Functions exported and tested |
| Create Direction context | `/src/contexts/DirectionContext.tsx` | Context provides direction state |
| Extend theme types | `/src/theme/styled.d.ts` | TypeScript compiles without errors |
| Update global styles | `/src/theme/index.tsx` | Direction attribute applied to html |
| Integrate DirectionProvider | `/src/index.tsx` | App wrapped with provider |

### Phase 2: Core Layout Conversion (Estimated: 3-4 days)
**Objective:** Convert core layout components to RTL-aware styling

| Task | Files | Acceptance Criteria |
|------|-------|---------------------|
| Convert Header component | `/src/components/Header/index.tsx` | Header mirrors in RTL |
| Convert Row/Column components | `/src/components/Row/index.tsx`, `/src/components/Column/index.tsx` | Layouts flip correctly |
| Convert Modal component | `/src/components/Modal/index.tsx` | Modal displays correctly in RTL |
| Convert Popups component | `/src/components/Popups/index.tsx` | Popups position correctly |
| Convert theme/components | `/src/theme/components.tsx` | Shared components RTL-aware |

### Phase 3: Feature Component Conversion (Estimated: 4-5 days)
**Objective:** Convert all feature components

| Task | Files | Acceptance Criteria |
|------|-------|---------------------|
| Convert Swap components | `/src/components/swap/*.tsx`, `/src/pages/Swap/*.tsx` | Swap interface works in RTL |
| Convert Pool components | `/src/pages/Pool/*.tsx`, `/src/components/PositionCard/*.tsx` | Pool interface works in RTL |
| Convert Bridge components | `/src/pages/Bridge/*.tsx`, `/src/components/bridge/*.tsx` | Bridge interface works in RTL |
| Convert Search Modal | `/src/components/SearchModal/*.tsx` | Token search works in RTL |
| Convert Settings components | `/src/components/Settings/*.tsx`, `/src/components/TransactionSettings/*.tsx` | Settings work in RTL |
| Convert Wallet Modal | `/src/components/WalletModal/*.tsx`, `/src/components/AccountDetails/*.tsx` | Wallet UI works in RTL |

### Phase 4: Icon Mirroring (Estimated: 1 day)
**Objective:** Implement directional icon handling

| Task | Files | Acceptance Criteria |
|------|-------|---------------------|
| Create useDirection hook | `/src/hooks/useDirection.ts` | Hook returns direction state |
| Update navigation icons | `/src/components/NavigationTabs/index.tsx` | Back arrows point correctly |
| Update swap route icons | `/src/components/swap/SwapRoute.tsx` | Route arrows display correctly |
| Update import icons | `/src/components/SearchModal/Import*.tsx` | Import arrows display correctly |

### Phase 5: Arabic Translation (Estimated: 2-3 days)
**Objective:** Create complete Arabic translation file

| Task | Files | Acceptance Criteria |
|------|-------|---------------------|
| Create Arabic translation file | `/public/locales/ar.json` | All 269 keys translated |
| Validate interpolation placeholders | `/public/locales/ar.json` | All placeholders preserved |
| Add Arabic font | `package.json`, `/src/index.tsx` | Font loads for Arabic |

### Phase 6: Testing & Polish (Estimated: 2-3 days)
**Objective:** Comprehensive testing and bug fixes

| Task | Acceptance Criteria |
|------|---------------------|
| RTL visual testing | All visual tests pass |
| Cross-browser testing | Works in all target browsers |
| Hebrew language testing | Hebrew also works with RTL |
| Performance testing | No performance regression |
| Accessibility testing | WCAG compliance maintained |

---

## 11. Technical Acceptance Criteria

### 11.1 RTL Infrastructure
- [ ] `dir="rtl"` attribute is set on `<html>` when Arabic is selected
- [ ] `lang="ar"` attribute is set on `<html>` when Arabic is selected
- [ ] Direction change occurs without page reload
- [ ] Direction persists across navigation

### 11.2 Layout Mirroring
- [ ] All horizontal layouts mirror correctly (header, navigation, content)
- [ ] Scroll position resets appropriately on direction change
- [ ] Fixed/absolute positioned elements position correctly
- [ ] Flexbox layouts with directional alignment flip correctly

### 11.3 Text Rendering
- [ ] Arabic text renders correctly with proper ligatures
- [ ] Mixed Arabic/English text displays with correct BiDi ordering
- [ ] Numbers display correctly (LTR within RTL context)
- [ ] Text input accepts Arabic characters and cursor moves correctly

### 11.4 Interactive Elements
- [ ] Buttons and clickable areas are positioned correctly
- [ ] Dropdown menus open in correct direction
- [ ] Sliders work correctly (if any)
- [ ] Form validation messages appear in correct positions

### 11.5 Translation Completeness
- [ ] All 269 translation keys have Arabic values
- [ ] No English text visible when Arabic is selected (except technical terms)
- [ ] Interpolation variables render correctly with Arabic text

---

## 12. Appendix

### A. Complete File Change List

#### Files to Modify (47+)
```
src/i18n.ts
src/index.tsx
src/theme/index.tsx
src/theme/styled.d.ts
src/theme/components.tsx
src/pages/App.tsx
src/components/Header/index.tsx
src/components/Row/index.tsx
src/components/Column/index.tsx
src/components/Modal/index.tsx
src/components/Popups/index.tsx
src/components/Popover/index.tsx
src/components/Button/index.tsx
src/components/Card/index.tsx
src/components/CurrencyInputPanel/index.tsx
src/components/CurrencyLogo/index.tsx
src/components/Settings/index.tsx
src/components/TransactionSettings/index.tsx
src/components/Web3Status/index.tsx
src/components/AccountDetails/index.tsx
src/components/AccountDetails/Copy.tsx
src/components/AccountDetails/Transaction.tsx
src/components/NavigationTabs/index.tsx
src/components/SearchModal/styleds.tsx
src/components/SearchModal/CurrencySearch.tsx
src/components/SearchModal/CurrencyList.tsx
src/components/SearchModal/ManageLists.tsx
src/components/SearchModal/ManageTokens.tsx
src/components/SearchModal/ImportRow.tsx
src/components/SearchModal/ImportToken.tsx
src/components/SearchModal/ImportList.tsx
src/components/SearchModal/Manage.tsx
src/components/SearchModal/SortButton.tsx
src/components/WalletModal/index.tsx
src/components/WalletModal/Option.tsx
src/components/WalletModal/PendingView.tsx
src/components/swap/styleds.tsx
src/components/swap/SwapHeader.tsx
src/components/swap/SwapModalHeader.tsx
src/components/swap/SwapRoute.tsx
src/components/swap/AdvancedSwapDetailsDropdown.tsx
src/components/bridge/BridgeAmountInput.tsx
src/components/bridge/BridgeTokenSelector.tsx
src/components/bridge/NetworkSelector.tsx
src/components/bridge/BridgeSummary.tsx
src/components/bridge/BridgeStatusStepper.tsx
src/components/bridge/BridgeHistoryPanel.tsx
src/components/bridge/BridgeHistoryItem.tsx
src/pages/Swap/index.tsx
src/pages/Pool/index.tsx
src/pages/Pool/styleds.tsx
src/pages/Bridge/index.tsx
src/pages/Bridge/styleds.tsx
src/pages/Bridge/BridgeForm.tsx
src/pages/Bridge/BridgeConfirmModal.tsx
src/pages/Bridge/BridgeStatusModal.tsx
src/pages/AppBody.tsx
public/index.html
```

#### Files to Create (4)
```
public/locales/ar.json
src/utils/rtl.ts
src/contexts/DirectionContext.tsx
src/hooks/useDirection.ts
```

### B. CSS Logical Properties Quick Reference

| Physical | Logical | Notes |
|----------|---------|-------|
| width | inline-size | For horizontal dimension |
| height | block-size | For vertical dimension |
| margin-left | margin-inline-start | Start of inline axis |
| margin-right | margin-inline-end | End of inline axis |
| margin-top | margin-block-start | Start of block axis |
| margin-bottom | margin-block-end | End of block axis |
| padding-left | padding-inline-start | - |
| padding-right | padding-inline-end | - |
| padding-top | padding-block-start | - |
| padding-bottom | padding-block-end | - |
| left | inset-inline-start | - |
| right | inset-inline-end | - |
| top | inset-block-start | - |
| bottom | inset-block-end | - |
| text-align: left | text-align: start | - |
| text-align: right | text-align: end | - |
| float: left | float: inline-start | - |
| float: right | float: inline-end | - |
| border-left | border-inline-start | - |
| border-right | border-inline-end | - |
| border-top-left-radius | border-start-start-radius | - |
| border-top-right-radius | border-start-end-radius | - |
| border-bottom-left-radius | border-end-start-radius | - |
| border-bottom-right-radius | border-end-end-radius | - |

### C. Browser Support for CSS Logical Properties

| Property Type | Chrome | Firefox | Safari | Edge |
|--------------|--------|---------|--------|------|
| margin-inline-* | 87+ | 41+ | 14.1+ | 87+ |
| padding-inline-* | 87+ | 41+ | 14.1+ | 87+ |
| inset-inline-* | 87+ | 63+ | 14.1+ | 87+ |
| border-inline-* | 87+ | 41+ | 14.1+ | 87+ |
| border-*-*-radius | 89+ | 66+ | 15+ | 89+ |
| text-align: start/end | 1+ | 1+ | 1+ | 12+ |

**Note:** All target browsers support CSS logical properties. No fallbacks required.

---

## 13. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | | | |
| Frontend Lead | | | |
| Localization Lead | | | |
| QA Lead | | | |

---

**Document End**
