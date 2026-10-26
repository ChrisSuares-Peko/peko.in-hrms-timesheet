// PROTOTYPE-SETUP: floating demo control (bottom-right, mounted once in App.tsx).
// Dummy / Empty switches the mock layer's dataset. The "Demo" menu (ESS Service 1) switches the Attendance &
// Timesheet mode, runs the timesheet submission day now, and "Reset demo data" forgets every action taken in
// the demo (stateful collections, both modes) and reseeds. Each reloads the page so every screen refetches.
// PROTOTYPE-SETUP (Settings, Slice 6): "Payroll (demo)" — processed up to which month; process last month (disabled
// while timesheets are unapproved, with how many employees block it), "Process anyway", or undo it. Processing locks
// the month everywhere, exactly like the Payroll module's own processing. Demo only — not part of the real Payroll UI.
import { useEffect, useState } from 'react';

import { DownOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Dropdown, Flex, Modal, Segmented, Tooltip, message } from 'antd';
import type { MenuProps } from 'antd';

import { essTheme } from '@src/components/ess/EssThemeProvider';
import {
    getAtsSettings,
    getPayrollDemo,
    processPayrollDemo,
    resetTodayCheckIn,
    simulateSubmissionDay,
    undoPayrollDemo,
    updateAtsSettings,
} from '@src/domains/attendanceTimesheet/api';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { demoDay, resetAllCollections } from '@src/prototype/mocks/store/persistentStore';
import { DataMode, setDataMode } from '@src/slices/dataModeSlice';
import { persistor } from '@store/store';

const reloadAfterPersist = async () => {
    try {
        await persistor.flush();
    } catch {
        // reload regardless
    }
    window.location.reload();
};

// PROTOTYPE-SETUP: the demo's "today" is the real date. If the page stays open past midnight, reload so every
// screen and the mock data move to the new day together (the mock layer reseeds around it).
const DAY_CHECK_MS = 60_000;

const MODE_LABEL: Record<AtsMode, string> = {
    attendance: 'Attendance only',
    both: 'Attendance & Timesheet',
    timesheet: 'Timesheet only',
    none: 'Neither (no tracking)', // PROTOTYPE-SETUP (Overview v4, Slice 5)
};

type PayrollDemo = Exclude<Awaited<ReturnType<typeof getPayrollDemo>>, false>;

const DataModeToggle = () => {
    const dispatch = useAppDispatch();
    const mode = useAppSelector(state => state.reducer.dataMode?.mode ?? 'dummy');
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const scope = { userType: role || 'corporate', userId: id || 1001 };
    const [atsMode, setAtsMode] = useState<AtsMode | null>(null);
    const [payroll, setPayroll] = useState<PayrollDemo | null>(null);
    const loadPayroll = () => getPayrollDemo(scope).then(p => setPayroll(p || null));

    useEffect(() => {
        getAtsSettings(scope).then(s => s && setAtsMode(s.mode));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, id]);

    useEffect(() => {
        const loadedOn = demoDay();
        const timer = window.setInterval(() => {
            if (demoDay() !== loadedOn) window.location.reload();
        }, DAY_CHECK_MS);
        return () => window.clearInterval(timer);
    }, []);

    const changeMode = (next: DataMode) => {
        if (next === mode) return;
        dispatch(setDataMode(next));
        reloadAfterPersist();
    };

    const reset = () =>
        Modal.confirm({
            title: 'Reset demo data?',
            content: 'Clears everything changed during the demo (both data sets) and restores the seed.',
            okText: 'Reset',
            onOk: () => {
                resetAllCollections();
                reloadAfterPersist();
            },
        });

    const switchAtsMode = async (next: AtsMode) => {
        if (next === atsMode) return;
        const res = await updateAtsSettings(scope, { mode: next });
        if (res) reloadAfterPersist();
    };

    const simulate = async () => {
        const res = await simulateSubmissionDay(scope);
        if (!res) return;
        if (!res.submitted.length) {
            message.info('No open weeks to submit (or timesheet approval is off).');
            return;
        }
        message.success(`${res.submitted.length} week${res.submitted.length === 1 ? '' : 's'} sent to managers.`);
        setTimeout(reloadAfterPersist, 800);
    };

    // PROTOTYPE-SETUP (Overview, Slice 1): start today's check-in over, for both ESS personas.
    const resetCheckIn = async () => {
        const res = await resetTodayCheckIn(scope);
        if (!res) return;
        message.success('Today’s check-in cleared for both personas.');
        setTimeout(reloadAfterPersist, 800);
    };

    const processPayroll = async (force: boolean) => {
        if (!payroll) return;
        const res = await processPayrollDemo(scope, payroll.month, force);
        if (!res) return;
        message.success(force ? `Processed ${payroll.monthLabel} anyway (demo override).` : `Payroll processed for ${payroll.monthLabel}. It’s locked now.`);
        setTimeout(reloadAfterPersist, 800);
    };

    const undoPayroll = async () => {
        if (!payroll) return;
        const res = await undoPayrollDemo(scope, payroll.month);
        if (!res) return;
        message.success(`Undid ${payroll.monthLabel} payroll (demo).`);
        setTimeout(reloadAfterPersist, 800);
    };

    const blocking = payroll?.blockingEmployees ?? 0;
    const payrollItems: NonNullable<MenuProps['items']> = payroll
        ? [
              {
                  key: 'payroll-info',
                  disabled: true,
                  label: (
                      <span className="block max-w-[260px] whitespace-normal text-xs text-gray-500" data-payroll-demo-info>
                          Processed up to {payroll.processedUpToLabel}. Processed months are locked everywhere.
                          {!payroll.processed && blocking
                              ? ` ${blocking} employee${blocking === 1 ? ' has' : 's have'} timesheets for ${payroll.monthLabel} not approved yet.`
                              : ''}
                      </span>
                  ),
              },
              ...(payroll.processed
                  ? [{ key: 'payroll-undo', label: `Undo ${payroll.monthLabel}` }]
                  : [
                        { key: 'payroll-process', label: `Process ${payroll.monthLabel} payroll`, disabled: blocking > 0 },
                        ...(blocking ? [{ key: 'payroll-force', label: 'Process anyway' }] : []),
                    ]),
          ]
        : [{ key: 'payroll-info', disabled: true, label: 'Loading…' }];

    const items: MenuProps['items'] = [
        {
            key: 'mode',
            type: 'group',
            label: 'Attendance & Timesheet mode',
            children: (['attendance', 'both', 'timesheet', 'none'] as AtsMode[]).map(m => ({
                key: `mode:${m}`,
                label: `${atsMode === m ? '✓ ' : ''}${MODE_LABEL[m]}`,
            })),
        },
        { type: 'divider' },
        { key: 'payroll', type: 'group', label: 'Payroll (demo)', children: payrollItems },
        { type: 'divider' },
        { key: 'simulate', label: 'Simulate submission day' },
        { key: 'reset-check-in', label: 'Reset today’s check-in' },
        { key: 'reset', label: 'Reset demo data', danger: true },
    ];

    const onClick: MenuProps['onClick'] = ({ key }) => {
        if (key.startsWith('mode:')) switchAtsMode(key.slice(5) as AtsMode);
        else if (key === 'simulate') simulate();
        else if (key === 'reset-check-in') resetCheckIn();
        else if (key === 'reset') reset();
        else if (key === 'payroll-process') processPayroll(false);
        else if (key === 'payroll-force') processPayroll(true);
        else if (key === 'payroll-undo') undoPayroll();
    };

    return (
        // PROTOTYPE-SETUP (ESS design, Slice 5): the control uses the ESS tokens (segmented track, red accents).
        <ConfigProvider theme={essTheme}>
        <Flex
            align="center"
            gap={8}
            // PROTOTYPE-SETUP (ESS design, Slice 5): ESS border and soft shadow.
            className="fixed z-[1000] rounded-full border border-solid border-[#e6e6e6] bg-white px-2 py-1 shadow-[0_1.66px_8.28px_rgba(0,0,0,0.12)]"
            style={{ right: 16, bottom: 16 }}
            role="group"
            aria-label="Prototype data controls"
        >
            <Tooltip title="Prototype data set">
                <Segmented<DataMode>
                    size="small"
                    value={mode}
                    onChange={changeMode}
                    options={[
                        { label: 'Dummy', value: 'dummy' },
                        { label: 'Empty', value: 'empty' },
                    ]}
                />
            </Tooltip>
            <Dropdown menu={{ items, onClick }} trigger={['click']} placement="topRight" onOpenChange={open => open && loadPayroll()}>
                <Button size="small" type="text">
                    Demo <DownOutlined />
                </Button>
            </Dropdown>
        </Flex>
        </ConfigProvider>
    );
};

export default DataModeToggle;
