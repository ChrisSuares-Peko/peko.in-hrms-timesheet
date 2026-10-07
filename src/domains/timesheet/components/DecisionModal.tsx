// PROTOTYPE-SETUP: approve / reject confirmation. A comment is required to reject (it goes back to the
// employee); optional when approving.
import { useEffect, useState } from 'react';

import { Input, Modal, Typography } from 'antd';

type DecisionModalProps = {
    open: boolean;
    approve: boolean;
    /** e.g. "Sneha Iyer's timesheet for 28 Sep – 4 Oct" */
    subject: string;
    /** e.g. "Approving moves it to Finance." */
    hint?: string;
    busy?: boolean;
    onConfirm: (comment: string) => void;
    onCancel: () => void;
};

const DecisionModal = ({
    open,
    approve,
    subject,
    hint,
    busy,
    onConfirm,
    onCancel,
}: DecisionModalProps) => {
    const [comment, setComment] = useState('');
    const [touched, setTouched] = useState(false);
    useEffect(() => {
        if (open) {
            setComment('');
            setTouched(false);
        }
    }, [open]);
    const missing = !approve && !comment.trim();

    return (
        <Modal
            open={open}
            title={approve ? 'Approve' : 'Reject'}
            okText={approve ? 'Approve' : 'Reject'}
            okButtonProps={{ danger: !approve, loading: busy }}
            onOk={() => {
                setTouched(true);
                if (!missing) onConfirm(comment.trim());
            }}
            onCancel={onCancel}
        >
            <Typography.Paragraph className="text-sm">
                {approve ? 'Approve' : 'Reject'} {subject}?{hint ? ` ${hint}` : ''}
            </Typography.Paragraph>
            <Typography.Text strong>
                Comment {approve ? '(optional)' : '(required — sent back to the employee)'}
            </Typography.Text>
            <Input.TextArea
                className="mt-1"
                rows={3}
                maxLength={300}
                value={comment}
                onChange={e => setComment(e.target.value)}
                status={touched && missing ? 'error' : undefined}
                aria-label="Comment"
            />
            {touched && missing && (
                <Typography.Text type="danger" className="text-xs">
                    Please explain why it is rejected.
                </Typography.Text>
            )}
        </Modal>
    );
};

export default DecisionModal;
