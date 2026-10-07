// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — read-only view of a direct report's timesheet
// (`<base>/my-team/members/:employeeId?date=YYYY-MM-DD&review=1`). The viewer shows a "Review and approve"
// shortcut on a submitted week or one with a pending change request; it opens the same review drawer as
// "Timesheet approvals" (opened automatically with ?review=1). A small attendance summary for the month sits on top.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowLeftOutlined, AuditOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Flex, Result, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getMemberAttendance, getMemberMonth, getMemberWeek } from '../api';
import { formatDuration } from '../components/format';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import TimesheetViewer from '../timesheet/TimesheetViewer';
import type { AttendanceMonthView, PersonRef, TimesheetWeekView } from '../types';
import { CountTile, PersonCell, TeamBreadcrumb, useTeamSettings } from './teamShared';
import TimesheetReviewDrawer from './TimesheetReviewDrawer';
import type { ReviewTarget } from './TimesheetReviewDrawer';

const isIsoDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayjs(v).isValid());

const AttendanceSummary = ({ employeeId, initialMonth }: { employeeId: number; initialMonth: string }) => {
    const scope = useAtsScope();
    const [month, setMonth] = useState(initialMonth);
    const [data, setData] = useState<AttendanceMonthView | null>(null);
    const [loading, setLoading] = useState(true);
    const thisMonth = dayjs().format('YYYY-MM');

    useEffect(() => {
        let alive = true;
        setLoading(true);
        getMemberAttendance(scope, employeeId, month).then(res => {
            if (!alive) return;
            setData(res || null);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [scope, employeeId, month]);

    const shift = (n: number) => setMonth(m => dayjs(`${m}-01`).add(n, 'month').format('YYYY-MM'));
    const tot = data?.totals;
    const tiles = tot
        ? [
              { label: 'Present', value: tot.present, color: '#12B76A' },
              { label: 'Late', value: tot.late, color: '#F79009' },
              { label: 'Half day', value: tot.halfDay, color: '#F79009' },
              { label: 'Absent', value: tot.absent, color: '#F04438' },
              { label: 'On leave', value: tot.onLeave, color: '#7A5AF8' },
              { label: 'At work', value: formatDuration(tot.minutesAtWork) },
              { label: 'Extra time', value: tot.overtimeMinutes ? formatDuration(tot.overtimeMinutes) : '—', color: '#027A48' },
          ]
        : [];

    return (
        <div className="rounded-2xl border border-solid border-[#EAECF0] bg-white p-4">
            <Flex justify="space-between" align="center" wrap="wrap" gap={8} className="mb-3">
                <Typography.Text strong>Attendance</Typography.Text>
                <Flex gap={6} align="center">
                    <Button size="small" icon={<LeftOutlined />} onClick={() => shift(-1)} aria-label="Previous month" />
                    <Typography.Text className="min-w-[110px] text-center">
                        {data?.monthLabel ?? dayjs(`${month}-01`).format('MMMM YYYY')}
                    </Typography.Text>
                    <Button
                        size="small"
                        icon={<RightOutlined />}
                        onClick={() => shift(1)}
                        disabled={month >= thisMonth}
                        aria-label="Next month"
                    />
                </Flex>
            </Flex>
            {loading && !data && <Skeleton active paragraph={{ rows: 1 }} />}
            {!loading && !data && <Typography.Text type="secondary">Attendance isn&apos;t available for this month.</Typography.Text>}
            {data && (
                <div className={`grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 ${loading ? 'opacity-60' : ''}`}>
                    {tiles.map(t => (
                        <CountTile key={t.label} label={t.label} value={t.value} color={t.color} />
                    ))}
                </div>
            )}
            {data?.locked && data.lockReason && (
                <Typography.Text type="secondary" className="block mt-2 text-xs">
                    {data.lockReason}
                </Typography.Text>
            )}
        </div>
    );
};

const MemberTimesheetPage = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const { employeeId: idParam } = useParams<{ employeeId: string }>();
    const [search, setSearch] = useSearchParams();
    const employeeId = Number(idParam);
    const dateParam = search.get('date');
    const initialDate = useMemo(() => (isIsoDate(dateParam) ? dateParam : dayjs().format('YYYY-MM-DD')), [dateParam]);
    const settings = useTeamSettings(scope);

    const [person, setPerson] = useState<PersonRef | null>(null);
    const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
    const [reloadKey, setReloadKey] = useState(0);
    const [target, setTarget] = useState<ReviewTarget | null>(null);

    // Header + access check (only direct reports can be viewed — anything else is a 403).
    useEffect(() => {
        let alive = true;
        setState('loading');
        if (!Number.isFinite(employeeId)) {
            setState('error');
            return undefined;
        }
        getMemberWeek(scope, employeeId, initialDate).then(res => {
            if (!alive) return;
            if (!res) {
                setState('error');
                return;
            }
            setPerson(res.employee);
            setState('ok');
            if (search.get('review') === '1') setTarget({ employeeId, date: initialDate });
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, employeeId, initialDate]);

    const loadWeek = useCallback(
        async (date: string) => {
            const res = await getMemberWeek(scope, employeeId, date);
            if (res) setPerson(res.employee);
            return res;
        },
        [scope, employeeId]
    );
    const loadMonth = useCallback((month: string) => getMemberMonth(scope, employeeId, month), [scope, employeeId]);

    const weekActions = useCallback(
        (view: TimesheetWeekView) => {
            const needsReview = view.week.status === 'SUBMITTED' || view.changeRequest?.status === 'PENDING';
            if (!needsReview) return null;
            return (
                <Button
                    type="primary"
                    icon={<AuditOutlined />}
                    onClick={() => setTarget({ employeeId, date: view.week.weekStart })}
                >
                    Review and approve
                </Button>
            );
        },
        [employeeId]
    );

    const closeReview = () => {
        setTarget(null);
        if (search.get('review')) {
            const next = new URLSearchParams(search);
            next.delete('review');
            setSearch(next, { replace: true });
        }
    };

    const backTab = settings.mode === 'attendance' ? 'today' : 'timesheets';
    const crumbs = [
        { title: 'Home', to: paths.home },
        { title: 'My team', to: paths.myTeam(backTab) },
        { title: person?.name ?? 'Team member' },
    ];

    if (state === 'error') {
        return (
            <div className="w-full min-w-0">
                <TeamBreadcrumb items={crumbs} />
                <Result
                    status="403"
                    title="You can't view this timesheet"
                    subTitle="You can only view the timesheets of people who report to you."
                    extra={
                        <Button type="primary" onClick={() => navigate(paths.myTeam())}>
                            Back to My team
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div className="w-full min-w-0">
            <TeamBreadcrumb items={crumbs} />
            <Flex justify="space-between" align="center" wrap="wrap" gap={12} className="mb-4">
                {person ? (
                    <PersonCell
                        person={person}
                        size={48}
                        sub={[person.designation, person.department, person.employeeId].filter(Boolean).join(' · ')}
                    />
                ) : (
                    <Skeleton.Input active />
                )}
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(paths.myTeam(backTab))}>
                    Back to My team
                </Button>
            </Flex>

            {state === 'loading' || !settings.loaded ? (
                <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
                <Flex vertical gap={16}>
                    {settings.mode !== 'timesheet' && (
                        <AttendanceSummary employeeId={employeeId} initialMonth={initialDate.slice(0, 7)} />
                    )}
                    {settings.mode !== 'attendance' && (
                        <div className="min-w-0">
                            <TimesheetViewer
                                loadWeek={loadWeek}
                                loadMonth={loadMonth}
                                initialDate={initialDate}
                                weekActions={settings.approvalOn ? weekActions : undefined}
                                reloadKey={reloadKey}
                            />
                        </div>
                    )}
                </Flex>
            )}

            <TimesheetReviewDrawer
                target={target}
                onClose={closeReview}
                onDecided={() => setReloadKey(k => k + 1)}
            />
        </div>
    );
};

export default MemberTimesheetPage;
