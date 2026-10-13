// PROTOTYPE-SETUP (Overview, Slice 4): ESS - Employee's profile editing with HR approval (prototype "MyProfile"),
// shown on the existing Profile page in place of the read-only Personal Info card and its request modal.
//   Work details   read-only — "Managed by HR. Ask HR if something here is wrong."
//   Personal info  mobile, personal email, current address, emergency contact (name, relationship, phone) and
//                  the photo (Change photo / Remove, max 1 MB) — "Send to HR for approval"
// While an update is waiting for HR: an amber banner lists each change (old → new) with Withdraw, and the
// fields and photo are locked. After HR decides: a blue "approved" or a red "rejected" banner with HR's reason.
// The profile only changes when HR approves (Payroll → Approvals → HR → Profile updates).
import { ChangeEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Input, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD, ESS_LABEL, ESS_SECTION_TITLE } from '@src/components/ess/essTokens';
import { useAppDispatch } from '@src/hooks/store';
import {
    MAX_PHOTO_BYTES,
    PROFILE_MESSAGES,
    RuleError,
    profileChanges,
    validatePersonalDetails,
} from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { getMyProfile, sendProfileUpdate, withdrawProfileUpdate } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import ProfilePhoto from '../overview/ProfilePhoto';
import type { MyProfileView, PersonalDetails, PersonalField, ProfileChange } from '../types';

const { Text } = Typography;

// PROTOTYPE-SETUP (ESS design, Slice 4): the ESS card and section title.
const CARD = ESS_CARD;

const changeText = (c: ProfileChange) => {
    if (c.field === 'photo') return c.to ? 'New photo' : 'Photo removed';
    return `${c.label}: ${c.from || '—'} → ${c.to || '—'}`;
};

const ReadOnly = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="min-w-0">
        <Text className={`block ${ESS_LABEL}`}>{label}</Text>
        <Text className="block break-words text-base font-medium text-[#080808]">{children}</Text>
    </div>
);

const Field = ({ label, id, children, wide }: { label: string; id: string; children: ReactNode; wide?: boolean }) => (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
        <label htmlFor={id} className="text-xs text-gray-500">
            {label}
        </label>
        {children}
    </div>
);

const EssProfileEditor = () => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const fileInput = useRef<HTMLInputElement>(null);
    const [view, setView] = useState<MyProfileView | null>(null);
    const [form, setForm] = useState<PersonalDetails | null>(null);
    const [failed, setFailed] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<'send' | 'withdraw' | null>(null);

    const apply = (next: MyProfileView) => {
        setView(next);
        setForm(next.personal);
        setError('');
    };

    const load = useCallback(async () => {
        setFailed(false);
        const res = await getMyProfile(scope);
        if (res) apply(res);
        else setFailed(true);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    if (!view || !form) {
        return (
            <div className={CARD}>
                {failed ? (
                    <Empty description="Couldn't load your profile right now.">
                        <Button icon={<ReloadOutlined />} onClick={load}>
                            Try again
                        </Button>
                    </Empty>
                ) : (
                    <Skeleton active paragraph={{ rows: 6 }} />
                )}
            </div>
        );
    }

    const { work, pending, lastDecided } = view;
    const locked = Boolean(pending);
    const changes = profileChanges(view.personal, form);
    const dirty = changes.length > 0;

    const set = (field: PersonalField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [field]: e.target.value });
        setError('');
    };

    const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > MAX_PHOTO_BYTES) {
            setError(PROFILE_MESSAGES.photo);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setForm(f => (f ? { ...f, photo: String(reader.result) } : f));
            setError('');
        };
        reader.readAsDataURL(file);
    };

    const send = async () => {
        try {
            validatePersonalDetails(form);
        } catch (e) {
            setError(e instanceof RuleError ? e.message : 'Check your details.');
            return;
        }
        setBusy('send');
        const res = await sendProfileUpdate(scope, Object.fromEntries(changes.map(c => [c.field, c.to])));
        setBusy(null);
        if (!res) return;
        apply(res);
        dispatch(showToast({ description: 'Sent to HR for approval', variant: 'success' }));
    };

    const withdraw = async () => {
        if (!pending) return;
        setBusy('withdraw');
        const res = await withdrawProfileUpdate(scope, pending.id);
        setBusy(null);
        if (!res) return;
        apply(res);
        dispatch(showToast({ description: 'Update withdrawn', variant: 'success' }));
    };

    const rejection = lastDecided?.trail.steps.find(s => s.decision === 'REJECTED');
    let banner: ReactNode = null;
    if (pending) {
        banner = (
            <Alert
                type="warning"
                showIcon
                message={<b className="font-semibold">Waiting for HR approval</b>}
                description={
                    <div className="flex flex-col gap-1">
                        <span className="text-xs">Sent {dayjs(pending.createdAt).format('D MMM')}:</span>
                        <ul className="m-0 pl-4 text-xs">
                            {pending.changes.map(c => (
                                <li key={c.field} className="break-words">
                                    {changeText(c)}
                                </li>
                            ))}
                        </ul>
                    </div>
                }
                action={
                    <Button size="small" loading={busy === 'withdraw'} onClick={withdraw}>
                        Withdraw
                    </Button>
                }
            />
        );
    } else if (lastDecided?.trail.status === 'APPROVED') {
        banner = <Alert type="info" showIcon message={`HR approved your last update on ${dayjs(lastDecided.updatedAt).format('D MMM')}.`} />;
    } else if (lastDecided?.trail.status === 'REJECTED') {
        banner = <Alert type="error" showIcon message="HR didn’t approve your last update" description={rejection?.comment || 'No reason given.'} />;
    }

    return (
        <>
            <section aria-label="Work details" className={CARD}>
                <Text className={`block ${ESS_SECTION_TITLE}`}>Work details</Text>
                <Text className="mb-5 block text-xs text-gray-500">Managed by HR. Ask HR if something here is wrong.</Text>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <ReadOnly label="Employee ID">{work.employeeId}</ReadOnly>
                    <ReadOnly label="Work email">{work.workEmail}</ReadOnly>
                    <ReadOnly label="Role and grade">
                        {work.designation} · {work.grade}
                    </ReadOnly>
                    <ReadOnly label="Department">{work.department}</ReadOnly>
                    <ReadOnly label="Reports to">
                        {work.manager ? (
                            <>
                                {work.manager.name}
                                <span className="block text-xs font-normal text-gray-500">{work.manager.designation}</span>
                            </>
                        ) : (
                            'No reporting manager'
                        )}
                    </ReadOnly>
                    <ReadOnly label="Shift">
                        {work.shift.start}–{work.shift.end}
                    </ReadOnly>
                </div>
            </section>

            <section aria-label="Personal info" className={CARD}>
                <Text className={`block ${ESS_SECTION_TITLE}`}>Personal info</Text>
                <Text className="mb-5 block text-xs text-gray-500">
                    Changes go to HR for approval. Your profile updates once HR approves them.
                </Text>
                {banner && <div className="mb-5">{banner}</div>}

                <div className="mb-6 flex flex-wrap items-center gap-4">
                    <ProfilePhoto name={work.name} photo={form.photo} size={72} />
                    <div className="flex flex-col gap-1.5">
                        <div className="flex gap-2">
                            <Button size="small" disabled={locked} onClick={() => fileInput.current?.click()}>
                                Change photo
                            </Button>
                            {form.photo && (
                                <Button size="small" type="text" disabled={locked} onClick={() => setForm({ ...form, photo: null })}>
                                    Remove
                                </Button>
                            )}
                        </div>
                        <Text className="text-xs text-gray-500">
                            {locked ? 'Photo changes are locked while HR reviews your update.' : 'An image up to 1 MB.'}
                        </Text>
                        <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="Upload a photo" onChange={onPhoto} />
                    </div>
                </div>

                <Text className="text-[12px] font-medium uppercase text-gray-400">Contact information</Text>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Field label="Mobile number" id="pf-mobile">
                        <Input id="pf-mobile" type="tel" value={form.mobile} disabled={locked} onChange={set('mobile')} />
                    </Field>
                    <Field label="Personal email" id="pf-email">
                        <Input id="pf-email" type="email" value={form.personalEmail} disabled={locked} onChange={set('personalEmail')} />
                    </Field>
                    <Field label="Current address" id="pf-address" wide>
                        <Input.TextArea id="pf-address" rows={2} value={form.address} disabled={locked} onChange={set('address')} />
                    </Field>
                </div>

                <div className="my-6 border-0 border-t border-solid border-[#f0f0f0]" />

                <Text className="text-[12px] font-medium uppercase text-gray-400">Emergency contact</Text>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Field label="Name" id="pf-ec-name">
                        <Input id="pf-ec-name" value={form.emergencyName} disabled={locked} onChange={set('emergencyName')} />
                    </Field>
                    <Field label="Relationship" id="pf-ec-rel">
                        <Input id="pf-ec-rel" value={form.emergencyRelation} disabled={locked} onChange={set('emergencyRelation')} />
                    </Field>
                    <Field label="Phone" id="pf-ec-phone">
                        <Input id="pf-ec-phone" type="tel" value={form.emergencyPhone} disabled={locked} onChange={set('emergencyPhone')} />
                    </Field>
                </div>

                {error && (
                    <Text role="alert" className="mt-4 block text-sm !text-red-600">
                        {error}
                    </Text>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button type="primary" danger disabled={!dirty || locked} loading={busy === 'send'} onClick={send}>
                        Send to HR for approval
                    </Button>
                    {dirty && !locked && <Button onClick={() => apply(view)}>Discard</Button>}
                    {!dirty && (
                        <Text className="text-xs text-gray-500">
                            {locked ? 'You can make more changes once HR responds.' : 'No unsaved changes'}
                        </Text>
                    )}
                </div>
            </section>
        </>
    );
};

export default EssProfileEditor;
