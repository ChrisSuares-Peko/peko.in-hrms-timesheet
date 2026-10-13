// PROTOTYPE-SETUP (ESS design, Slice 2): section 6 — "Quick actions". The ESS dashboard's ServiceShortcutCard
// (96×96 #F9F6F5 tile, illustrated icon, title under it), six tiles, title only, in this order: Attendance &
// Timesheet (named per mode), Leave, Reimbursements, Overtime (a new icon in the same illustrated style),
// Payslips, Documents. Each opens its page.
import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';
import AttendanceIcon from '@src/domains/employee/assets/icons/attendance.svg';
import DocumentsIcon from '@src/domains/employee/assets/icons/documents.svg';
import LeaveIcon from '@src/domains/employee/assets/icons/leave.svg';
import PayslipsIcon from '@src/domains/employee/assets/icons/myPay.svg';
import OvertimeIcon from '@src/domains/employee/assets/icons/overtime.svg';
import ReimbursementIcon from '@src/domains/employee/assets/icons/reimbursement.svg';
import ServiceShortcutCard from '@src/domains/employee/components/dashboard/ServiceShortcutCard';

export type QuickActionKey = 'section' | 'leave' | 'reimbursements' | 'overtime' | 'payslips' | 'documents';

const OvQuickActions = ({
    sectionTitle,
    to,
    className = '',
}: {
    /** "Attendance & Timesheet" / "Attendance" / "Timesheet" (follows the mode). */
    sectionTitle: string;
    to: Record<QuickActionKey, string>;
    className?: string;
}) => {
    const tiles: { key: QuickActionKey; icon: string; title: string }[] = [
        { key: 'section', icon: AttendanceIcon, title: sectionTitle },
        { key: 'leave', icon: LeaveIcon, title: 'Leave' },
        { key: 'reimbursements', icon: ReimbursementIcon, title: 'Reimbursements' },
        { key: 'overtime', icon: OvertimeIcon, title: 'Overtime' },
        { key: 'payslips', icon: PayslipsIcon, title: 'Payslips' },
        { key: 'documents', icon: DocumentsIcon, title: 'Documents' },
    ];
    return (
        <EssCard label="Quick actions" heading={<EssSectionHeading title="Quick actions" />} className={className}>
            {/* PROTOTYPE-SETUP (Overview v4, Slice 1): at a fixed height the tiles sit in the middle of the spare space. */}
            <div className="grid grid-cols-3 content-center justify-items-center gap-x-2 gap-y-4 sm:grid-cols-6 xl:flex-1">
                {tiles.map(t => (
                    <div key={t.key} className="flex min-w-0 justify-center" data-quick-action={t.key}>
                        <ServiceShortcutCard icon={t.icon} title={t.title} path={to[t.key]} iconSize={48} />
                    </div>
                ))}
            </div>
        </EssCard>
    );
};

export default OvQuickActions;
