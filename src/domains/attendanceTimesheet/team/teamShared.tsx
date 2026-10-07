// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — small pieces shared by the ESS - Manager "My team" screens: the
// settings that decide which tabs show, the person cell, count tiles, breadcrumb and a team-size empty state.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Avatar, Breadcrumb, Empty, Flex, Typography } from 'antd';
import { FiChevronRight } from 'react-icons/fi';
import { Link } from 'react-router-dom';

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
                approvalOn: res.timesheetApproval.enabled !== false && res.mode !== 'attendance',
            });
        });
        return () => {
            alive = false;
        };
    }, [scope]);
    return state;
};

export const ALL_TEAM_TABS: MyTeamTab[] = [
    'today',
    'timesheets',
    'timesheet-approvals',
    'attendance-approvals',
    'overtime-approvals',
];

export const visibleTeamTabs = ({ mode, approvalOn }: Pick<TeamSettings, 'mode' | 'approvalOn'>) =>
    ALL_TEAM_TABS.filter(tab => {
        if (tab === 'timesheets') return mode !== 'attendance';
        if (tab === 'timesheet-approvals') return approvalOn && mode !== 'attendance';
        if (tab === 'attendance-approvals') return mode !== 'timesheet';
        return true;
    });

// ---- people ---------------------------------------------------------------------------------------------

const AVATAR_COLORS = ['#FF4F4F', '#7A5AF8', '#12B76A', '#F79009', '#2E90FA', '#EE46BC'];

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
            <Typography.Text strong ellipsis className="text-[#171717]">
                {person.name}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis className="text-xs">
                {sub ?? person.designation}
            </Typography.Text>
        </Flex>
    </Flex>
);

// ---- layout bits ------------------------------------------------------------------------------------------

export const CountTile = ({
    label,
    value,
    color,
    onClick,
}: {
    label: string;
    value: number | string;
    color?: string;
    onClick?: () => void;
}) => {
    const body = (
        <Flex vertical gap={2} className="px-4 py-3">
            <Typography.Text className="text-2xl font-bold leading-tight" style={{ color: color ?? '#171717' }}>
                {value}
            </Typography.Text>
            <Typography.Text type="secondary" className="text-xs sm:text-sm">
                {label}
            </Typography.Text>
        </Flex>
    );
    const cls = 'w-full text-left rounded-2xl border border-solid border-[#EAECF0] bg-white';
    if (!onClick) return <div className={cls}>{body}</div>;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${cls} cursor-pointer transition-colors hover:border-[#FF4F4F] p-0`}
        >
            {body}
        </button>
    );
};

export const TeamBreadcrumb = ({ items }: { items: { title: string; to?: string }[] }) => (
    <Breadcrumb
        className="mb-3"
        separator={<FiChevronRight className="align-middle text-gray-400" />}
        items={items.map(i => ({ title: i.to ? <Link to={i.to}>{i.title}</Link> : i.title }))}
    />
);

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
        SENT_BACK: { label: 'Sent back', color: 'error' },
        REJECTED: { label: 'Rejected', color: 'error' },
        SUBMITTED: { label: 'Submitted', color: 'processing' },
        PENDING: { label: 'Pending', color: 'processing' },
        DRAFT: { label: 'Draft', color: 'default' },
    };
    return map[item.status] ?? { label: item.status, color: 'default' };
};
