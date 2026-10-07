// PROTOTYPE-SETUP: ESS Service 1 — send a change request for an approved week: "What changed" preview and a
// required reason. The tab sends the full proposed week.
import { useEffect, useState } from 'react';

import { Alert, Input, Modal, Typography } from 'antd';

import { diffEntries, datesTouched } from '@src/prototype/rules/attendance';

import type { TimesheetEntry } from '../types';
import ChangeDiff from './ChangeDiff';

export interface SendChangeModalProps {
    open: boolean;
    base: TimesheetEntry[];
    proposed: TimesheetEntry[];
    /** A pending request exists and will be replaced. */
    replacing?: boolean;
    managerName?: string | null;
    busy?: boolean;
    /** Resolve true when sent (the modal closes). */
    onSend: (reason: string) => Promise<boolean>;
    onClose: () => void;
}

const SendChangeModal = ({
    open,
    base,
    proposed,
    replacing,
    managerName,
    busy,
    onSend,
    onClose,
}: SendChangeModalProps) => {
    const [reason, setReason] = useState('');
    const [attempted, setAttempted] = useState(false);
    const changed = datesTouched(diffEntries(base, proposed)).length > 0;

    useEffect(() => {
        if (open) setAttempted(false);
    }, [open]);

    const send = async () => {
        setAttempted(true);
        if (!reason.trim() || !changed) return;
        const ok = await onSend(reason.trim());
        if (ok) setReason('');
    };

    return (
        <Modal
            open={open}
            title="Send change request"
            okText="Send request"
            onOk={send}
            onCancel={onClose}
            confirmLoading={busy}
            okButtonProps={{ disabled: !changed }}
            width={560}
        >
            <div className="flex flex-col gap-3">
                <span className="text-sm text-gray-600">
                    {managerName ?? 'Your manager'} will review the change. Until then, the approved week stays
                    as it is.
                </span>
                {replacing && (
                    <Alert type="warning" showIcon message="This replaces your pending change request." />
                )}
                <div className="rounded-lg border border-solid border-gray-200 p-2.5">
                    <ChangeDiff base={base} proposed={proposed} />
                </div>
                <div className="flex flex-col gap-1">
                    <span id="ts-change-reason-label" className="text-sm font-medium text-gray-900">
                        Reason for the change
                    </span>
                    <Input.TextArea
                        aria-labelledby="ts-change-reason-label"
                        rows={3}
                        maxLength={300}
                        showCount
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="e.g. I forgot to log the client call on Wednesday"
                        status={attempted && !reason.trim() ? 'error' : undefined}
                    />
                    {attempted && !reason.trim() && (
                        <Typography.Text type="danger" className="text-xs">
                            Add a reason for the change.
                        </Typography.Text>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default SendChangeModal;
