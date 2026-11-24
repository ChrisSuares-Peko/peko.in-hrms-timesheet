import React from 'react';

import { Image, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { CardProps } from '@domains/dashboard/Payroll/types/types';

// PROTOTYPE-SETUP (Leave module, update): a service tile shows what's waiting for the admin.
// PROTOTYPE-SETUP (Design update: Peko design language, rule 13): a Quick actions card — 1px #EAEAEA, 8px radius, 18px
// padding; the icon in a 40px rounded square (#FFF7F7, icon #EA3639); the name in medium weight; one grey line; what's
// waiting as a red count badge top right. Hover: #FFE4E4 border and a slightly stronger shadow.
const NavigationCards = ({ icon, iconNode, title, description, link, isActive, reference, onClick, iconWidth = 50, badge = 0 }: CardProps) => {
    const isActionOnly = !link && typeof onClick === 'function';

    const className =
        'relative flex h-full w-full min-w-0 cursor-pointer flex-col items-start gap-1 rounded-lg border border-solid border-[var(--peko-border)] bg-white p-[18px] text-left font-[inherit] shadow-[0px_1px_12px_1px_rgba(122,122,122,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--peko-primary-border)] hover:shadow-[0px_4px_16px_2px_rgba(122,122,122,0.12)]';
    const body = (
        <>
            <span className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--peko-primary-surface)] text-xl text-[var(--peko-primary)]" aria-hidden>
                {iconNode ?? <Image width={Math.min(iconWidth, 28)} preview={false} src={icon} />}
            </span>
            <Typography.Text {...(!isActive && { disabled: true })} className="text-sm font-medium !text-[var(--peko-text)]">
                {title}
            </Typography.Text>
            {description && <Typography.Text className="text-[13px] leading-[18px] !text-[var(--peko-muted)]">{description}</Typography.Text>}
            {badge > 0 && (
                <span
                    className="absolute right-3 top-3 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--peko-primary)] px-1.5 text-xs font-medium leading-none text-white"
                    aria-label={`${badge} waiting`}
                    title={`${badge} waiting`}
                    data-tile-waiting
                >
                    {badge}
                </span>
            )}
        </>
    );

    if (isActionOnly) {
        return (
            <button type="button" ref={reference as React.Ref<HTMLButtonElement>} onClick={() => onClick?.()} className={className} data-quick-tile={title.trim()}>
                {body}
            </button>
        );
    }
    return (
        <Link to={link} className="block h-full">
            <div ref={reference} className={className} data-quick-tile={title.trim()}>
                {body}
            </div>
        </Link>
    );
};

export default NavigationCards;
