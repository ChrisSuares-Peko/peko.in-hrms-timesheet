// PROTOTYPE-SETUP: the staged Change Request for an approved week — summary, reason, submit or discard.
import { Alert, Button, Flex, Typography } from 'antd';

import type { TimesheetEntry } from '@src/domains/timesheet/types';
import { diffEntries, diffSummary } from '@src/domains/timesheet/utils';

type ChangeRequestBarProps = {
    reason: string;
    base: TimesheetEntry[];
    draft: TimesheetEntry[];
    busy?: boolean;
    onEditReason: () => void;
    onDiscard: () => void;
    onSubmit: () => void;
};

const ChangeRequestBar = ({
    reason,
    base,
    draft,
    busy,
    onEditReason,
    onDiscard,
    onSubmit,
}: ChangeRequestBarProps) => {
    const diff = diffEntries(base, draft);
    const hasChanges = diff.added.length + diff.edited.length + diff.removed.length > 0;
    return (
        <Alert
            type="warning"
            showIcon
            message={`Change request draft · ${diffSummary(diff)}`}
            description={
                <Flex vertical gap={8}>
                    <Typography.Text className="text-xs">
                        Reason: “{reason}”{' '}
                        <Button type="link" size="small" className="px-1" onClick={onEditReason}>
                            Edit reason
                        </Button>
                    </Typography.Text>
                    <Flex gap={8} wrap="wrap">
                        <Button
                            type="primary"
                            size="small"
                            loading={busy}
                            disabled={!hasChanges}
                            onClick={onSubmit}
                        >
                            Submit for approval
                        </Button>
                        <Button size="small" onClick={onDiscard}>
                            Discard changes
                        </Button>
                    </Flex>
                </Flex>
            }
        />
    );
};

export default ChangeRequestBar;
