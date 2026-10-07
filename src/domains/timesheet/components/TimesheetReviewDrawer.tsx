// PROTOTYPE-SETUP: one employee's week, read-only — for the manager's review (with approve / reject) and for
// Payroll's view-only access. A Change Request shows the change view first, with a toggle for the full week.
import { useState } from 'react';

import { Alert, Button, Drawer, Flex, Skeleton, Switch, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import ChangeHistory from '@src/domains/employee/components/timesheet/ChangeHistory';
import DayRow from '@src/domains/employee/components/timesheet/DayRow';
import HoursSummaryCard from '@src/domains/employee/components/timesheet/HoursSummaryCard';
import useScreenSize from '@src/hooks/useScreenSize';

import type { TimesheetWeekView } from '../types';
import { addDaysIso, diffEntries } from '../utils';
import ChangeView from './ChangeView';
import DecisionModal from './DecisionModal';

const { Text } = Typography;

const STATUS_COLOR = {
    DRAFT: 'default',
    SUBMITTED: 'processing',
    APPROVED: 'success',
    REJECTED: 'error',
} as const;

type TimesheetReviewDrawerProps = {
    open: boolean;
    view: TimesheetWeekView | null;
    loading?: boolean;
    /** Reviewing a Change Request (vs. a submitted week). */
    reviewingChange?: boolean;
    /** Omit for view-only (Payroll). */
    onDecide?: (approve: boolean, comment: string) => Promise<boolean>;
    onClose: () => void;
};

const noop = () => false;

const decisionHint = (approve: boolean, change: boolean) => {
    if (change) {
        return approve
            ? 'The change becomes the approved version.'
            : 'The week goes back to its last approved version.';
    }
    return approve
        ? "The manager's approval is final for timesheets."
        : 'It goes back to the employee to fix and resubmit.';
};

const TimesheetReviewDrawer = ({
    open,
    view,
    loading,
    reviewingChange,
    onDecide,
    onClose,
}: TimesheetReviewDrawerProps) => {
    const { md } = useScreenSize();
    const [showFull, setShowFull] = useState(false);
    const [decision, setDecision] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);

    const cr = view?.changeRequest?.status === 'PENDING' ? view.changeRequest : null;
    const showChange = reviewingChange && cr;
    const marks =
        cr && view
            ? (() => {
                  const diff = diffEntries(cr.baseEntries, cr.proposedEntries);
                  return new Map<string, 'added' | 'edited'>([
                      ...diff.added.map(e => [e.id, 'added'] as [string, 'added']),
                      ...diff.edited.map(e => [e.after.id, 'edited'] as [string, 'edited']),
                  ]);
              })()
            : undefined;
    const subject = view
        ? `${view.employee.name}'s ${showChange ? 'change request' : 'timesheet'} for ${dayjs(view.week.weekStart).format('D MMM')} – ${dayjs(addDaysIso(view.week.weekStart, 6)).format('D MMM')}`
        : '';

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={md ? 760 : '100%'}
            title={
                view ? (
                    <Flex gap={8} align="center" wrap="wrap">
                        <span>{view.employee.name}</span>
                        <Text type="secondary" className="text-xs font-normal">
                            {view.employee.employeeId} · week of{' '}
                            {dayjs(view.week.weekStart).format('D MMM YYYY')}
                        </Text>
                        <Tag color={STATUS_COLOR[view.week.status]}>
                            {view.week.status.toLowerCase()}
                        </Tag>
                        {cr && <Tag color="warning">change pending</Tag>}
                    </Flex>
                ) : (
                    'Timesheet'
                )
            }
            footer={
                onDecide && view ? (
                    <Flex justify="end" gap={8}>
                        <Button onClick={() => setDecision(false)}>Reject</Button>
                        <Button type="primary" onClick={() => setDecision(true)}>
                            Approve
                        </Button>
                    </Flex>
                ) : undefined
            }
        >
            {loading || !view ? (
                <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
                <Flex vertical gap={16}>
                    {view.windows.some(w => w.locked) && (
                        <Alert
                            type="warning"
                            showIcon
                            message={view.windows.find(w => w.locked)?.lockReason}
                        />
                    )}
                    {showChange && cr && (
                        <>
                            <ChangeView changeRequest={cr} />
                            <Flex gap={8} align="center">
                                <Switch
                                    size="small"
                                    checked={showFull}
                                    onChange={setShowFull}
                                    aria-label="Show full timesheet"
                                />
                                <Text className="text-xs">
                                    Show the full timesheet with the change applied
                                </Text>
                            </Flex>
                        </>
                    )}
                    {(!showChange || showFull) && (
                        <Flex vertical gap={10}>
                            <HoursSummaryCard windows={view.windows} entries={view.week.entries} />
                            {view.windows.map(w => (
                                <DayRow
                                    key={w.date}
                                    window={w}
                                    entries={view.week.entries}
                                    editable={false}
                                    hideActions
                                    marks={showChange ? marks : undefined}
                                    isFuture={false}
                                    onAdd={noop}
                                    onUpdate={noop}
                                    onDelete={noop}
                                    onRequestOvertime={noop}
                                />
                            ))}
                            <ChangeHistory history={view.week.history} />
                        </Flex>
                    )}
                </Flex>
            )}
            <DecisionModal
                open={decision !== null}
                approve={!!decision}
                subject={subject}
                hint={decisionHint(!!decision, !!showChange)}
                busy={busy}
                onCancel={() => setDecision(null)}
                onConfirm={async comment => {
                    if (!onDecide || decision === null) return;
                    setBusy(true);
                    const ok = await onDecide(decision, comment);
                    setBusy(false);
                    if (ok) {
                        setDecision(null);
                        onClose();
                    }
                }}
            />
        </Drawer>
    );
};

export default TimesheetReviewDrawer;
