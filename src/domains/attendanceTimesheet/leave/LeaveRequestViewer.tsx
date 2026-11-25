// PROTOTYPE-SETUP (Leave fixes — notes ess:team:approvals / pay:leave:requests / pay:leave:leaves → "View"): every leave,
// cancellation, change and comp off request has a View button that opens the request drawer read-only (details,
// attached document, approval chain, history). Approvers in My team load the employee's leave through
// team/members/:id/leave; HR in Payroll through payroll/admin/leave/:id. "View the leave" inside the drawer still works.
import { useEffect, useState } from 'react';

import { Button } from 'antd';

import LeaveRequestDrawer, { type DrawerActions, type DrawerItem } from './LeaveRequestDrawer';
import { getAdminLeaveView, getTeamMemberLeaveView } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import { usePayrollScope } from '../payroll/usePayrollAts';
import type { LeaveView, RequestItem } from '../types';

export type ViewerSource = 'team' | 'admin';

const noop = async () => undefined;

/** The drawer, read-only, for someone else's request. */
const LeaveRequestViewer = ({ source, employeeId, item, onClose }: { source: ViewerSource; employeeId: number | null; item: DrawerItem | null; onClose: () => void }) => {
    const payroll = usePayrollScope();
    const team = useAtsScope();
    const [view, setView] = useState<LeaveView | null>(null);
    const [current, setCurrent] = useState<DrawerItem | null>(item);
    useEffect(() => setCurrent(item), [item]);
    useEffect(() => {
        let live = true;
        setView(null);
        if (!item || employeeId == null) return undefined;
        (source === 'admin' ? getAdminLeaveView(payroll, employeeId) : getTeamMemberLeaveView(team, employeeId)).then(v => {
            if (live && v) setView(v);
        });
        return () => {
            live = false;
        };
    }, [source, employeeId, item, payroll, team]);
    if (!view || !current) return null;
    const actions: DrawerActions = {
        onEdit: noop,
        onWithdraw: noop,
        onChange: noop,
        onCancel: noop,
        onEditCancel: noop,
        onEditChange: noop,
        onEditCompOff: noop,
        onOpen: setCurrent,
    };
    return <LeaveRequestDrawer view={view} item={current} onClose={onClose} actions={actions} readOnly />;
};

/** The drawer item behind a request row (leave, cancellation, change or comp off). */
export const drawerItemOf = (r: Pick<RequestItem, 'leaveKind' | 'id'>): DrawerItem | null => {
    if (!r.leaveKind) return null;
    return { kind: r.leaveKind, id: r.id };
};

/** A row's "View" button plus its drawer. */
export const ViewRequestButton = ({ source, employeeId, item, size = 'small' }: { source: ViewerSource; employeeId: number; item: DrawerItem; size?: 'small' | 'middle' }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button size={size} type="text" onClick={() => setOpen(true)} data-view-request={`${item.kind}:${item.id}`}>
                View
            </Button>
            <LeaveRequestViewer source={source} employeeId={employeeId} item={open ? item : null} onClose={() => setOpen(false)} />
        </>
    );
};

export default LeaveRequestViewer;
