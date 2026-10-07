// PROTOTYPE-SETUP: what a Change Request changes — the employee's reason on top, then added entries (green),
// removed entries (red) and edited entries (old → new). Used by the manager and by Payroll's read-only view.
import { Flex, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import type { ChangeRequest, TimesheetEntry } from '../types';
import { diffEntries, displayTime } from '../utils';

const { Text } = Typography;

const when = (e: TimesheetEntry) =>
    `${dayjs(e.date).format('ddd D MMM')} · ${displayTime(e.start)}–${displayTime(e.end)}`;

const Line = ({
    entry,
    color,
    strike,
}: {
    entry: TimesheetEntry;
    color: string;
    strike?: boolean;
}) => (
    <Flex gap={8} wrap="wrap" className={`rounded-md px-2 py-1 ${color}`}>
        <Text className={`whitespace-nowrap tabular-nums ${strike ? 'line-through' : ''}`}>
            {when(entry)}
        </Text>
        <Text className={strike ? 'line-through' : ''}>{entry.description}</Text>
    </Flex>
);

const ChangeView = ({ changeRequest }: { changeRequest: ChangeRequest }) => {
    const diff = diffEntries(changeRequest.baseEntries, changeRequest.proposedEntries);
    return (
        <Flex vertical gap={12}>
            <Flex
                vertical
                gap={2}
                className="rounded-lg border border-solid border-amber-200 bg-amber-50 px-3 py-2"
            >
                <Text type="secondary" className="text-xs">
                    Employee&apos;s reason ·{' '}
                    {dayjs(changeRequest.requestedAt).format('D MMM, h:mm A')}
                </Text>
                <Text>“{changeRequest.reason}”</Text>
            </Flex>

            {diff.added.length > 0 && (
                <Flex vertical gap={4}>
                    <Tag color="green" className="self-start">
                        Added ({diff.added.length})
                    </Tag>
                    {diff.added.map(e => (
                        <Line
                            key={e.id}
                            entry={e}
                            color="bg-green-50 border border-solid border-green-200"
                        />
                    ))}
                </Flex>
            )}
            {diff.removed.length > 0 && (
                <Flex vertical gap={4}>
                    <Tag color="red" className="self-start">
                        Removed ({diff.removed.length})
                    </Tag>
                    {diff.removed.map(e => (
                        <Line
                            key={e.id}
                            entry={e}
                            color="bg-red-50 border border-solid border-red-200"
                            strike
                        />
                    ))}
                </Flex>
            )}
            {diff.edited.length > 0 && (
                <Flex vertical gap={4}>
                    <Tag color="blue" className="self-start">
                        Edited ({diff.edited.length})
                    </Tag>
                    {diff.edited.map(({ before, after }) => (
                        <Flex
                            key={after.id}
                            vertical
                            gap={2}
                            className="rounded-md border border-solid border-blue-200 bg-blue-50 px-2 py-1"
                        >
                            <Text type="secondary" className="text-xs line-through">
                                {when(before)} · {before.description}
                            </Text>
                            <Text>
                                → {when(after)} · {after.description}
                            </Text>
                        </Flex>
                    ))}
                </Flex>
            )}
        </Flex>
    );
};

export default ChangeView;
