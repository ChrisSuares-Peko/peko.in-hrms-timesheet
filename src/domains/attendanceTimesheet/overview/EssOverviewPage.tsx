// PROTOTYPE-SETUP (Overview, Slice 2; ESS design, Slice 2; Overview v4, Slices 1–2): the ESS - Employee
// Overview, at /ess-employee. ESS - Manager keeps the existing employee dashboard. Layout (overview.css):
//   ≥1200px  fixed section heights. Both modes: Profile | Attendance | Timesheet, then Quick actions + Recent days
//            (left 2/3) and Notifications (right 1/3). Attendance-only / Timesheet-only: Profile | Attendance (or
//            Timesheet) | Notifications, with Notifications running down the whole right column.
//   768–1199px  two columns, heights automatic. <768px  one column: Profile, Attendance, Timesheet, Quick actions,
//            Recent days, Notifications.
import { useCallback, useEffect, useState } from 'react';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Skeleton } from 'antd';

import './overview.css';
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
    return (
        <div className={`ess-ov ess-ov--${mode}`}>
            <div className="ess-ov__p">
                <OvProfileCard profile={profile} profilePath={`${paths.home}/profile`} />
            </div>
            {mode !== 'timesheet' && (
                <div className="ess-ov__a">
                    <OvAttendanceCard overview={overview} onOverview={onOverview} openPath={paths.section('attendance')} />
                </div>
            )}
            {mode !== 'attendance' && week && (
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
                                overtime: paths.section('overtime'),
                                payslips: `${paths.home}/payslips`,
                                documents: `${paths.home}/documents`,
                                profile: `${paths.home}/profile`,
                            }}
                        />
                    </div>
                    <div className="ess-ov__r">
                        <OvStatusTable days={home.recentDays} mode={mode} today={today} linkTo={paths.section} />
                    </div>
                    <div className="ess-ov__n">
                        <OvNotifications home={home} hrefOf={hrefOf} roomy={mode !== 'both'} />
                    </div>
                </>
            )}
        </div>
    );
};

export default EssOverviewPage;
