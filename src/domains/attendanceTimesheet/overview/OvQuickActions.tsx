// PROTOTYPE-SETUP (ESS design, Slice 2; Overview v4, Slice 3; Overview v5, Slice 2): section 6 — "Quick actions".
// The ESS dashboard's ServiceShortcutCard (96×96 #F9F6F5 tile, illustrated icon, title under it), title only, in
// this order: Attendance, Timesheet & Overtime (named by mode: "Attendance & Overtime" / "Timesheet & Overtime"),
// Leave, Reimbursements, Payslips, Documents, My profile. No separate Overtime tile (Overview v5).
// The tile stays 96×96; the icon is drawn at 78px. Titles wrap to 2 lines, centred.
// ≥1200px: every tile in one row, spread evenly (6, or 5 in 'none' mode); 576–1199px: 3 per row; phones: 2 per row.
// PROTOTYPE-SETUP (My team: overview entry points): for someone with direct reports, a 7th tile "My team" after My
// profile (still one row on desktop), with a badge of what's waiting for them (none at zero); it opens My team →
// Approvals. Icon: myTeam.svg, drawn for this in the same illustrated style (there was no team icon).
import { Grid } from 'antd';

import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';
import AttendanceIcon from '@src/domains/employee/assets/icons/attendance.svg';
import DocumentsIcon from '@src/domains/employee/assets/icons/documents.svg';
import LeaveIcon from '@src/domains/employee/assets/icons/leave.svg';
import PayslipsIcon from '@src/domains/employee/assets/icons/myPay.svg';
import ProfileIcon from '@src/domains/employee/assets/icons/myProfile.svg';
import TeamIcon from '@src/domains/employee/assets/icons/myTeam.svg';
import ReimbursementIcon from '@src/domains/employee/assets/icons/reimbursement.svg';
import ServiceShortcutCard from '@src/domains/employee/components/dashboard/ServiceShortcutCard';
import { hasTracking } from '@src/prototype/rules/attendance';

import type { AtsMode } from '../types';

export type QuickActionKey = 'section' | 'leave' | 'reimbursements' | 'payslips' | 'documents' | 'profile' | 'team';

/** The first tile's name follows the mode. */
export const sectionTileTitle = (mode: AtsMode) => {
    if (mode === 'attendance') return 'Attendance & Overtime';
    if (mode === 'timesheet') return 'Timesheet & Overtime';
    return 'Attendance, Timesheet & Overtime';
};

const ICON_SIZE = 78;

/** The title box: wider than the tile for long names (and for every tile in the 7-tile row). */
const titleBox = (key: QuickActionKey, compact: boolean) => {
    if (compact) return key === 'section' ? '-mx-[25px] w-[130px] break-normal' : '-mx-[19px] w-[118px] break-normal';
    return key === 'section' ? '-mx-[26px] w-[148px]' : '';
};

const OvQuickActions = ({
    mode,
    to,
    myTeam = null,
    className = '',
}: {
    mode: AtsMode;
    to: Record<QuickActionKey, string>;
    /** Someone with direct reports: what's waiting for them (null = no My team tile). */
    myTeam?: { waiting: number } | null;
    className?: string;
}) => {
    const allTiles: { key: QuickActionKey; icon: string; title: string; count?: string }[] = [
        { key: 'section', icon: AttendanceIcon, title: sectionTileTitle(mode) },
        { key: 'leave', icon: LeaveIcon, title: 'Leave' },
        { key: 'reimbursements', icon: ReimbursementIcon, title: 'Reimbursements' },
        { key: 'payslips', icon: PayslipsIcon, title: 'Payslips' },
        { key: 'documents', icon: DocumentsIcon, title: 'Documents' },
        { key: 'profile', icon: ProfileIcon, title: 'My profile' },
        ...(myTeam ? [{ key: 'team' as const, icon: TeamIcon, title: 'My team', ...(myTeam.waiting ? { count: String(myTeam.waiting) } : {}) }] : []),
    ];
    // PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode tracks nothing — no section tile.
    const tiles = hasTracking(mode) ? allTiles : allTiles.filter(t => t.key !== 'section');
    // Seven tiles (a manager) in one desktop row: 80px tiles and a 118px title box (overhanging the 80px tile), so
    // every title wraps by words to 2 lines; tablet and phone wrap as before.
    const screens = Grid.useBreakpoint();
    const compact = tiles.length > 6 && Boolean(screens.xl);
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
                            iconSize={compact ? 64 : ICON_SIZE}
                            count={t.count}
                            compact={compact}
                            titleClassName={titleBox(t.key, compact)}
                        />
                    </div>
                ))}
            </div>
        </EssCard>
    );
};

export default OvQuickActions;
