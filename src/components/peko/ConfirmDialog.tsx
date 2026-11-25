// PROTOTYPE-SETUP (Leave fixes: confirmations): a small confirmation popup for actions that can't be taken back (Delete
// leave type, Remove holiday, Withdraw request). Title as a question ("Delete Paternity?"), one short paragraph saying
// what happens, and two buttons: Cancel and the action itself, named after it ("Delete leave type") and red when it's
// destructive. The platform's ConfirmationModal (src/components/molecular/modals) has Yes / No buttons, which the Peko One
// notes avoid, so this one is separate.
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Modal, Typography } from 'antd';

const { Text } = Typography;

const ConfirmDialog = ({
    open,
    title,
    confirm,
    danger = true,
    onConfirm,
    onClose,
    children,
    ...rest
}: {
    open: boolean;
    title: string;
    /** The action button's label, e.g. "Delete leave type". */
    confirm: string;
    danger?: boolean;
    /** Return false to keep the popup open (e.g. the call failed). */
    onConfirm: () => unknown;
    onClose: () => void;
    children?: ReactNode;
} & Record<`data-${string}`, unknown>) => {
    const [busy, setBusy] = useState(false);
    return (
        <Modal
            open={open}
            title={title}
            width={420}
            centered
            destroyOnHidden
            onCancel={onClose}
            okText={confirm}
            okButtonProps={{ danger, loading: busy, ...({ 'data-confirm-ok': true } as Record<string, unknown>) }}
            cancelText="Cancel"
            onOk={async () => {
                setBusy(true);
                const ok = await onConfirm();
                setBusy(false);
                if (ok !== false) onClose();
            }}
        >
            <div data-confirm-dialog {...rest}>
                {children && <Text className="text-sm text-[var(--peko-text-2)]">{children}</Text>}
            </div>
        </Modal>
    );
};

export default ConfirmDialog;
