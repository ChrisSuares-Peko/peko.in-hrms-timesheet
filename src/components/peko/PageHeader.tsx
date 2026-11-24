// PROTOTYPE-SETUP (Design update: Peko design language, rule 1): the page header for every Payroll service page and
// Payroll settings, and the sub-tab row under it.
//   (layout breadcrumb "Payroll › Services › {service}": grey, the last item in primary red — payrollServices.tsx)
//   PekoBackLink ...... red "‹ Back to dashboard", with an optional tag beside it (what's waiting here)
//   PekoPageHeader .... title (20px medium #404040) and one grey line (14px #8B8B8B); optional actions on the right
//   PekoTabRow ........ sub-tabs on the left, page actions right-aligned on the same row
//   PekoTabLabel ...... a main-tab label with its count as a small red pill (rule 2)
//   PekoSectionTabs ... PROTOTYPE-SETUP (Peko One): a page's section switcher — antd line Tabs (underline, red active)
//                       with the page actions right-aligned on the tab bar. Filters keep antd Segmented.
import type { ReactNode } from 'react';

import { LeftOutlined } from '@ant-design/icons';
import { Badge, Tabs } from 'antd';
import { Link } from 'react-router-dom';

import { PEKO_PAGE_DESCRIPTION, PEKO_PAGE_TITLE } from './pekoTokens';

export const PekoBackLink = ({ to, label, extra, ...rest }: { to: string; label: string; extra?: ReactNode } & Record<`data-${string}`, unknown>) => (
    <div className="mb-3 flex flex-wrap items-center gap-2" {...rest}>
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium !text-[var(--peko-primary)] hover:!text-[var(--peko-primary-hover)]" data-back-to-dashboard>
            <LeftOutlined className="text-xs" />
            {label}
        </Link>
        {extra}
    </div>
);

export const PekoPageHeader = ({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) => (
    <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3" data-page-header>
        <div className="min-w-0">
            <h1 className={`m-0 leading-7 ${PEKO_PAGE_TITLE}`} data-page-title>
                {title}
            </h1>
            {description && (
                <p className={`m-0 mt-1 ${PEKO_PAGE_DESCRIPTION}`} data-page-description>
                    {description}
                </p>
            )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

export const PekoTabRow = ({ children, actions, className = 'mb-6' }: { children: ReactNode; actions?: ReactNode; className?: string }) => (
    <div className={`flex min-w-0 flex-wrap items-center justify-between gap-3 ${className}`} data-tab-row>
        <div className="min-w-0 max-w-full overflow-x-auto">{children}</div>
        {actions && <div className="flex flex-wrap items-center gap-2" data-page-actions>{actions}</div>}
    </div>
);

/** A main-tab label; a count above 0 shows as a small red pill after it. */
export const PekoTabLabel = ({ label, count = 0 }: { label: ReactNode; count?: number }) => (
    <span className="inline-flex items-center gap-1.5">
        {label}
        {count > 0 && <Badge count={count} size="small" color="#FF3A3A" className="peko-tab-count" data-tab-count />}
    </span>
);

export interface SectionTab<K extends string> {
    value: K;
    label: ReactNode;
    /** A count shown as a small red pill after the label. */
    count?: number;
}

export const PekoSectionTabs = <K extends string>({
    value,
    onChange,
    items,
    actions,
    className = 'mb-5',
    ...rest
}: {
    value: K;
    onChange: (k: K) => void;
    items: SectionTab<K>[];
    actions?: ReactNode;
    className?: string;
} & Record<`data-${string}`, unknown>) => (
    <Tabs
        activeKey={value}
        onChange={k => onChange(k as K)}
        className={`peko-section-tabs ${className}`}
        items={items.map(i => ({ key: i.value, label: <PekoTabLabel label={i.label} count={i.count} /> }))}
        tabBarExtraContent={actions ? <div className="flex flex-wrap items-center gap-2 pb-1" data-page-actions>{actions}</div> : undefined}
        {...rest}
    />
);
