// PROTOTYPE-SETUP (ESS design, Slice 2; Overview v4, Slice 3; Overview v5, Slice 2): section 6 — "Quick actions".
// The ESS dashboard's ServiceShortcutCard (96×96 #F9F6F5 tile, illustrated icon, title under it), title only, in
// this order: Attendance, Timesheet & Overtime (named by mode: "Attendance & Overtime" / "Timesheet & Overtime"),
// Leave, Reimbursements, Payslips, Documents, My profile. No separate Overtime tile (Overview v5).
// The tile stays 96×96; the icon is drawn at 78px. Titles wrap to 2 lines, centred.
// ≥1200px: every tile in one row, spread evenly (6, or 5 in 'none' mode); 576–1199px: 3 per row; phones: 2 per row.
import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';
import AttendanceIcon from '@src/domains/employee/assets/icons/attendance.svg';
import DocumentsIcon from '@src/domains/employee/assets/icons/documents.svg';
import LeaveIcon from '@src/domains/employee/assets/icons/leave.svg';
import PayslipsIcon from '@src/domains/employee/assets/icons/myPay.svg';
import ProfileIcon from '@src/domains/employee/assets/icons/myProfile.svg';
import ReimbursementIcon from '@src/domains/employee/assets/icons/reimbursement.svg';
import ServiceShortcutCard from '@src/domains/employee/components/dashboard/ServiceShortcutCard';
import { hasTracking } from '@src/prototype/rules/attendance';

import type { AtsMode } from '../types';

export type QuickActionKey = 'section' | 'leave' | 'reimbursements' | 'payslips' | 'documents' | 'profile';

/** The first tile's name follows the mode. */
export const sectionTileTitle = (mode: AtsMode) => {
    if (mode === 'attendance') return 'Attendance & Overtime';
    if (mode === 'timesheet') return 'Timesheet & Overtime';
    return 'Attendance, Timesheet & Overtime';
};

const ICON_SIZE = 78;

const OvQuickActions = ({ mode, to, className = '' }: { mode: AtsMode; to: Record<QuickActionKey, string>; className?: string }) => {
    const allTiles: { key: QuickActionKey; icon: string; title: string }[] = [
        { key: 'section', icon: AttendanceIcon, title: sectionTileTitle(mode) },
        { key: 'leave', icon: LeaveIcon, title: 'Leave' },
        { key: 'reimbursements', icon: ReimbursementIcon, title: 'Reimbursements' },
        { key: 'payslips', icon: PayslipsIcon, title: 'Payslips' },
        { key: 'documents', icon: DocumentsIcon, title: 'Documents' },
        { key: 'profile', icon: ProfileIcon, title: 'My profile' },
    ];
    // PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode tracks nothing — no section tile.
    const tiles = hasTracking(mode) ? allTiles : allTiles.filter(t => t.key !== 'section');
    return (
        <EssCard label="Quick actions" heading={<EssSectionHeading title="Quick actions" />} className={className}>
            {/* ≥1200px one row of equal columns (however many tiles); 3 per row from 576px; 2 on phones. */}
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-3 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">
                {tiles.map(t => (
                    <div key={t.key} className="flex min-w-0 items-start justify-center" data-quick-action={t.key}>
                        {/* The section tile's long name gets a 148px title box (overhanging its column) so it wraps to
                            2 lines; the tiles themselves stay evenly spaced. */}
                        <ServiceShortcutCard
                            icon={t.icon}
                            title={t.title}
                            path={to[t.key]}
                            iconSize={ICON_SIZE}
                            titleClassName={t.key === 'section' ? '-mx-[26px] w-[148px]' : ''}
                        />
                    </div>
                ))}
            </div>
        </EssCard>
    );
};

export default OvQuickActions;
