// PROTOTYPE-SETUP (Design update: Peko design language, rule 9): the one status tag for every redesigned screen.
// A fully rounded, borderless 12px medium pill in one of six colour pairs (STATUS_TONE). Screens either pass a tone,
// or an antd preset colour they already used (`color="success"`, `"blue"`, …), which maps onto the same six pairs:
//   success / approved / present / credited ........ success
//   pending / warning / late / update requested ..... warning
//   error / rejected / absent ....................... error
//   info / with approver / in request ............... info
//   leave / holiday ................................. leave
//   neutral / withdrawn / cancelled / inactive ...... neutral
import type { CSSProperties } from 'react';

import { Tag } from 'antd';
import type { TagProps } from 'antd';

import { STATUS_TONE, type StatusTone } from './pekoTokens';

export type { StatusTone } from './pekoTokens';

const PRESET: Record<string, StatusTone> = {
    success: 'success',
    green: 'success',
    lime: 'success',
    warning: 'warning',
    gold: 'warning',
    orange: 'warning',
    yellow: 'warning',
    error: 'error',
    red: 'error',
    volcano: 'error',
    processing: 'info',
    blue: 'info',
    geekblue: 'info',
    cyan: 'info',
    purple: 'leave',
    magenta: 'leave',
    default: 'neutral',
    grey: 'neutral',
    gray: 'neutral',
};

/** The tone for a tone name or an antd preset colour (unknown → neutral). */
export const toneOf = (color?: string | null): StatusTone => {
    if (!color) return 'neutral';
    if (color in STATUS_TONE) return color as StatusTone;
    return PRESET[color] ?? 'neutral';
};

export const statusToneStyle = (tone: StatusTone): CSSProperties => ({
    backgroundColor: STATUS_TONE[tone].bg,
    color: STATUS_TONE[tone].ink,
});

type Props = Omit<TagProps, 'color' | 'bordered'> & {
    /** One of the six tones… */
    tone?: StatusTone;
    /** …or an antd preset colour (success, processing, blue, gold, …). */
    color?: string;
} & Record<`data-${string}`, unknown>;

const StatusTag = ({ tone, color, className = '', style, children, ...rest }: Props) => {
    const t = tone ?? toneOf(color);
    return (
        <Tag bordered={false} className={`peko-status-tag !m-0 ${className}`} style={{ ...statusToneStyle(t), ...style }} data-tone={t} {...rest}>
            {children}
        </Tag>
    );
};

export default StatusTag;
