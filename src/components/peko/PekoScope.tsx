// PROTOTYPE-SETUP (Design update: Peko design language): the one theme layer for every redesigned ESS and Payroll
// screen. It is NOT a second theme: it nests inside the global Peko theme (src/antd.config.tsx), keeps its values
// (primary #FF3A3A, text #121212, 36px controls, 6px control radius, Roboto) and only adds the component details the
// design rules ask for (card border and shadow, table header, tabs, segmented, tags, alerts, modal and drawer
// dividers). Mounted on the ESS layout (EssThemeProvider) and on each Payroll service and settings page, so their
// modals and drawers (portals) inherit it through the ConfigProvider context. Rules: docs/design/peko-design-language.md.
import { ReactNode } from 'react';

import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';

import './peko.css';
import { PEKO_CARD_SHADOW, PEKO_COLOR, PEKO_RADIUS } from './pekoTokens';

export const pekoTheme: ThemeConfig = {
    token: {
        colorPrimary: PEKO_COLOR.primary,
        colorPrimaryHover: PEKO_COLOR.primaryHover,
        colorPrimaryActive: PEKO_COLOR.primaryActive,
        colorLink: PEKO_COLOR.primary,
        colorLinkHover: PEKO_COLOR.primaryHover,
        colorLinkActive: PEKO_COLOR.primaryActive,
        colorText: PEKO_COLOR.text,
        colorTextHeading: PEKO_COLOR.text,
        colorTextSecondary: PEKO_COLOR.muted,
        colorTextDescription: PEKO_COLOR.muted,
        colorBorderSecondary: PEKO_COLOR.line,
        colorSplit: PEKO_COLOR.line,
        fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        controlHeight: 36,
        controlHeightSM: 28,
        borderRadius: PEKO_RADIUS.control,
        borderRadiusSM: 4,
        borderRadiusLG: PEKO_RADIUS.card,
    },
    components: {
        Button: {
            borderRadius: PEKO_RADIUS.control,
            borderRadiusSM: PEKO_RADIUS.control,
            borderRadiusLG: PEKO_RADIUS.control,
            fontWeight: 500,
            primaryShadow: 'none',
            defaultShadow: 'none',
            dangerShadow: 'none',
        },
        Input: { borderRadius: PEKO_RADIUS.control, borderRadiusLG: PEKO_RADIUS.control, activeBorderColor: PEKO_COLOR.primary, hoverBorderColor: PEKO_COLOR.primaryHover },
        InputNumber: { borderRadius: PEKO_RADIUS.control, borderRadiusLG: PEKO_RADIUS.control, activeBorderColor: PEKO_COLOR.primary, hoverBorderColor: PEKO_COLOR.primaryHover },
        Select: { borderRadius: PEKO_RADIUS.control, borderRadiusLG: PEKO_RADIUS.control, activeBorderColor: PEKO_COLOR.primary, hoverBorderColor: PEKO_COLOR.primaryHover },
        DatePicker: { borderRadius: PEKO_RADIUS.control, borderRadiusLG: PEKO_RADIUS.control, activeBorderColor: PEKO_COLOR.primary, hoverBorderColor: PEKO_COLOR.primaryHover },
        Card: {
            borderRadiusLG: PEKO_RADIUS.card,
            colorBorderSecondary: PEKO_COLOR.border,
            paddingLG: 24,
            padding: 20,
            headerFontSize: 16,
            headerFontSizeSM: 16,
            fontWeightStrong: 500,
            boxShadowTertiary: PEKO_CARD_SHADOW,
        },
        Table: {
            headerBg: PEKO_COLOR.subtle,
            headerColor: PEKO_COLOR.text,
            headerSplitColor: 'transparent',
            headerBorderRadius: PEKO_RADIUS.card,
            borderColor: PEKO_COLOR.line,
            rowHoverBg: PEKO_COLOR.subtle,
            cellPaddingBlock: 14,
            cellPaddingInline: 16,
            cellPaddingBlockMD: 12,
            cellPaddingInlineMD: 16,
            cellFontSize: 14,
            fontWeightStrong: 500,
        },
        Tag: { borderRadiusSM: 999, defaultBg: PEKO_COLOR.track, defaultColor: PEKO_COLOR.textSecondary, fontSizeSM: 12 },
        Tabs: {
            inkBarColor: PEKO_COLOR.primary,
            itemColor: '#404040',
            itemSelectedColor: PEKO_COLOR.primary,
            itemHoverColor: PEKO_COLOR.primary,
            itemActiveColor: PEKO_COLOR.primaryActive,
            titleFontSize: 14,
            horizontalItemGutter: 32,
            lineWidthBold: 2,
            colorBorderSecondary: PEKO_COLOR.line,
        },
        Segmented: {
            trackBg: PEKO_COLOR.track,
            itemColor: PEKO_COLOR.textSecondary,
            itemHoverColor: PEKO_COLOR.text,
            itemSelectedBg: '#FFFFFF',
            itemSelectedColor: PEKO_COLOR.text,
            borderRadius: PEKO_RADIUS.control,
            borderRadiusSM: 4,
        },
        Modal: { borderRadiusLG: PEKO_RADIUS.card, titleFontSize: 16, titleColor: PEKO_COLOR.text, fontWeightStrong: 600 },
        Drawer: { colorBgElevated: '#FFFFFF', colorSplit: PEKO_COLOR.line, fontWeightStrong: 600, paddingLG: 24 },
        Alert: { borderRadiusLG: PEKO_RADIUS.card, colorText: PEKO_COLOR.text },
        Badge: { colorError: PEKO_COLOR.primary },
        Switch: { colorPrimary: PEKO_COLOR.primary, colorPrimaryHover: PEKO_COLOR.primaryHover },
        Breadcrumb: { linkColor: PEKO_COLOR.muted, separatorColor: PEKO_COLOR.muted, lastItemColor: PEKO_COLOR.primary, linkHoverColor: PEKO_COLOR.primary },
        Empty: { colorTextDescription: PEKO_COLOR.muted },
        Calendar: { itemActiveBg: PEKO_COLOR.primarySurface },
    },
};

/** Class names the scope hands to antd components rendered in portals (modals, drawers) and to cards and alerts. */
const MODAL = { classNames: { content: 'peko-modal', header: 'peko-modal-header', body: 'peko-modal-body', footer: 'peko-modal-footer' } };
const DRAWER = { classNames: { header: 'peko-drawer-header', body: 'peko-drawer-body', footer: 'peko-drawer-footer' } };

const PekoScope = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <ConfigProvider
        theme={pekoTheme}
        modal={MODAL}
        drawer={DRAWER}
        card={{ className: 'peko-card' }}
        alert={{ className: 'peko-alert' }}
        tag={{ className: 'peko-tag' }}
        segmented={{ className: 'peko-segmented' }}
        tabs={{ className: 'peko-tabs' }}
    >
        <div className={`peko-scope w-full min-w-0 ${className}`}>{children}</div>
    </ConfigProvider>
);

export default PekoScope;
