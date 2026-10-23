// PROTOTYPE-SETUP (Overview, Slice 1): profile updates. An employee edits their personal details (and photo);
// the change goes straight to HR (no manager step) and the profile only changes when HR approves. One pending
// update per employee. Approved values are kept per employee on top of the employee seed.
import type {
    MyProfileView,
    PersonalDetails,
    ProfileUpdateRequest,
} from '@src/domains/attendanceTimesheet/types';
import {
    DEFAULT_SETTINGS,
    PROFILE_MESSAGES,
    RuleError,
    applyProfileChanges,
    cancelTrail,
    profileChanges,
    startTrail,
    trailLabel,
    validatePersonalDetails,
    resubmitTrail,
} from '@src/prototype/rules/attendance';

import { getSettings, nowIso } from './atsStore';
import { createCollection } from './persistentStore';
import { isoDateTime } from '../data/dates';
import { MockEmployee, findEmployee, managerOf } from '../data/employees';
import { workingDayOffset, todayIso } from '../data/time-calendar';
import type { DataMode } from '../envelope';

/** "9845023817" → "+91 98450 23817" */
const phone = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-10);
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
};

/** The personal details as seeded (before any approved update). */
const seededPersonal = (e: MockEmployee): PersonalDetails => ({
    mobile: phone(e.mobileNo),
    personalEmail: e.personalEmail,
    address: e.homeAddress,
    emergencyName: e.emergencyContact.name,
    emergencyRelation: e.emergencyContact.relation,
    emergencyPhone: phone(e.emergencyContact.mobileNo),
    photo: null,
});

/** One update already waiting for HR, so the HR queue has something on a fresh load (not the ESS persona). */
const seedRequests = (): ProfileUpdateRequest[] => {
    const karthik = findEmployee('ACME-005');
    if (!karthik) return [];
    const at = isoDateTime(workingDayOffset(todayIso(), -1), '05:10:00');
    const from = seededPersonal(karthik);
    return [
        {
            id: 'pu-001',
            employeeId: karthik.id,
            changes: profileChanges(from, { address: '22, 4th Main, Jayanagar 4th Block, Bengaluru, Karnataka 560011', mobile: '+91 98860 17420' }),
            trail: startTrail('profile', null, DEFAULT_SETTINGS),
            createdAt: at,
            updatedAt: at,
        },
    ];
};

/** Approved overrides per employee id. */
export const atsProfiles = createCollection<Record<string, Partial<PersonalDetails>>>('ats-profiles', () => ({}));

export const atsProfileRequests = createCollection<ProfileUpdateRequest[]>('ats-profile-requests', mode =>
    mode === 'empty' ? [] : seedRequests()
);

/** Empty mode: a new account — nothing filled in yet (PROTOTYPE-SETUP: Final batch, Slice 8). */
const EMPTY_PERSONAL: PersonalDetails = { mobile: '', personalEmail: '', address: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '', photo: null };

/** What everyone sees: the seed plus approved updates. */
export const personalOf = (mode: DataMode, e: MockEmployee): PersonalDetails => ({
    ...(mode === 'empty' ? EMPTY_PERSONAL : seededPersonal(e)),
    ...(atsProfiles.get(mode)[String(e.id)] ?? {}),
});

export const profileRequestsOf = (mode: DataMode, e: MockEmployee) =>
    atsProfileRequests
        .get(mode)
        .filter(r => r.employeeId === e.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const withLabel = (r: ProfileUpdateRequest) => ({ ...r, statusLabel: trailLabel(r.trail) });

export const myProfileOf = (mode: DataMode, e: MockEmployee): MyProfileView => {
    const m = managerOf(e);
    const requests = profileRequestsOf(mode, e);
    const pending = requests.find(r => r.trail.status === 'PENDING_HR');
    const askedForUpdate = requests.find(r => r.trail.status === 'UPDATE_REQUESTED');
    const lastDecided = requests.find(r => r.trail.status === 'APPROVED' || r.trail.status === 'REJECTED');
    return {
        work: {
            employeeId: e.employeeId,
            name: e.fullName,
            designation: e.designation,
            grade: e.grade,
            department: e.department,
            workEmail: e.email,
            dateOfJoin: e.dateOfJoin,
            manager: m ? { name: m.fullName, designation: m.designation } : null,
            shift: getSettings(mode).shift,
        },
        personal: personalOf(mode, e),
        pending: pending ? withLabel(pending) : null,
        updateRequested: askedForUpdate ? withLabel(askedForUpdate) : null,
        lastDecided: lastDecided ? withLabel(lastDecided) : null,
    };
};

/** Send the changed fields to HR. The body may hold any subset of the personal details. */
export const createProfileRequest = (mode: DataMode, e: MockEmployee, input: Partial<PersonalDetails>) => {
    if (profileRequestsOf(mode, e).some(r => r.trail.status === 'PENDING_HR')) throw new RuleError(PROFILE_MESSAGES.pending);
    const current = personalOf(mode, e);
    const next: PersonalDetails = { ...current, ...(input ?? {}) };
    validatePersonalDetails(next);
    const changes = profileChanges(current, input ?? {});
    if (!changes.length) throw new RuleError(PROFILE_MESSAGES.nothing, 400);
    const at = nowIso();
    // PROTOTYPE-SETUP (My team, Slice 1): HR asked for an update — this sends that request again, with the new values.
    const asked = profileRequestsOf(mode, e).find(r => r.trail.status === 'UPDATE_REQUESTED');
    if (asked) {
        const trail = resubmitTrail(asked.trail, at, e.fullName);
        atsProfileRequests.update(mode, list => list.map(x => (x.id === asked.id ? { ...x, changes, trail, updatedAt: at } : x)));
        return myProfileOf(mode, e);
    }
    const request: ProfileUpdateRequest = {
        id: `pu-${Date.now().toString(36)}`,
        employeeId: e.id,
        changes,
        trail: startTrail('profile', null, getSettings(mode)),
        createdAt: at,
        updatedAt: at,
    };
    atsProfileRequests.update(mode, list => [request, ...list]);
    return myProfileOf(mode, e);
};

export const withdrawProfileRequest = (mode: DataMode, e: MockEmployee, id: string) => {
    const r = atsProfileRequests.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!r) throw new RuleError('Update not found.', 404);
    const trail = cancelTrail(r.trail);
    atsProfileRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: nowIso() } : x)));
    return myProfileOf(mode, e);
};

/** HR approved: apply the new values. */
export const applyApprovedProfile = (mode: DataMode, r: ProfileUpdateRequest) => {
    const e = findEmployee(r.employeeId);
    if (!e) return;
    const next = applyProfileChanges(personalOf(mode, e), r.changes);
    atsProfiles.update(mode, all => ({ ...all, [String(e.id)]: next }));
};
