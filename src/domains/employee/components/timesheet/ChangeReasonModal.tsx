// PROTOTYPE-SETUP: editing an approved week starts a Change Request — ask for the (required) reason first.
import { useEffect, useState } from 'react';

import { Input, Modal, Typography } from 'antd';

type ChangeReasonModalProps = {
    open: boolean;
    initialReason?: string;
    /** True when a Change Request is already pending (further edits update it). */
    updatingPending?: boolean;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
};

const ChangeReasonModal = ({
    open,
    initialReason,
    updatingPending,
    onConfirm,
    onCancel,
}: ChangeReasonModalProps) => {
    const [reason, setReason] = useState(initialReason ?? '');
    const [touched, setTouched] = useState(false);
    useEffect(() => {
        if (open) {
            setReason(initialReason ?? '');
            setTouched(false);
        }
    }, [open, initialReason]);
    const missing = !reason.trim();

    return (
        <Modal
            open={open}
            title={updatingPending ? 'Update your change request' : 'This week is approved'}
            okText="Continue editing"
            onOk={() => {
                setTouched(true);
                if (!missing) onConfirm(reason.trim());
            }}
            onCancel={onCancel}
        >
            <Typography.Paragraph className="text-sm">
                {updatingPending
                    ? 'Your earlier change request is still with your manager. Further edits update that request.'
                    : 'Edits to an approved week are sent to your manager as a change request. Until it is approved, the approved version stays on record; if it is rejected, the week goes back to the approved version.'}
            </Typography.Paragraph>
            <Typography.Text strong>Reason for the change (required)</Typography.Text>
            <Input.TextArea
                className="mt-1"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Forgot to log Thursday's client call"
                status={touched && missing ? 'error' : undefined}
                aria-label="Reason for the change"
            />
            {touched && missing && (
                <Typography.Text type="danger" className="text-xs">
                    Please enter a reason.
                </Typography.Text>
            )}
        </Modal>
    );
};

export default ChangeReasonModal;
