// PROTOTYPE-SETUP (Design update: Peko design language): the values every redesigned ESS and Payroll screen shares.
// Source of truth is the platform's own Peko theme, not the prototype:
//   - src/antd.config.tsx ............ colorPrimary #FF3A3A, colorText #121212, controlHeight 36, control radius 6, Roboto
//   - Peko white-label values ........ hover #FF6963, active #E02B2B, surface #FFF7F6, border #FFE4E4
//   - tailwind.config.js ............. titleText #8B8B8B, iconRed #EA3639, iconBgRed #FFF7F7, borderPrimaryLight #FFE4E4
// antd components get these through PekoScope (one ConfigProvider nested in the global theme); hand-built blocks use
// the class strings below. See docs/design/peko-design-language.md.

export const PEKO_COLOR = {
    primary: '#FF3A3A',
    primaryHover: '#FF6963',
    primaryActive: '#E02B2B',
    primarySurface: '#FFF7F6',
    primaryBorder: '#FFE4E4',
    /** Body text and values. */
    text: '#121212',
    /** Page titles. */
    title: '#404040',
    /** Descriptions, helper text, stat labels. */
    muted: '#8B8B8B',
    /** Secondary body text (tab labels, segmented items, neutral tags). */
    textSecondary: '#595959',
    /** Card border. */
    border: '#EAEAEA',
    /** Row lines, dividers, tab bar bottom border. */
    line: '#F0F0F0',
    /** Table header, row hover, quiet panels. */
    subtle: '#FAFAFA',
    /** Segmented track, neutral tag background. */
    track: '#F5F5F5',
    /** Quick action icon square. */
    iconBg: '#FFF7F7',
    icon: '#EA3639',
    /** Approve button in request rows. */
    approve: '#12B76A',
    approveSoft: '#ECFDF3',
} as const;

export const PEKO_CARD_SHADOW = '0px 1px 12px 1px rgba(122,122,122,0.06)';
export const PEKO_CARD_SHADOW_HOVER = '0px 4px 16px 2px rgba(122,122,122,0.12)';

export const PEKO_RADIUS = { control: 6, card: 8, cell: 6 } as const;

/** Status tag colour pairs (rule 9). One map for every screen in scope. */
export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'leave' | 'neutral';

export const STATUS_TONE: Record<StatusTone, { bg: string; ink: string }> = {
    success: { bg: '#ECFDF3', ink: '#027A48' },
    warning: { bg: '#FFF6EA', ink: '#D48806' },
    error: { bg: '#FFF1F0', ink: '#FF4D4F' },
    info: { bg: '#E6F4FF', ink: '#0958D9' },
    leave: { bg: '#F9F0FB', ink: '#861E99' },
    neutral: { bg: '#F5F5F5', ink: '#595959' },
};

// ---- Tailwind class strings (hand-built blocks) ------------------------------------------------------------

/** Card: white, 1px #EAEAEA, 8px corners, soft shadow, 20–24px padding. */
export const PEKO_CARD = 'rounded-lg border border-solid border-[#EAEAEA] bg-white p-5 sm:p-6 shadow-[0px_1px_12px_1px_rgba(122,122,122,0.06)]';
/** Inner bordered block inside a card. */
export const PEKO_INNER = 'rounded-lg border border-solid border-[#EAEAEA] bg-white p-4';
/** Quiet grey panel. */
export const PEKO_PANEL = 'rounded-lg bg-[#FAFAFA] p-4 sm:p-5';

export const PEKO_PAGE_TITLE = 'text-xl font-medium text-[#404040]';
export const PEKO_PAGE_DESCRIPTION = 'text-sm text-[#8B8B8B]';
export const PEKO_CARD_TITLE = 'text-base font-medium text-[#121212]';
export const PEKO_HELPER = 'text-[13px] text-[#8B8B8B]';
export const PEKO_STAT_LABEL = 'text-[13px] text-[#8B8B8B]';
export const PEKO_STAT_VALUE = 'text-2xl font-medium text-[#121212]';
