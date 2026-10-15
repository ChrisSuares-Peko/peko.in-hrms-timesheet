// PROTOTYPE-SETUP (HR rules, Slice 2): "Edit today's breaks" — start, end (empty = still on break), an optional
// description, Remove. The employee changes today's breaks directly; an earlier day's breaks go through a correction.
// The server checks the same rules (validateBreaks): within check-in → check-out (or now), no overlaps.
import { useEffect, useState } from 'react';

import { DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Modal, TimePicker, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { updateTodayBreaks } from '../api';
import { displayTime } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview, AttendanceBreak } from '../types';

const { Text } = Typography;
const FMT = 'HH:mm';

const toDayjs = (hhmm: string | null) => (hhmm ? dayjs(`2000-01-01T${hhmm}`) : null);
const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** The client-side check (the server applies the same rules). Returns the message, or null. */
export const breaksError = (rows: AttendanceBreak[], session: { checkIn: string; checkOut: string | null; nowMinutes: number }) => {
    const from = toMin(session.checkIn);
    const to = session.checkOut ? toMin(session.checkOut) : session.nowMinutes;
    const limit = session.checkOut ? `check-out (${displayTime(session.checkOut)})` : 'now';
    const sorted = [...rows].sort((a, b) => toMin(a.start || '00:00') - toMin(b.start || '00:00'));
    for (let i = 0; i < sorted.length; i += 1) {
        const b = sorted[i];
        if (!b.start) return 'Every break needs a start time.';
        if (b.end && toMin(b.end) <= toMin(b.start)) return 'A break has to end after it starts.';
        if (!b.end && (session.checkOut || i !== sorted.length - 1)) return 'Only the last break can still be running, while you’re checked in.';
        if (toMin(b.start) < from || (b.end ? toMin(b.end) : to) > to) {
            return `Breaks have to be between your check-in (${displayTime(session.checkIn)}) and ${limit}.`;
        }
        if (i > 0 && toMin(b.start) < toMin(sorted[i - 1].end ?? '23:59')) return 'Breaks can’t overlap.';
    }
    return null;
};

const BreaksModal = ({ open, overview, onClose, onSaved }: { open: boolean; overview: AtsOverview; onClose: () => void; onSaved: (next: AtsOverview) => void }) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const t = overview.today;
    const [rows, setRows] = useState<AttendanceBreak[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setRows(t.breaks.map(b => ({ ...b })));
            setError(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const set = (i: number, patch: Partial<AttendanceBreak>) => {
        setRows(list => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
        setError(null);
    };

    const save = async () => {
        if (!t.checkIn) return;
        const now = dayjs();
        const why = breaksError(rows, { checkIn: t.checkIn, checkOut: t.checkOut, nowMinutes: now.hour() * 60 + now.minute() });
        if (why) {
            setError(why);
            return;
        }
        setSaving(true);
        const res = await updateTodayBreaks(scope, rows);
        setSaving(false);
        if (!res) return;
        dispatch(showToast({ description: 'Breaks updated.', variant: 'success' }));
        onSaved(res);
        onClose();
    };

    return (
        <Modal
            open={open}
            title="Edit today’s breaks"
            onCancel={onClose}
            okText="Save breaks"
            onOk={save}
            confirmLoading={saving}
            destroyOnHidden
            centered
            width={560}
        >
            <Text className="mb-3 block text-sm text-[#616161]">You can change today’s breaks yourself. For an earlier day, request a correction.</Text>
            <div className="flex flex-col gap-2" data-breaks-editor>
                {rows.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[110px_110px_minmax(0,1fr)_auto]">
                        <TimePicker
                            aria-label="Break start"
                            format="h:mm A"
                            use12Hours
                            minuteStep={5}
                            needConfirm={false}
                            allowClear={false}
                            value={toDayjs(b.start)}
                            onChange={(d: Dayjs | null) => set(i, { start: d ? d.format(FMT) : b.start })}
                        />
                        <TimePicker
                            aria-label="Break end"
                            format="h:mm A"
                            use12Hours
                            minuteStep={5}
                            needConfirm={false}
                            placeholder="Still on break"
                            value={toDayjs(b.end)}
                            onChange={(d: Dayjs | null) => set(i, { end: d ? d.format(FMT) : null })}
                        />
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove break" className="sm:order-last" onClick={() => setRows(list => list.filter((_, j) => j !== i))} />
                        <Input
                            className="col-span-3 sm:col-span-1"
                            placeholder="Description (optional)"
                            maxLength={200}
                            value={b.description ?? ''}
                            onChange={e => set(i, { description: e.target.value })}
                        />
                    </div>
                ))}
                {!rows.length && <Text className="text-sm text-[#9e9e9e]">No breaks today.</Text>}
            </div>
            {error && <Alert type="error" showIcon className="mt-3" message={error} />}
        </Modal>
    );
};

export default BreaksModal;
