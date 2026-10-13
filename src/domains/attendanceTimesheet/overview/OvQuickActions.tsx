// PROTOTYPE-SETUP (ESS design, Slice 2; Overview v4, Slice 3): section 6 — "Quick actions". The ESS dashboard's
// ServiceShortcutCard (96×96 #F9F6F5 tile, illustrated icon, title under it), title only, in this order:
//   Attendance, Timesheet & Overtime (named by mode: "Attendance & Overtime" / "Timesheet & Overtime"), Leave,
//   Reimbursements, Overtime (an icon in the same illustrated style), Payslips, Documents, My profile.
// The tile stays 96×96; the icon is drawn at 78px so it fills most of the tile. Titles wrap to 2 lines, centred.
// Four per row from 576px (a row of 4, then 3 centred) so the longest title fits in 2 lines; two per row on phones.
import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';
import AttendanceIcon from '@src/domains/employee/assets/icons/attendance.svg';
import DocumentsIcon from '@src/domains/employee/assets/icons/documents.svg';
import LeaveIcon from '@src/domains/employee/assets/icons/leave.svg';
import PayslipsIcon from '@src/domains/employee/assets/icons/myPay.svg';
import ProfileIcon from '@src/domains/employee/assets/icons/myProfile.svg';
import OvertimeIcon from '@src/domains/employee/assets/icons/overtime.svg';
import ReimbursementIcon from '@src/domains/employee/assets/icons/reimbursement.svg';
import ServiceShortcutCard from '@src/domains/employee/components/dashboard/ServiceShortcutCard';

import type { AtsMode } from '../types';

export type QuickActionKey = 'section' | 'leave' | 'reimbursements' | 'overtime' | 'payslips' | 'documents' | 'profile';

/** The first tile's name follows the mode. */
export const sectionTileTitle = (mode: AtsMode) => {
    if (mode === 'attendance') return 'Attendance & Overtime';
    if (mode === 'timesheet') return 'Timesheet & Overtime';
    return 'Attendance, Timesheet & Overtime';
};

const ICON_SIZE = 78;

const OvQuickActions = ({ mode, to, className = '' }: { mode: AtsMode; to: Record<QuickActionKey, string>; className?: string }) => {
    const tiles: { key: QuickActionKey; icon: string; title: string }[] = [
        { key: 'section', icon: AttendanceIcon, title: sectionTileTitle(mode) },
        { key: 'leave', icon: LeaveIcon, title: 'Leave' },
        { key: 'reimbursements', icon: ReimbursementIcon, title: 'Reimbursements' },
        { key: 'overtime', icon: OvertimeIcon, title: 'Overtime' },
        { key: 'payslips', icon: PayslipsIcon, title: 'Payslips' },
        { key: 'documents', icon: DocumentsIcon, title: 'Documents' },
        { key: 'profile', icon: ProfileIcon, title: 'My profile' },
    ];
    return (
        <EssCard label="Quick actions" heading={<EssSectionHeading title="Quick actions" />} className={className}>
            {/* At a fixed height (≥1200px) the rows sit in the middle of the spare space. */}
            <div className="flex flex-wrap content-center justify-center gap-y-4 xl:flex-1">
                {tiles.map(t => (
                    <div key={t.key} className="flex w-1/2 min-w-0 items-start justify-center px-1 sm:w-1/4" data-quick-action={t.key}>
                        <ServiceShortcutCard icon={t.icon} title={t.title} path={to[t.key]} iconSize={ICON_SIZE} />
                    </div>
                ))}
            </div>
        </EssCard>
    );
};

export default OvQuickActions;
