// PROTOTYPE-SETUP (ESS design, Slice 1; Design update: Peko design language): the ESS names for the shared Peko
// values (src/components/peko/pekoTokens.ts). Kept so existing ESS blocks pick up the Peko look without renaming:
// cards are 8px with a 1px #EAEAEA border and the soft Peko shadow, text is #121212 / #8B8B8B, red is #FF3A3A.
// See docs/design/peko-design-language.md.
import { PEKO_CARD, PEKO_CARD_SHADOW, PEKO_COLOR, PEKO_INNER, PEKO_PAGE_DESCRIPTION, PEKO_PAGE_TITLE, PEKO_PANEL } from '@src/components/peko/pekoTokens';

export const ESS_COLOR = {
    red: PEKO_COLOR.primary,
    redSoft: PEKO_COLOR.primarySurface,
    text: PEKO_COLOR.text,
    textSecondary: PEKO_COLOR.textSecondary,
    textTertiary: PEKO_COLOR.muted,
    border: PEKO_COLOR.border,
    borderSoft: PEKO_COLOR.line,
    tile: PEKO_COLOR.iconBg,
    panel: PEKO_COLOR.subtle,
    /** Status blocks (Overview today panel): Peko status tag pairs. */
    statusIdle: PEKO_COLOR.track,
    statusOnTime: '#ECFDF3',
    statusOnTimeInk: '#027A48',
    statusLate: '#FFF6EA',
    statusLateInk: '#D48806',
    statusDone: PEKO_COLOR.track,
    blueSoft: '#E6F4FF',
    blueInk: '#0958D9',
} as const;

export const ESS_RADIUS = { card: 8, inner: 8, tile: 8, block: 8, control: 6, table: 8 } as const;

export const ESS_SHADOW = PEKO_CARD_SHADOW;

/** Spacing scale (px): 24 between sections, 16 between cards. */
export const ESS_SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// ---- Tailwind class strings (hand-built blocks) ------------------------------------------------------------

export const ESS_CARD = PEKO_CARD;
export const ESS_INNER = PEKO_INNER;
export const ESS_PANEL = PEKO_PANEL;
export const ESS_PANEL_ITEM = 'rounded-lg bg-white px-4 py-3';

export const ESS_PAGE_TITLE = PEKO_PAGE_TITLE;
export const ESS_PAGE_SUBTITLE = PEKO_PAGE_DESCRIPTION;
export const ESS_SECTION_TITLE = 'text-base font-medium text-[#121212]';
export const ESS_SECTION_LINK = 'text-sm font-medium text-[#FF3A3A] hover:text-[#FF6963]';
export const ESS_CARD_TITLE = 'text-base font-medium text-[#121212]';
export const ESS_LABEL = 'text-[13px] text-[#8B8B8B]';
export const ESS_VALUE = 'text-base font-medium text-[#121212]';
export const ESS_BODY = 'text-sm text-[#121212]';
export const ESS_MUTED = 'text-sm text-[#8B8B8B]';
export const ESS_CAPTION = 'text-xs text-[#8B8B8B]';
export const ESS_GROUP_LABEL = 'text-[11px] font-medium uppercase tracking-wide text-[#8B8B8B]';

/** Main action button: full width, theme height (36px). */
export const ESS_BUTTON = 'font-medium';
