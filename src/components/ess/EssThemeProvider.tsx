// PROTOTYPE-SETUP (ESS design, Slice 1): the ESS theme. Mounted once on the ESS layout (EssLayout), so it applies to
// every ESS - Employee and ESS - Manager page — and to their modals and drawers, which inherit the ConfigProvider
// context through portals — without touching Payroll or the real /employee portal, which share some of these
// pages. Two parts:
//   1. antd v5 ConfigProvider tokens (colours, radii, tables, tags, tabs, segmented, modals, inputs), nested inside
//      the app's global theme (src/antd.config.tsx) the same way other screens nest a local ConfigProvider;
//   2. ess.css, scoped to `.ess-scope`, for the shared portal pages' own Tailwind classes (page titles, grey text).
import { ReactNode } from 'react';

import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';

import './ess.css';
import { ESS_COLOR, ESS_RADIUS, ESS_SHADOW } from './essTokens';

export const essTheme: ThemeConfig = {
    token: {
        colorPrimary: ESS_COLOR.red,
        colorLink: ESS_COLOR.red,
        colorText: ESS_COLOR.text,
        colorTextSecondary: ESS_COLOR.textSecondary,
        colorTextTertiary: ESS_COLOR.textTertiary,
        colorTextDescription: ESS_COLOR.textSecondary,
        colorBorder: ESS_COLOR.border,
        colorBorderSecondary: ESS_COLOR.borderSoft,
        borderRadius: ESS_RADIUS.control,
        borderRadiusLG: ESS_RADIUS.block,
        borderRadiusSM: 6,
        boxShadowTertiary: ESS_SHADOW,
    },
    components: {
        Card: { borderRadiusLG: ESS_RADIUS.card, paddingLG: 24, boxShadowTertiary: ESS_SHADOW },
        Button: { borderRadius: ESS_RADIUS.control, borderRadiusLG: 10, borderRadiusSM: 6, fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
        Input: { borderRadius: ESS_RADIUS.control, borderRadiusLG: 10, activeBorderColor: ESS_COLOR.red, hoverBorderColor: '#ff8a8a' },
        InputNumber: { borderRadius: ESS_RADIUS.control, borderRadiusLG: 10 },
        Select: { borderRadius: ESS_RADIUS.control, borderRadiusLG: 10 },
        DatePicker: { borderRadius: ESS_RADIUS.control, borderRadiusLG: 10 },
        Table: {
            headerBg: '#F9FAFB',
            headerColor: ESS_COLOR.textSecondary,
            headerSplitColor: 'transparent',
            borderColor: ESS_COLOR.borderSoft,
            rowHoverBg: '#FAFAFA',
            headerBorderRadius: ESS_RADIUS.table,
            cellPaddingBlock: 14,
        },
        Tag: { borderRadiusSM: 999, defaultBg: '#F5F5F5' },
        Tabs: { inkBarColor: ESS_COLOR.red, itemSelectedColor: ESS_COLOR.red, itemHoverColor: ESS_COLOR.red, itemActiveColor: ESS_COLOR.red, titleFontSize: 15, horizontalItemGutter: 28 },
        Segmented: { borderRadius: 10, borderRadiusSM: 8, itemSelectedColor: ESS_COLOR.text, itemColor: ESS_COLOR.textSecondary, trackBg: '#F2F2F2' },
        Modal: { borderRadiusLG: 24, titleFontSize: 18, titleColor: ESS_COLOR.text },
        Drawer: { colorBgElevated: '#ffffff' },
        Alert: { borderRadiusLG: ESS_RADIUS.block },
        Badge: { colorError: ESS_COLOR.red },
        Empty: { colorTextDescription: ESS_COLOR.textTertiary },
        Calendar: { itemActiveBg: ESS_COLOR.redSoft },
    },
};

const EssThemeProvider = ({ children }: { children: ReactNode }) => (
    <ConfigProvider theme={essTheme}>
        <div className="ess-scope w-full min-w-0">{children}</div>
    </ConfigProvider>
);

export default EssThemeProvider;
