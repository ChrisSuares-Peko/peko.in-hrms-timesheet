// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — "Timesheet approvals" tab of ESS - Manager "My team": submitted weeks
// and change requests from direct reports, "Waiting for you" / "All requests". Opening one shows the review
// drawer (shared with the member timesheet page).
import { useCallback, useEffect, useState } from 'react';

import { LockOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Empty, Flex, Segmented, Skeleton, Tag, Typography } from 'antd';

import { getTimesheetQueue } from '../api';
import { approvalItemStatus, PersonCell } from './teamShared';
import TimesheetReviewDrawer from './TimesheetReviewDrawer';
import type { ReviewTarget } from './TimesheetReviewDrawer';
import { fmtStamp, fmtWeekRange, formatDuration } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { QueueScope, TimesheetApprovalItem } from '../types';

const ItemCard = ({ item, onOpen }: { item: TimesheetApprovalItem; onOpen: () => void }) => {
    const status = approvalItemStatus(item);
    const isChange = item.kind === 'CHANGE_REQUEST';
    const short = item.loggedMinutes < item.expectedMinutes;
    let verb = 'Decided';
    if (item.waitingForYou) verb = isChange ? 'Requested' : 'Submitted';
    const when = item.at ? `${verb} ${fmtStamp(item.at)}` : '';
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`w-full text-left cursor-pointer rounded-2xl border border-solid bg-white p-4 transition-colors hover:border-[#FF4F4F] ${
                item.waitingForYou ? 'border-[#FECDCA]' : 'border-[#EAECF0]'
            }`}
        >
            <Flex gap={12} justify="space-between" align="flex-start" wrap="wrap">
                <Flex vertical gap={8} className="min-w-0 flex-1 basis-[240px]">
                    <PersonCell person={item.employee} />
                    <Flex gap={6} align="center" wrap="wrap">
                        <Tag color={isChange ? 'gold' : 'blue'} className="!m-0">
                            {isChange ? 'Change request' : 'Week submitted'}
                        </Tag>
                        <Typography.Text strong>{fmtWeekRange(item.weekStart)}</Typography.Text>
                    </Flex>
                    <Typography.Text type="secondary" className="text-sm">
                        {isChange ? 'Proposed: logged ' : 'Logged '}
                        <span className={short ? 'text-[#B54708] font-medium' : 'text-[#171717] font-medium'}>
                            {formatDuration(item.loggedMinutes)}
                        </span>{' '}
                        of {formatDuration(item.expectedMinutes)} expected
                    </Typography.Text>
                    {item.diffSummary && <Typography.Text className="text-sm">{item.diffSummary}</Typography.Text>}
                    {item.reason && (
                        <Typography.Paragraph type="secondary" className="!mb-0 text-sm" ellipsis={{ rows: 2 }}>
                            <span className="font-medium text-[#475467]">{isChange ? 'Reason: ' : 'Your comment: '}</span>
                            {item.reason}
                        </Typography.Paragraph>
                    )}
                    {item.blockedReason && (
                        <Typography.Text className="text-sm text-[#B54708]">
                            <LockOutlined /> Can&apos;t be approved — {item.blockedReason}
                        </Typography.Text>
                    )}
                </Flex>
                <Flex vertical align="flex-end" gap={8} className="ml-auto">
                    <Tag color={status.color} className="!m-0">
                        {status.label}
                    </Tag>
                    {when && (
                        <Typography.Text type="secondary" className="text-xs whitespace-nowrap">
                            {when}
                        </Typography.Text>
                    )}
                    <span className="text-[#FF4F4F] text-sm font-medium whitespace-nowrap">
                        {item.waitingForYou ? 'Review' : 'View'} <RightOutlined className="text-xs" />
                    </span>
                </Flex>
            </Flex>
        </button>
    );
};

const TimesheetApprovals = ({ onChanged }: { onChanged?: () => void }) => {
    const scope = useAtsScope();
    const [queueScope, setQueueScope] = useState<QueueScope>('waiting');
    const [items, setItems] = useState<TimesheetApprovalItem[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [target, setTarget] = useState<ReviewTarget | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const res = await getTimesheetQueue(scope, queueScope);
        setItems(res === false ? [] : res);
        setLoading(false);
    }, [scope, queueScope]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const renderList = () => {
        if (loading && !items) {
            return (
                <Flex vertical gap={12}>
                    {[0, 1, 2].map(i => (
                        <div key={i} className="rounded-2xl border border-solid border-[#EAECF0] p-4">
                            <Skeleton active avatar paragraph={{ rows: 2 }} />
                        </div>
                    ))}
                </Flex>
            );
        }
        if (!items?.length) {
            return (
                <div className="rounded-2xl border border-dashed border-[#EAECF0] py-10">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <Flex vertical gap={2}>
                                <Typography.Text strong>
                                    {queueScope === 'waiting' ? "You're all caught up" : 'No timesheet decisions yet'}
                                </Typography.Text>
                                <Typography.Text type="secondary">
                                    {queueScope === 'waiting'
                                        ? 'Weeks reach you on submission day, and change requests as soon as they are raised.'
                                        : 'Submitted weeks and change requests from your team will be listed here.'}
                                </Typography.Text>
                            </Flex>
                        }
                    />
                </div>
            );
        }
        return (
            <Flex vertical gap={12} className={loading ? 'opacity-60 transition-opacity' : ''}>
                {items.map(item => (
                    <ItemCard
                        key={`${item.kind}:${item.id}`}
                        item={item}
                        onOpen={() => setTarget({ employeeId: item.employee.id, date: item.weekStart })}
                    />
                ))}
            </Flex>
        );
    };

    const waitingCount = items?.filter(i => i.waitingForYou).length ?? 0;

    return (
        <Flex vertical gap={16}>
            <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                <Segmented<QueueScope>
                    value={queueScope}
                    onChange={v => setQueueScope(v)}
                    options={[
                        { label: 'Waiting for you', value: 'waiting' },
                        { label: 'All requests', value: 'all' },
                    ]}
                />
                {items && items.length > 0 && (
                    <Flex gap={8} align="center">
                        <Typography.Text type="secondary" className="text-sm">
                            {queueScope === 'waiting' ? `${waitingCount} waiting` : `${items.length} in total`}
                        </Typography.Text>
                        <Button size="small" onClick={refresh} loading={loading}>
                            Refresh
                        </Button>
                    </Flex>
                )}
            </Flex>
            {renderList()}
            <TimesheetReviewDrawer
                target={target}
                onClose={() => setTarget(null)}
                onDecided={() => {
                    refresh();
                    onChanged?.();
                }}
            />
        </Flex>
    );
};

export default TimesheetApprovals;
