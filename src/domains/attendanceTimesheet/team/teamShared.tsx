// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — small pieces shared by the ESS - Manager "My team" screens: the
// settings that decide which tabs show, the person cell, count tiles, breadcrumb and a team-size empty state.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Avatar, Empty, Flex, Typography } from 'antd';

import { PEKO_STAT_LABEL, PEKO_STAT_VALUE } from '@src/components/peko/pekoTokens';
import { hasCheckIn, hasTimesheets } from '@src/prototype/rules/attendance';

import { getAtsSettings } from '../api';
import type { AtsScope } from '../api';
import type { MyTeamTab } from '../hooks/useAtsPaths';
import type { AtsMode, PersonRef, TimesheetApprovalItem } from '../types';

// ---- settings → visible tabs ------------------------------------------------------------------------------

export interface TeamSettings {
    loaded: boolean;
    mode: AtsMode;
    approvalOn: boolean;
}

export const useTeamSettings = (scope: AtsScope): TeamSettings => {
    const [state, setState] = useState<TeamSettings>({ loaded: false, mode: 'both', approvalOn: true });
    useEffect(() => {
        let alive = true;
        getAtsSettings(scope).then(res => {
            if (!alive) return;
            if (!res) {
                setState(s => ({ ...s, loaded: true }));
                return;
            }
            setState({
                loaded: true,
                mode: res.mode,
                approvalOn: res.timesheetApproval.enabled !== false && hasTimesheets(res.mode),
            });
        });
        return () => {
            alive = false;
        };
    }, [scope]);
    return state;
};

// PROTOTYPE-SETUP (Leave & team, Slice 4): Team reimbursements after the Leave calendar (always shown).
export const ALL_TEAM_TABS: MyTeamTab[] = ['approvals', 'today', 'attendance', 'timesheets', 'leave-calendar', 'reimbursements'];

/**
 * PROTOTYPE-SETUP (My team, Slices 3–4): Approvals and the Leave calendar always show; Team today and Team attendance
 * need check-in (not Timesheet only mode); Team timesheets need timesheets (not Attendance only mode).
 */
export const visibleTeamTabs = ({ mode }: Pick<TeamSettings, 'mode' | 'approvalOn'>) =>
    ALL_TEAM_TABS.filter(tab => {
        if (tab === 'today' || tab === 'attendance') return hasCheckIn(mode);
        if (tab === 'timesheets') return hasTimesheets(mode);
        return true;
    });

// ---- people ---------------------------------------------------------------------------------------------

const AVATAR_COLORS = ['#FF3A3A', '#7A5AF8', '#12B76A', '#F79009', '#2E90FA', '#EE46BC'];

export const initialsOf = (name: string) =>
    name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0]?.toUpperCase())
        .join('');

export const PersonAvatar = ({ person, size = 36 }: { person: PersonRef; size?: number }) => (
    <Avatar
        size={size}
        style={{ backgroundColor: AVATAR_COLORS[person.id % AVATAR_COLORS.length], flexShrink: 0 }}
    >
        {initialsOf(person.name)}
    </Avatar>
);

export const PersonCell = ({
    person,
    sub,
    size = 36,
}: {
    person: PersonRef;
    /** Second line, default the designation. */
    sub?: ReactNode;
    size?: number;
}) => (
    <Flex gap={10} align="center" className="min-w-0">
        <PersonAvatar person={person} size={size} />
        <Flex vertical className="min-w-0">
            <Typography.Text strong ellipsis className="text-[var(--peko-text)]">
                {person.name}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis className="text-xs">
                {sub ?? person.designation}
            </Typography.Text>
        </Flex>
    </Flex>
);

// ---- layout bits ------------------------------------------------------------------------------------------

/** PROTOTYPE-SETUP (Design update, rule 5): a stat card — label 13px #8B8B8B, value 24px medium #121212. */
export const CountTile = ({ label, value, onClick }: { label: string; value: number | string; onClick?: () => void }) => {
    const body = (
        <Flex vertical gap={4} className="px-5 py-4">
            <span className={PEKO_STAT_LABEL}>{label}</span>
            <span className={`leading-8 tabular-nums ${PEKO_STAT_VALUE}`}>{value}</span>
        </Flex>
    );
    const cls = 'w-full text-left rounded-lg border border-solid border-[var(--peko-border)] bg-white font-[inherit] shadow-[0px_1px_12px_1px_rgba(122,122,122,0.06)]';
    if (!onClick) return <div className={cls}>{body}</div>;
    return (
        <button type="button" onClick={onClick} className={`${cls} cursor-pointer p-0 transition-colors hover:border-[var(--peko-primary-border)]`}>
            {body}
        </button>
    );
};

export const NoTeamEmpty = () => (
    <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
            <Flex vertical gap={2}>
                <Typography.Text strong>No one reports to you yet</Typography.Text>
                <Typography.Text type="secondary">
                    Your direct reports and their requests will show up here.
                </Typography.Text>
            </Flex>
        }
    />
);

/** Status of a timesheet-approval item, as a label + antd Tag colour. */
export const approvalItemStatus = (
    item: Pick<TimesheetApprovalItem, 'status' | 'waitingForYou'>
): { label: string; color: string } => {
    if (item.waitingForYou) return { label: 'Waiting for you', color: 'processing' };
    const map: Record<string, { label: string; color: string }> = {
        APPROVED: { label: 'Approved', color: 'success' },
        SENT_BACK: { label: 'Update requested', color: 'error' },
        REJECTED: { label: 'Rejected', color: 'error' },
        SUBMITTED: { label: 'Submitted', color: 'processing' },
        PENDING: { label: 'Pending', color: 'processing' },
        DRAFT: { label: 'Draft', color: 'default' },
    };
    return map[item.status] ?? { label: item.status, color: 'default' };
};
