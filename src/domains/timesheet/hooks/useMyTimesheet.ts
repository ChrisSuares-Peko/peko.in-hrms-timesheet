// PROTOTYPE-SETUP: My Timesheet state for one week, as the current ESS persona. Every action returns the
// fresh week view from the server (which applies the rules); on error the server message is already toasted.
import { useCallback, useEffect, useState } from 'react';

import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import {
    addTimesheetEntry,
    deleteTimesheetEntry,
    getTimesheetWeek,
    setTimesheetAutoSubmit,
    submitTimesheetChangeRequest,
    submitTimesheetWeek,
    updateTimesheetEntry,
} from '../api';
import type { ChangeRequestInput, TimesheetEntryInput, TimesheetWeekView } from '../types';

export const useMyTimesheet = (weekStart: string) => {
    const { role, id } = useEssIdentity();
    const scope = { userType: role, userId: id };
    const [view, setView] = useState<TimesheetWeekView | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTimesheetWeek({ userType: role, userId: id }, weekStart);
        if (res) setView(res);
        setLoading(false);
    }, [role, id, weekStart]);

    useEffect(() => {
        load();
    }, [load]);

    /** Runs a mutation; keeps the returned view on success. Resolves true when it succeeded. */
    const run = async (action: () => Promise<TimesheetWeekView | false>) => {
        setBusy(true);
        const res = await action();
        setBusy(false);
        if (res) setView(res);
        return !!res;
    };

    return {
        view,
        loading,
        busy,
        reload: load,
        addEntry: (body: TimesheetEntryInput) => run(() => addTimesheetEntry(scope, body)),
        updateEntry: (entryId: string, body: TimesheetEntryInput) =>
            run(() => updateTimesheetEntry(scope, entryId, body)),
        deleteEntry: (entryId: string) => run(() => deleteTimesheetEntry(scope, entryId)),
        submitWeek: () => run(() => submitTimesheetWeek(scope, weekStart)),
        submitChangeRequest: (body: ChangeRequestInput) =>
            run(() => submitTimesheetChangeRequest(scope, weekStart, body)),
        setAutoSubmit: async (autoSubmit: boolean) => {
            const res = await setTimesheetAutoSubmit(scope, autoSubmit);
            if (res && view) setView({ ...view, autoSubmit: res.autoSubmit });
            return !!res;
        },
    };
};

export default useMyTimesheet;
