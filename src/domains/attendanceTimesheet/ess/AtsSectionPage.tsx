// PROTOTYPE-SETUP: ESS Service 1, Slice 2 — the Attendance & Timesheet section, at <base>/attendance-timesheet
// and <base>/attendance-timesheet/:tab (base = /ess-employee or /ess-manager). Named per mode, with the tabs
// the mode allows (Attendance / Timesheet / Overtime). The tab lives in the URL; a missing or unknown tab shows
// the first one. Children report changes so the overview (counts, today) stays current.
import { useCallback, useEffect, useState } from 'react';

import { ReloadOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, Skeleton, Tabs } from 'antd';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EssPageHeader } from '@src/components/ess/EssUi';

import { getOverview } from '../api';
import { displayTime } from '../components/format';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import TimesheetTab from '../timesheet/TimesheetTab';
import type { AtsMode, AtsOverview, AtsTab } from '../types';
import AttendanceTab from './AttendanceTab';
import OvertimeTab from './OvertimeTab';


const TAB_LABEL: Record<AtsTab, string> = {
    attendance: 'Attendance',
    timesheet: 'Timesheet',
    overtime: 'Overtime',
};

const SUBTITLE: Record<AtsMode, string> = {
    attendance: 'Check in and out, see your monthly attendance and claim overtime.',
    both: 'Check in and out, log your hours each week and claim overtime.',
    timesheet: 'Log your hours each week and claim overtime.',
    none: '',
};

const AtsSectionPage = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const { tab: tabParam } = useParams<{ tab?: string }>();
    // PROTOTYPE-SETUP (Overview, Slice 2): ?date=YYYY-MM-DD opens the tab on that day (Overview deep links).
    const [search] = useSearchParams();
    const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(search.get('date') ?? '') ? search.get('date')! : undefined;
    const [overview, setOverview] = useState<AtsOverview | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        const res = await getOverview(scope);
        if (res) setOverview(res);
        else setFailed(true);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    const title = overview?.title ?? 'Attendance & Timesheet';

    const header = (
        <div className="flex flex-col gap-2 mb-1">
            {/* PROTOTYPE-SETUP: no section breadcrumb — the layout's ESS breadcrumb leads back to Home. */}
            {/* PROTOTYPE-SETUP (ESS design, Slice 3): the ESS page header. */}
            <EssPageHeader
                title={title}
                subtitle={
                    overview
                        ? `${SUBTITLE[overview.mode]} Shift ${displayTime(overview.shift.start)}–${displayTime(overview.shift.end)}.`
                        : undefined
                }
            />
        </div>
    );

    // PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode tracks nothing — the section is hidden; opening it
    // directly goes back to the tab's home (the Overview on ESS - Employee).
    if (overview?.mode === 'none') return <Navigate to={paths.home} replace />;

    if (!overview) {
        return (
            <div className="w-full min-w-0 flex flex-col gap-4">
                {header}
                {failed ? (
                    <Empty description="Couldn't load this section right now.">
                        <Button icon={<ReloadOutlined />} onClick={load}>
                            Try again
                        </Button>
                    </Empty>
                ) : (
                    <>
                        <Skeleton.Input active />
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </>
                )}
            </div>
        );
    }

    const active: AtsTab = overview.tabs.includes(tabParam as AtsTab)
        ? (tabParam as AtsTab)
        : overview.tabs[0];
    const onChanged = () => {
        load();
    };

    const badgeFor = (tab: AtsTab) => {
        if (tab === 'attendance') return overview.counts.pendingCorrections;
        if (tab === 'overtime') return overview.counts.suggestedOvertime;
        return 0;
    };

    const content = (tab: AtsTab) => {
        if (tab !== active) return null;
        if (tab === 'attendance') {
            return (
                <AttendanceTab
                    key={dateParam ?? 'today'}
                    overview={overview}
                    onOverview={setOverview}
                    onChanged={onChanged}
                    initialDate={dateParam}
                />
            );
        }
        if (tab === 'timesheet') return <TimesheetTab key={dateParam ?? 'today'} onChanged={onChanged} initialDate={dateParam} />;
        return <OvertimeTab onChanged={onChanged} />;
    };

    return (
        <div className="w-full min-w-0 flex flex-col gap-2">
            {header}
            <Tabs
                activeKey={active}
                onChange={key => navigate(paths.section(key as AtsTab))}
                className="w-full min-w-0"
                items={overview.tabs.map(tab => ({
                    key: tab,
                    label: (
                        <span className="inline-flex items-center gap-1.5">
                            {TAB_LABEL[tab]}
                            {badgeFor(tab) > 0 && (
                                <Badge count={badgeFor(tab)} size="small" color="#FF4F4F" />
                            )}
                        </span>
                    ),
                    children: content(tab),
                }))}
            />
        </div>
    );
};

export default AtsSectionPage;
