// PROTOTYPE-SETUP (Overview, Slice 2): the ESS - Employee Overview (prototype "Home"), at /ess-employee. ESS -
// Manager keeps the existing employee dashboard. Layout in overview.css:
//   [1 Profile] [2 Attendance] [3 Timesheet]
//   [6 Shortcuts ×2]           [5 Notifications]
//   [4 Status table ×2]        [5]
// Attendance-only hides 3 and 2 spans; Timesheet-only the reverse.
import { useCallback, useEffect, useState } from 'react';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Skeleton } from 'antd';

import './overview.css';
import OvAttendanceCard from './OvAttendanceCard';
import OvProfileCard from './OvProfileCard';
import OvTimesheetCard from './OvTimesheetCard';
import { getMyProfile, getOverview, getTimesheetWeek } from '../api';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import { todayIso } from '../timesheet/helpers';
import type { AtsOverview, MyProfileView, TimesheetWeekView } from '../types';

const EssOverviewPage = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const today = todayIso();
    const [profile, setProfile] = useState<MyProfileView | null>(null);
    const [overview, setOverview] = useState<AtsOverview | null>(null);
    const [week, setWeek] = useState<TimesheetWeekView | null>(null);
    const [failed, setFailed] = useState(false);

    const loadWeek = useCallback(async () => {
        const w = await getTimesheetWeek(scope, today);
        if (w) setWeek(w);
    }, [scope, today]);

    const load = useCallback(async () => {
        setFailed(false);
        const [p, o] = await Promise.all([getMyProfile(scope), getOverview(scope), loadWeek()]);
        if (p) setProfile(p);
        if (o) setOverview(o);
        if (!p || !o) setFailed(true);
    }, [scope, loadWeek]);

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
                    <div key={i} className="rounded-2xl border border-solid border-gray-100 bg-white p-4">
                        <Skeleton active paragraph={{ rows: 5 }} />
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
    };

    return (
        <div className={`ess-ov ${mode === 'both' ? '' : 'ess-ov--one'}`}>
            <OvProfileCard profile={profile} profilePath={`${paths.home}/profile`} className="ess-ov__p" />
            {mode !== 'timesheet' && (
                <OvAttendanceCard overview={overview} onOverview={onOverview} openPath={paths.section('attendance')} className="ess-ov__a" />
            )}
            {mode !== 'attendance' && week && (
                <OvTimesheetCard
                    week={week}
                    mode={mode}
                    today={today}
                    onWeek={setWeek}
                    fullPath={paths.section('timesheet', today)}
                    className="ess-ov__t"
                />
            )}
        </div>
    );
};

export default EssOverviewPage;
