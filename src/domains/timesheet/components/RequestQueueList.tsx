// PROTOTYPE-SETUP: a queue of two-level requests (overtime, leave, reimbursement, attendance disputes) with
// approve / reject. Used by ESS - Manager (level 1) and Payroll HR / Finance (level 2).
import { useState } from 'react';

import { Button, Card, Empty, Flex, List, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import type { ApprovalQueueItem } from '../types';
import { displayTime } from '../utils';
import DecisionModal from './DecisionModal';
import TrailSteps from './TrailSteps';

const { Text } = Typography;

const LABEL: Record<ApprovalQueueItem['component'], string> = {
    attendance: 'Attendance',
    overtime: 'Overtime',
    leave: 'Leave',
    reimbursement: 'Reimbursement',
};

type RequestQueueListProps = {
    items: ApprovalQueueItem[];
    loading?: boolean;
    /** Show the employee's manager (Payroll queues). */
    showManager?: boolean;
    emptyText: string;
    /** e.g. (item) => "Approving moves it to Finance." */
    approveHint?: (item: ApprovalQueueItem) => string | undefined;
    onDecide: (item: ApprovalQueueItem, approve: boolean, comment: string) => Promise<boolean>;
};

const RequestQueueList = ({
    items,
    loading,
    showManager,
    emptyText,
    approveHint,
    onDecide,
}: RequestQueueListProps) => {
    const [pending, setPending] = useState<{ item: ApprovalQueueItem; approve: boolean } | null>(
        null
    );
    const [busy, setBusy] = useState(false);

    return (
        <>
            <List
                loading={loading}
                dataSource={items}
                locale={{
                    emptyText: (
                        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ),
                }}
                renderItem={item => (
                    <Card size="small" className="mb-3">
                        <Flex justify="space-between" align="start" gap={12} wrap="wrap">
                            <Flex vertical gap={4} className="min-w-0 flex-1">
                                <Flex gap={8} align="center" wrap="wrap">
                                    <Text strong>{item.employee.name}</Text>
                                    <Text type="secondary" className="text-xs">
                                        {item.employee.employeeId} · {item.employee.designation}
                                        {showManager && item.manager
                                            ? ` · Manager: ${item.manager.name}`
                                            : ''}
                                    </Text>
                                    <Tag>{LABEL[item.component]}</Tag>
                                </Flex>
                                <Text>
                                    <Text strong>{item.title}</Text> · {item.detail}
                                </Text>
                                {item.notes && (
                                    <Text type="secondary" className="text-xs">
                                        “{item.notes}”
                                    </Text>
                                )}
                                {!!item.timesheetEntries?.length && (
                                    <Text type="secondary" className="text-xs">
                                        Logged outside the window:{' '}
                                        {item.timesheetEntries
                                            .map(
                                                e =>
                                                    `${displayTime(e.start)}–${displayTime(e.end)} ${e.description}`
                                            )
                                            .join('; ')}
                                    </Text>
                                )}
                                <Flex gap={12} align="center" wrap="wrap">
                                    <TrailSteps trail={item.trail} />
                                    <Text type="secondary" className="text-xs">
                                        Requested {dayjs(item.at).format('D MMM, h:mm A')}
                                    </Text>
                                </Flex>
                            </Flex>
                            <Flex gap={8}>
                                <Button onClick={() => setPending({ item, approve: false })}>
                                    Reject
                                </Button>
                                <Button
                                    type="primary"
                                    onClick={() => setPending({ item, approve: true })}
                                >
                                    Approve
                                </Button>
                            </Flex>
                        </Flex>
                    </Card>
                )}
            />
            <DecisionModal
                open={!!pending}
                approve={!!pending?.approve}
                subject={
                    pending
                        ? `${pending.item.employee.name}'s ${LABEL[pending.item.component].toLowerCase()} request (${pending.item.title})`
                        : ''
                }
                hint={pending?.approve ? approveHint?.(pending.item) : undefined}
                busy={busy}
                onCancel={() => setPending(null)}
                onConfirm={async comment => {
                    if (!pending) return;
                    setBusy(true);
                    const ok = await onDecide(pending.item, pending.approve, comment);
                    setBusy(false);
                    if (ok) setPending(null);
                }}
            />
        </>
    );
};

export default RequestQueueList;
