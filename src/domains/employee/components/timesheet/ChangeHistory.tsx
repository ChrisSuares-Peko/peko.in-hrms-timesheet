// PROTOTYPE-SETUP: who changed what and when, newest first.
import { Card, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';

import type { HistoryAction, HistoryEvent } from '@src/domains/timesheet/types';

const { Text } = Typography;

const LABEL: Record<HistoryAction, string> = {
    ENTRY_ADDED: 'Added an entry',
    ENTRY_EDITED: 'Edited an entry',
    ENTRY_DELETED: 'Deleted an entry',
    SUBMITTED: 'Submitted the week',
    AUTO_SUBMITTED: 'Auto-submitted',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CHANGE_REQUESTED: 'Requested a change',
    CHANGE_APPROVED: 'Approved the change',
    CHANGE_REJECTED: 'Rejected the change',
};

const COLOR: Partial<Record<HistoryAction, string>> = {
    APPROVED: 'green',
    CHANGE_APPROVED: 'green',
    REJECTED: 'red',
    CHANGE_REJECTED: 'red',
    CHANGE_REQUESTED: 'orange',
    SUBMITTED: 'blue',
    AUTO_SUBMITTED: 'blue',
};

const ChangeHistory = ({ history }: { history: HistoryEvent[] }) => (
    <Card size="small" title="Change history">
        {history.length ? (
            <Timeline
                className="!mt-2"
                items={[...history].reverse().map((h, i) => ({
                    key: `${h.at}-${i}`,
                    color: COLOR[h.action] ?? 'gray',
                    children: (
                        <>
                            <Text className="text-xs">
                                <Text strong className="text-xs">
                                    {h.actor.name}
                                </Text>{' '}
                                · {LABEL[h.action]}
                            </Text>
                            <br />
                            <Text type="secondary" className="text-xs">
                                {dayjs(h.at).format('D MMM YYYY, h:mm A')}
                            </Text>
                            {h.detail && (
                                <>
                                    <br />
                                    <Text className="text-xs break-words">{h.detail}</Text>
                                </>
                            )}
                        </>
                    ),
                }))}
            />
        ) : (
            <Text type="secondary" className="text-xs">
                No changes yet this week.
            </Text>
        )}
    </Card>
);

export default ChangeHistory;
