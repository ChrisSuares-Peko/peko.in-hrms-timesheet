// PROTOTYPE-SETUP (Design update: Peko design language; Leave settings rework: Peko One): the values every redesigned
// ESS and Payroll screen shares, from the Peko One design system (Figma "Peko One - Design System"; dev notes
// guide.read): primary #FF4F4F (hover #DC2626, press #B91C1C; tints #FFF2F2 / #FFE7E7 / #FFD6D6), slate neutrals
// (#F8FAFC → #0F172A), success #43B75D, warning #F59E0B, error #EF4444; Roboto.
// NOTE: the global Payroll theme (src/antd.config.tsx) still uses #FF3A3A; these screens use #FF4F4F through PekoScope
// until the global theme is aligned (flagged in the run report).
// antd components get these through PekoScope (one ConfigProvider nested in the global theme). Hand-built blocks use
// the CSS variables from peko.css (`var(--peko-…)`), never raw hex values; the class strings below use them too.

export const PEKO_COLOR = {
    primary: '#FF4F4F',
    primaryHover: '#DC2626',
    primaryActive: '#B91C1C',
    /** Tints: lightest (backgrounds), light (hover fills), medium (borders on tinted blocks). */
    primarySurface: '#FFF2F2',
    primaryTint: '#FFE7E7',
    primaryBorder: '#FFD6D6',
    /** Slate neutrals. */
    slate50: '#F8FAFC',
    slate100: '#F1F5F9',
    slate200: '#E2E8F0',
    slate300: '#CBD5E1',
    slate400: '#94A3B8',
    slate500: '#64748B',
    slate600: '#475569',
    slate700: '#334155',
    slate900: '#0F172A',
    /** Body text and values. */
    text: '#0F172A',
    /** Page titles. */
    title: '#0F172A',
    /** Descriptions, helper text, stat labels. */
    muted: '#64748B',
    /** Secondary body text (tab labels, segmented items, neutral tags). */
    textSecondary: '#475569',
    /** Card and input border. */
    border: '#E2E8F0',
    /** Row lines, dividers, tab bar bottom border. */
    line: '#F1F5F9',
    /** Table header, row hover, quiet panels. */
    subtle: '#F8FAFC',
    /** Segmented track, neutral tag background. */
    track: '#F1F5F9',
    /** Quick action icon square. */
    iconBg: '#FFF2F2',
    icon: '#FF4F4F',
    /** The info icon next to labels (the Payroll "Rollout Salary" pattern). */
    infoIcon: '#8993A4',
    success: '#43B75D',
    warning: '#F59E0B',
    error: '#EF4444',
} as const;

export const PEKO_CARD_SHADOW = '0px 1px 12px 1px rgba(122,122,122,0.06)';
export const PEKO_CARD_SHADOW_HOVER = '0px 4px 16px 2px rgba(122,122,122,0.12)';

/** Buttons 6px; inputs 8px; cards 8px; day cells 6px. */
export const PEKO_RADIUS = { control: 6, input: 8, card: 8, cell: 6 } as const;

/** Status tag colour pairs. One map for every screen in scope (success / warning / error from Peko One). */
export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'leave' | 'neutral';

export const STATUS_TONE: Record<StatusTone, { bg: string; ink: string }> = {
    success: { bg: '#ECF8EF', ink: '#308242' },
    warning: { bg: '#FFFBEB', ink: '#B45309' },
    error: { bg: '#FEF2F2', ink: '#DC2626' },
    info: { bg: '#EFF6FF', ink: '#1D4ED8' },
    leave: { bg: '#F5F3FF', ink: '#6D28D9' },
    neutral: { bg: '#F1F5F9', ink: '#475569' },
};

// ---- Tailwind class strings (hand-built blocks; colours from the CSS variables) ---------------------------------

/** Card: white, 1px border, 8px corners, soft shadow, 20–24px padding. */
export const PEKO_CARD = 'rounded-lg border border-solid border-[var(--peko-border)] bg-white p-5 sm:p-6 shadow-[0px_1px_12px_1px_rgba(122,122,122,0.06)]';
/** Inner bordered block inside a card. */
export const PEKO_INNER = 'rounded-lg border border-solid border-[var(--peko-border)] bg-white p-4';
/** Quiet grey panel. */
export const PEKO_PANEL = 'rounded-lg bg-[var(--peko-subtle)] p-4 sm:p-5';

/** Type scale (Peko One): page titles 20/28 semibold; section titles 18/26 and 16/24 semibold; body 14/22; hints 12/18. */
export const PEKO_PAGE_TITLE = 'text-xl leading-7 font-semibold text-[var(--peko-title)]';
export const PEKO_PAGE_DESCRIPTION = 'text-sm leading-[22px] text-[var(--peko-muted)]';
export const PEKO_SECTION_TITLE = 'text-lg leading-[26px] font-semibold text-[var(--peko-text)]';
export const PEKO_CARD_TITLE = 'text-base leading-6 font-semibold text-[var(--peko-text)]';
export const PEKO_HELPER = 'text-xs leading-[18px] text-[var(--peko-muted)]';
export const PEKO_LABEL = 'text-[13px] font-medium text-[var(--peko-text)]';
export const PEKO_STAT_LABEL = 'text-[13px] text-[var(--peko-muted)]';
export const PEKO_STAT_VALUE = 'text-2xl font-semibold text-[var(--peko-text)]';
