// PROTOTYPE-SETUP (Overview, Slice 2; ESS design, Slice 2): the ESS - Employee Overview, at /ess-employee. ESS -
// Manager keeps the existing employee dashboard. Layout with antd Row / Col (24px gutters):
//   1440px  [Profile] [Attendance] [Timesheet]            three equal columns, same top edge and height
//           [Quick actions + Recent days ~2/3] [Notifications ~1/3]   aligned at the top
//   1024px  two columns on top: [Profile] [Attendance] / [Timesheet]; below, Quick actions, Recent days and
//           Notifications at full width (the table needs ~640px, more than a 2/3 column has at this width)
//   375px   one column: Profile, Attendance, Timesheet, Quick actions, Recent days, Notifications
// Attendance-only hides Timesheet and Attendance takes its place; Timesheet-only the reverse.
import { useCallback, useEffect, useState } from 'react';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Col, Empty, Row, Skeleton } from 'antd';

import { titleFor } from '@src/prototype/rules/attendance';

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

/** Gap between cards (spacing scale). */
const GUTTER = 24;

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
            <Row gutter={[GUTTER, GUTTER]}>
                {[0, 1, 2].map(i => (
                    <Col key={i} xs={24} md={12} xl={8}>
                        <div className="rounded-[32px] bg-white p-6 shadow-[0_1.66px_8.28px_rgba(0,0,0,0.06)]">
                            <Skeleton active paragraph={{ rows: 5 }} />
                        </div>
                    </Col>
                ))}
            </Row>
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

    // Top row: three equal columns (xl), two (md: Profile + Attendance, Timesheet below), one (xs). With one of
    // Attendance / Timesheet hidden by the mode, the other takes the remaining width.
    const one = mode !== 'both';
    const wide = { xs: 24, md: 12, xl: 16 };
    const third = { xs: 24, md: 12, xl: 8 };
    return (
        <div className="flex flex-col" style={{ gap: GUTTER }}>
            <Row gutter={[GUTTER, GUTTER]} align="stretch">
                <Col {...third} className="flex">
                    <OvProfileCard profile={profile} profilePath={`${paths.home}/profile`} className="w-full" />
                </Col>
                {mode !== 'timesheet' && (
                    <Col {...(one ? wide : third)} className="flex">
                        <OvAttendanceCard overview={overview} onOverview={onOverview} openPath={paths.section('attendance')} className="w-full" />
                    </Col>
                )}
                {mode !== 'attendance' && week && (
                    <Col xs={24} md={one ? 12 : 24} xl={one ? 16 : 8} className="flex">
                        <OvTimesheetCard
                            week={week}
                            mode={mode}
                            today={today}
                            onWeek={onWeek}
                            fullPath={paths.section('timesheet', today)}
                            className="w-full"
                        />
                    </Col>
                )}
            </Row>
            {home && (
                <Row gutter={[GUTTER, GUTTER]} align="top">
                    <Col xs={24} xl={16} className="flex flex-col" style={{ gap: GUTTER }}>
                        <OvQuickActions
                            sectionTitle={titleFor(mode)}
                            to={{
                                section: paths.section(),
                                leave: `${paths.home}/leaves`,
                                reimbursements: `${paths.home}/reimbursements`,
                                overtime: paths.section('overtime'),
                                payslips: `${paths.home}/payslips`,
                                documents: `${paths.home}/documents`,
                            }}
                        />
                        <OvStatusTable days={home.recentDays} mode={mode} today={today} linkTo={paths.section} />
                    </Col>
                    <Col xs={24} xl={8}>
                        <OvNotifications home={home} hrefOf={hrefOf} />
                    </Col>
                </Row>
            )}
        </div>
    );
};

export default EssOverviewPage;
