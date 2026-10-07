// PROTOTYPE-SETUP: floating demo control (bottom-right, mounted once in App.tsx).
// Dummy / Empty switches the mock layer's dataset. The "Demo" menu (ESS Service 1) switches the Attendance &
// Timesheet mode, runs the timesheet submission day now, and "Reset demo data" forgets every action taken in
// the demo (stateful collections, both modes) and reseeds. Each reloads the page so every screen refetches.
import { useEffect, useState } from 'react';

import { DownOutlined } from '@ant-design/icons';
import { Button, Dropdown, Flex, Modal, Segmented, Tooltip, message } from 'antd';
import type { MenuProps } from 'antd';

import { getAtsSettings, simulateSubmissionDay, updateAtsSettings } from '@src/domains/attendanceTimesheet/api';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { resetAllCollections } from '@src/prototype/mocks/store/persistentStore';
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

const MODE_LABEL: Record<AtsMode, string> = {
    attendance: 'Attendance only',
    both: 'Attendance & Timesheet',
    timesheet: 'Timesheet only',
};

const DataModeToggle = () => {
    const dispatch = useAppDispatch();
    const mode = useAppSelector(state => state.reducer.dataMode?.mode ?? 'dummy');
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const scope = { userType: role || 'corporate', userId: id || 1001 };
    const [atsMode, setAtsMode] = useState<AtsMode | null>(null);

    useEffect(() => {
        getAtsSettings(scope).then(s => s && setAtsMode(s.mode));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, id]);

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

    const items: MenuProps['items'] = [
        {
            key: 'mode',
            type: 'group',
            label: 'Attendance & Timesheet mode',
            children: (['attendance', 'both', 'timesheet'] as AtsMode[]).map(m => ({
                key: `mode:${m}`,
                label: `${atsMode === m ? '✓ ' : ''}${MODE_LABEL[m]}`,
            })),
        },
        { type: 'divider' },
        { key: 'simulate', label: 'Simulate submission day' },
        { key: 'reset', label: 'Reset demo data', danger: true },
    ];

    const onClick: MenuProps['onClick'] = ({ key }) => {
        if (key.startsWith('mode:')) switchAtsMode(key.slice(5) as AtsMode);
        else if (key === 'simulate') simulate();
        else if (key === 'reset') reset();
    };

    return (
        <Flex
            align="center"
            gap={8}
            className="fixed z-[1000] rounded-full border border-solid border-gray-200 bg-white px-2 py-1 shadow-md"
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
            <Dropdown menu={{ items, onClick }} trigger={['click']} placement="topRight">
                <Button size="small" type="text">
                    Demo <DownOutlined />
                </Button>
            </Dropdown>
        </Flex>
    );
};

export default DataModeToggle;
