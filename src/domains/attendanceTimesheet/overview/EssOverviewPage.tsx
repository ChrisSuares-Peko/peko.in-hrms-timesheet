// PROTOTYPE-SETUP (Overview, Slice 2; ESS design, Slice 2; Overview v4, Slices 1–2): the ESS - Employee
// Overview, at /ess-employee. ESS - Manager keeps the existing employee dashboard. Layout (overview.css):
//   ≥1200px  fixed section heights. Both modes: Profile | Attendance | Timesheet, then Quick actions + Recent days
//            (left 2/3) and Notifications (right 1/3). Attendance-only / Timesheet-only: Profile | Attendance (or
//            Timesheet) | Notifications, with Notifications running down the whole right column.
//   'none' (Overview v4, Slice 5): Profile spans columns 1–2 with Quick actions under it, no Recent days;
//            Notifications runs down the right column. Stacked: Profile, Quick actions, Notifications.
//   768–1199px  two columns, heights automatic. <768px  one column: Profile, Attendance, Timesheet, Quick actions,
//            Recent days, Notifications.
import { useCallback, useEffect, useState } from 'react';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Skeleton } from 'antd';

import './overview.css';
import { hasCheckIn, hasTimesheets, hasTracking } from '@src/prototype/rules/attendance';

import OvAttendanceCard from './OvAttendanceCard';
import OvNotifications from './OvNotifications';
import OvProfileCard from './OvProfileCard';
import OvQuickActions from './OvQuickActions';
import OvStatusTable from './OvStatusTable';
import OvTimesheetCard from './OvTimesheetCard';
import { getEssHome, getMyProfile, getOverview, getTimesheetWeek } from '../api';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import { todayIso } from '../timesheet/helpers';
import type { AtsOverview, EssHomeView, MyProfileView, OverviewLink, TimesheetWeekView } from '../types';

/** Recent days: heading, padding and table header, plus one row per day (rows fit a 2-line chip). */
const RD_CHROME = 148;
const RD_ROW = 70;

const EssOverviewPage = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const today = todayIso();
    const [profile, setProfile] = useState<MyProfileView | null>(null);
    const [overview, setOverview] = useState<AtsOverview | null>(null);
    const [week, setWeek] = useState<TimesheetWeekView | null>(null);
    const [home, setHome] = useState<EssHomeView | null>(null);
    const [failed, setFailed] = useState(false);

    // PROTOTYPE-SETUP (Overview, Slice 3): the table, notifications and shortcut summaries.
    const loadHome = useCallback(async () => {
        const h = await getEssHome(scope);
        if (h) setHome(h);
    }, [scope]);

    const loadWeek = useCallback(async () => {
        const w = await getTimesheetWeek(scope, today);
        if (w) setWeek(w);
    }, [scope, today]);

    const load = useCallback(async () => {
        setFailed(false);
        const [p, o] = await Promise.all([getMyProfile(scope), getOverview(scope), loadWeek(), loadHome()]);
        if (p) setProfile(p);
        if (o) setOverview(o);
        if (!p || !o) setFailed(true);
    }, [scope, loadWeek, loadHome]);

    useEffect(() => {
        load();
    }, [load]);

    if (!profile || !overview) {
        if (failed) {
            return (
                <Empty description="Couldn't load your overview right now.">
                    <Button icon={<ReloadOutlined />} onClick={load}>
                        Try again
                    </Button>
                </Empty>
            );
        }
        return (
            <div className="ess-ov">
                {[0, 1, 2].map(i => (
                    <div key={i}>
                        <div className="rounded-[32px] bg-white p-6 shadow-[0_1.66px_8.28px_rgba(0,0,0,0.06)]">
                            <Skeleton active paragraph={{ rows: 5 }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const { mode } = overview;
    // A check-in / check-out changes today's window and expected hours: refresh the timesheet card too.
    const onOverview = (next: AtsOverview) => {
        setOverview(next);
        loadWeek();
        loadHome();
    };
    const onWeek = (next: TimesheetWeekView) => {
        setWeek(next);
        loadHome();
    };
    const hrefOf = (link: OverviewLink) => ('tab' in link ? paths.section(link.tab, link.date) : `${paths.home}/${link.page}`);

    // In Timesheet-only mode the Timesheet card takes the Attendance slot.
    const timesheetSlot = mode === 'both' ? 'ess-ov__t' : 'ess-ov__a';
    // PROTOTYPE-SETUP (Overview v4, Slice 4): Recent days is sized to fit the rows it shows (this week and last
    // week up to today: 6–10 working days) — fixed for the day, never resized by what happens on the page.
    const rdHeight = RD_CHROME + Math.max(home?.recentDays.length ?? 0, 6) * RD_ROW;
    return (
        <div className={`ess-ov ess-ov--${mode}`} style={{ '--ov-rd': `${rdHeight}px` } as React.CSSProperties}>
            <div className="ess-ov__p">
                <OvProfileCard profile={profile} profilePath={`${paths.home}/profile`} wide={!hasTracking(mode)} />
            </div>
            {hasCheckIn(mode) && (
                <div className="ess-ov__a">
                    <OvAttendanceCard overview={overview} onOverview={onOverview} openPath={paths.section('attendance')} />
                </div>
            )}
            {hasTimesheets(mode) && week && (
                <div className={timesheetSlot}>
                    <OvTimesheetCard week={week} mode={mode} today={today} onWeek={onWeek} fullPath={paths.section('timesheet', today)} />
                </div>
            )}
            {home && (
                <>
                    <div className="ess-ov__q">
                        <OvQuickActions
                            mode={mode}
                            to={{
                                section: paths.section(),
                                leave: `${paths.home}/leaves`,
                                reimbursements: `${paths.home}/reimbursements`,
                                payslips: `${paths.home}/payslips`,
                                documents: `${paths.home}/documents`,
                                profile: `${paths.home}/profile`,
                            }}
                        />
                    </div>
                    {/* PROTOTYPE-SETUP (Overview v4, Slice 5): no Recent days when nothing is tracked. */}
                    {hasTracking(mode) && (
                        <div className="ess-ov__r">
                            <OvStatusTable days={home.recentDays} mode={mode} today={today} linkTo={paths.section} />
                        </div>
                    )}
                    <div className="ess-ov__n">
                        <OvNotifications home={home} hrefOf={hrefOf} roomy={mode !== 'both'} />
                    </div>
                </>
            )}
        </div>
    );
};

export default EssOverviewPage;
