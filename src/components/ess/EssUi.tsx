// PROTOTYPE-SETUP (ESS design, Slice 1): shared ESS building blocks, styled from essTokens.
//   EssPageHeader     page title (20px medium) + subtitle + actions on the right (Payroll DashboardHeader)
//   EssSectionHeading section title (18px medium) + optional link / extra on the right (AnnouncementsPanel)
//   EssCard           white 32px card with soft shadow and an optional section heading (ProfileCard)
//   EssStatusBlock    grey rounded block with a pin icon, bold status and a line underneath (ProfileCard status)
import { CSSProperties, ReactNode } from 'react';

import { EnvironmentFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';

import {
    ESS_CARD,
    ESS_COLOR,
    ESS_PAGE_SUBTITLE,
    ESS_PAGE_TITLE,
    ESS_SECTION_LINK,
    ESS_SECTION_TITLE,
} from './essTokens';

export const EssPageHeader = ({ title, subtitle, extra }: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode }) => (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
            <h1 className={`m-0 ${ESS_PAGE_TITLE}`}>{title}</h1>
            {subtitle && <p className={`m-0 mt-0.5 ${ESS_PAGE_SUBTITLE}`}>{subtitle}</p>}
        </div>
        {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </div>
);

export const EssSectionHeading = ({
    title,
    link,
    extra,
    sub,
}: {
    title: ReactNode;
    /** "See all" style link on the right. */
    link?: { to: string; text: string };
    extra?: ReactNode;
    sub?: ReactNode;
}) => (
    <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
            <h3 className={`m-0 truncate ${ESS_SECTION_TITLE}`}>{title}</h3>
            {extra}
            <span className="flex-1" />
            {link && (
                <Link to={link.to} className={`shrink-0 ${ESS_SECTION_LINK}`}>
                    {link.text}
                </Link>
            )}
        </div>
        {sub && <p className="m-0 mt-0.5 text-xs text-[#9e9e9e]">{sub}</p>}
    </div>
);

export const EssCard = ({
    label,
    heading,
    className = '',
    children,
}: {
    /** aria-label of the section. */
    label?: string;
    heading?: ReactNode;
    className?: string;
    children: ReactNode;
}) => (
    <section aria-label={label} className={`flex min-w-0 flex-col gap-4 ${ESS_CARD} ${className}`}>
        {heading}
        {children}
    </section>
);

export type EssStatusTone = 'idle' | 'onTime' | 'late' | 'done' | 'info';

const TONE: Record<EssStatusTone, { bg: string; ink: string; icon: string }> = {
    idle: { bg: ESS_COLOR.statusIdle, ink: ESS_COLOR.text, icon: ESS_COLOR.red },
    onTime: { bg: ESS_COLOR.statusOnTime, ink: ESS_COLOR.statusOnTimeInk, icon: ESS_COLOR.statusOnTimeInk },
    late: { bg: ESS_COLOR.statusLate, ink: ESS_COLOR.statusLateInk, icon: ESS_COLOR.statusLateInk },
    done: { bg: ESS_COLOR.statusDone, ink: '#1e293b', icon: ESS_COLOR.statusOnTimeInk },
    info: { bg: ESS_COLOR.blueSoft, ink: ESS_COLOR.blueInk, icon: ESS_COLOR.blueInk },
};

export const EssStatusBlock = ({
    tone,
    title,
    sub,
    right,
    icon,
    role = 'status',
}: {
    tone: EssStatusTone;
    title: ReactNode;
    sub?: ReactNode;
    right?: ReactNode;
    icon?: ReactNode;
    role?: string;
}) => {
    const t = TONE[tone];
    const ink: CSSProperties = { color: t.ink };
    return (
        <div role={role} className="flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: t.bg }}>
            <span className="shrink-0 text-xl" style={{ color: t.icon }} aria-hidden>
                {icon ?? <EnvironmentFilled />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold tabular-nums" style={ink}>
                    {title}
                </span>
                {sub && <span className="block text-sm text-[#1d1d1d]">{sub}</span>}
            </span>
            {right}
        </div>
    );
};
