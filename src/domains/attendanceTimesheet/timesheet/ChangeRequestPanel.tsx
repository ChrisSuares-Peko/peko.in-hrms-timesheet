// PROTOTYPE-SETUP: ESS Service 1 — a week's change request: the pending one with "What changed", its reason
// and (for the employee) "Cancel request"; or the decision on the latest one.
import { ClockCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Popconfirm } from 'antd';

import { fmtDate } from '../components/format';
import type { ChangeRequest } from '../types';
import ChangeDiff from './ChangeDiff';
import type { TimesheetPerspective } from './helpers';

export interface ChangeRequestPanelProps {
    cr: ChangeRequest;
    perspective: TimesheetPerspective;
    busy?: boolean;
    /** Employee only. */
    onCancel?: () => void;
}

const ChangeRequestPanel = ({ cr, perspective, busy, onCancel }: ChangeRequestPanelProps) => {
    const employee = perspective === 'employee';
    if (cr.status !== 'PENDING') {
        const approved = cr.status === 'APPROVED';
        const by = cr.decision ? ` by ${cr.decision.by.name} on ${fmtDate(cr.decision.at)}` : '';
        return (
            <Alert
                type={approved ? 'success' : 'error'}
                showIcon
                message={`${employee ? 'Your last change request' : 'The last change request'} was ${
                    approved ? 'approved' : 'rejected'
                }${by}`}
                description={
                    <div className="flex flex-col gap-0.5">
                        {cr.decision?.comment && (
                            <span className="break-words text-gray-900">“{cr.decision.comment}”</span>
                        )}
                        {!approved && (
                            <span className="text-xs text-gray-600">The approved version of the week stays.</span>
                        )}
                    </div>
                }
            />
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-solid border-amber-300 bg-amber-50/50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        <ClockCircleOutlined className="text-amber-500" />
                        Change request pending{employee ? ' with your manager' : ''}
                    </span>
                    <span className="text-xs text-gray-500">Requested on {fmtDate(cr.requestedAt)}</span>
                </div>
                {onCancel && (
                    <Popconfirm
                        title="Cancel this change request?"
                        description="The approved week stays as it is."
                        okText="Cancel request"
                        cancelText="Keep it"
                        onConfirm={onCancel}
                    >
                        <Button size="small" danger loading={busy}>
                            Cancel request
                        </Button>
                    </Popconfirm>
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-500">Reason</span>
                <span className="break-words text-sm text-gray-900">“{cr.reason}”</span>
            </div>
            {cr.blockedReason && (
                <Alert type="warning" showIcon message="This change can't be approved" description={cr.blockedReason} />
            )}
            <div className="rounded-lg border border-solid border-gray-200 bg-white p-2.5">
                <ChangeDiff base={cr.baseEntries} proposed={cr.proposedEntries} />
            </div>
            {employee && (
                <span className="text-xs text-gray-500">
                    The approved version stays on record until your manager decides. Starting a new request
                    replaces this one.
                </span>
            )}
        </div>
    );
};

export default ChangeRequestPanel;
