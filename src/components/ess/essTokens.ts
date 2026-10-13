// PROTOTYPE-SETUP (ESS design, Slice 1): the ESS design language in one place. Values come from the existing ESS
// dashboard (src/domains/employee/components/dashboard/*) and the Payroll dashboard
// (src/domains/dashboard/Payroll/pages/Dash.tsx + components/Dashboard/*). See docs/design/ess-design-language.md.
// antd components get these through EssThemeProvider (ConfigProvider on the ESS layout); hand-built blocks use the
// Tailwind class strings below so every ESS page shares one card, heading and label style.

export const ESS_COLOR = {
    /** Peko red (buttons, links, active tab) — ProfileCard Check In, AnnouncementsPanel "See all". */
    red: '#FF4F4F',
    redSoft: '#FFECEC',
    /** Text: primary / secondary / tertiary — ProfileCard values, role line, labels. */
    text: '#080808',
    textSecondary: '#616161',
    textTertiary: '#9e9e9e',
    /** Borders: inner blocks (ProfileCard) and tables (AttendanceTable). */
    border: '#e6e6e6',
    borderSoft: '#eff1f4',
    /** Quick-access tile background — ServiceShortcutCard / Payroll NavigationCards. */
    tile: '#F9F6F5',
    /** Panel background — AnnouncementsPanel. */
    panel: '#f8f8f8',
    /** Status blocks — ProfileCard. */
    statusIdle: '#F7F7F7',
    statusOnTime: '#eaf9f0',
    statusOnTimeInk: '#43B75D',
    statusLate: '#FFFAEB',
    statusLateInk: '#B78912',
    statusDone: '#f5f6f7',
    blueSoft: '#EEF3FF',
    blueInk: '#1D3F9E',
} as const;

export const ESS_RADIUS = { card: 32, inner: 26, tile: 24, block: 16, control: 8, table: 18 } as const;

export const ESS_SHADOW = '0 1.66px 8.28px rgba(0,0,0,0.06)';

/** Spacing scale (px): gaps between cards, card padding, inner padding. */
export const ESS_SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// ---- Tailwind class strings (hand-built blocks) ------------------------------------------------------------

/** Outer card — ProfileCard: white, 32px radius, soft shadow. */
export const ESS_CARD = 'rounded-[32px] bg-white p-6 shadow-[0_1.66px_8.28px_rgba(0,0,0,0.06)]';
/** Inner bordered block — ProfileCard's profile block. */
export const ESS_INNER = 'rounded-[26px] border border-solid border-[#e6e6e6] p-5';
/** Grey panel — AnnouncementsPanel. */
export const ESS_PANEL = 'rounded-[32px] bg-[#f8f8f8] p-6';
/** White item inside a grey panel — AnnouncementsPanel item. */
export const ESS_PANEL_ITEM = 'rounded-2xl bg-white px-5 py-3';

/** Type scale. */
export const ESS_PAGE_TITLE = 'text-xl font-medium text-[#080808]'; // Payroll "HR Dashboard"
export const ESS_PAGE_SUBTITLE = 'text-sm text-[#616161]';
export const ESS_SECTION_TITLE = 'text-[18px] font-medium text-[#171717]'; // AnnouncementsPanel heading
export const ESS_SECTION_LINK = 'text-sm font-medium text-[#FF4F4F] hover:underline'; // "See all"
export const ESS_CARD_TITLE = 'text-base font-semibold text-[#141414]';
export const ESS_LABEL = 'text-[12px] text-[#9e9e9e]'; // ProfileCard "Employee ID"
export const ESS_VALUE = 'text-base font-medium text-[#080808]'; // ProfileCard values
export const ESS_BODY = 'text-sm text-[#080808]';
export const ESS_MUTED = 'text-sm text-[#616161]';
export const ESS_CAPTION = 'text-xs text-[#9e9e9e]';
/** Small grey caps group label (notifications groups). */
export const ESS_GROUP_LABEL = 'text-[11px] font-medium uppercase tracking-wide text-[#9e9e9e]';

/** Primary action button (ProfileCard Check In): full width, 44px, rounded, medium. */
export const ESS_BUTTON = 'h-11 rounded-lg font-medium';
