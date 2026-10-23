// PROTOTYPE-SETUP (Final batch, Slice 2): "Working from" — Attendance only mode, on the Overview's Attendance card
// and the Attendance tab's Today card (both through AttendancePunch). Office | Home | Client site; a client site asks
// for the client's name ("Set", Enter). Before check-in the choice is used for the check-in; while checked in a change
// is stamped with the time ("Office 9:30 AM → Client site (Brightline) 2:00 PM"); after check-out only the trail shows.
// No geofencing: it's what the employee says.
import { useState } from 'react';

import { Button, Input, Segmented } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { LOCATION_LABEL, dayLocations, locationTrailText, workingFromText } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { setWorkingFrom } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview, WorkLocation } from '../types';

const OPTIONS = (Object.keys(LOCATION_LABEL) as WorkLocation[]).map(value => ({ value, label: LOCATION_LABEL[value] }));

const LocationBar = ({ overview, onOverview }: { overview: AtsOverview; onOverview: (next: AtsOverview) => void }) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const t = overview.today;
    const current = t.workingFrom ?? { location: 'OFFICE' as const };
    const [asking, setAsking] = useState(false);
    const [client, setClient] = useState('');
    const [busy, setBusy] = useState(false);
    const trail = dayLocations(t.locations, t.checkIn);
    const done = Boolean(t.checkIn && t.checkOut);

    const save = async (location: WorkLocation, name?: string) => {
        setBusy(true);
        const next = await setWorkingFrom(scope, { location, ...(name ? { client: name } : {}) });
        setBusy(false);
        if (!next) return;
        setAsking(false);
        setClient('');
        onOverview(next);
        const now = next.today.checkIn && !next.today.checkOut ? next.today.locations?.at(-1)?.at : null;
        dispatch(showToast({ description: workingFromText({ location, client: name }, now), variant: 'success' }));
    };

    const pick = (v: WorkLocation) => {
        if (v === 'CLIENT') {
            setClient(current.location === 'CLIENT' ? current.client ?? '' : '');
            setAsking(true);
            return;
        }
        setAsking(false);
        if (v !== current.location) save(v);
    };

    return (
        <div className="flex min-w-0 flex-col gap-1.5" data-location-bar>
            {!done && (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm text-[#616161]">Working from</span>
                    <Segmented
                        size="small"
                        aria-label="Work location"
                        value={asking ? 'CLIENT' : current.location}
                        options={OPTIONS}
                        disabled={busy}
                        onChange={v => pick(v as WorkLocation)}
                    />
                </div>
            )}
            {!done && asking && (
                <div className="flex min-w-0 items-center gap-1.5">
                    <Input
                        size="small"
                        className="min-w-0 flex-1"
                        placeholder="Client name"
                        aria-label="Client name"
                        maxLength={60}
                        autoFocus
                        value={client}
                        onChange={e => setClient(e.target.value)}
                        onPressEnter={() => client.trim() && save('CLIENT', client.trim())}
                    />
                    <Button size="small" type="primary" disabled={!client.trim()} loading={busy} onClick={() => save('CLIENT', client.trim())}>
                        Set
                    </Button>
                    <Button size="small" type="text" onClick={() => setAsking(false)}>
                        Cancel
                    </Button>
                </div>
            )}
            {!done && !asking && current.location === 'CLIENT' && current.client && (
                <span className="text-xs text-[#616161]">Client: {current.client}</span>
            )}
            {(trail.length > 1 || (done && trail.length > 0)) && (
                <span className="break-words text-xs text-[#616161]" data-location-trail>
                    {locationTrailText(trail)}
                </span>
            )}
        </div>
    );
};

export default LocationBar;
