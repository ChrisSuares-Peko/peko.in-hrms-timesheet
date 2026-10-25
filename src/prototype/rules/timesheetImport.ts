// PROTOTYPE-SETUP (Final batch, Slice 3): the timesheet template and CSV upload — pure, so the screens and the mock
// server share it. Wording from docs/prototypes/attendance-timesheet.html (TemplateModal / UploadModal).
//   template ..... Date, Start time, End time, Hours, Location, Project code, Description; four example rows from
//                  this week (times, hours only, a client site that ends the next morning)
//   upload ....... header synonyms; each row is checked (date, payroll processed, more than 30 days ahead, times,
//                  hours, project code, description, location, then the entry rules — validateEntry with the company's
//                  fields, as the form does); only ready rows are imported, as a draft
// Overlapping another entry is allowed, as in the form (f19137e): the row is ready, with a note. Overlapping a recorded
// break isn't.
// PROTOTYPE-SETUP (Timesheet v6, Slice 4): "Download timesheet" exports the same columns + Status (breaks as rows with
// Location "Break"), so a downloaded file uploads back: a row that matches a saved entry (date, times / hours,
// location, project) is skipped when nothing changed ("Already saved"), or updates that entry when only its
// description changed; "Break" rows are skipped. Excel files are read as text (sheetCellText) and sent as CSV.
import type { TimesheetEntry, TimesheetFields, TimesheetLeaveRow, TimesheetStatus, TimesheetWeek, WorkLocation } from '@src/domains/attendanceTimesheet/types';

import {
    MAX_DAY_MINUTES,
    PROJECT_CODE_RE,
    RuleError,
    addDays,
    daysBetween,
    displayTime,
    entryTimeText,
    formatDuration,
    formatHoursInput,
    isDerivedRow,
    locationChip,
    normaliseProjectCode,
    parseHours,
    toMinutes,
    usesTimes,
    validateEntry,
} from './attendance';
import { findOverlaps, rangeText } from './timesheetFiling';

export const TEMPLATE_COLUMNS = ['Date', 'Start time', 'End time', 'Hours', 'Location', 'Project code', 'Description'] as const;
export type ImportColumn = (typeof TEMPLATE_COLUMNS)[number];

/**
 * The template's example rows (`weekStart` = this week's Monday), per the company's fields (f19137e): times and an
 * hours-only row when both are accepted; times only when start and end are required; hours only in duration-only
 * filing.
 */
export const templateRows = (weekStart: string, projectCode = '', fields?: TimesheetFields): string[][] => {
    const timed = !fields || usesTimes(fields);
    const hoursOnly = !fields || !usesTimes(fields);
    const tue = addDays(weekStart, 1);
    const row = (date: string, start: string, end: string, hours: string, where: string, text: string) =>
        timed ? [date, start, end, '', where, projectCode, text] : [date, '', '', hours, where, projectCode, text];
    return [
        [...TEMPLATE_COLUMNS],
        row(weekStart, '09:30', '11:00', '1:30', 'Office', 'Sprint planning'),
        row(weekStart, '11:00', '13:00', '2:00', 'Office', 'Payroll API work'),
        timed && hoursOnly ? [tue, '', '', '2:30', 'Home', projectCode, 'Code review (hours only)'] : row(tue, '14:00', '16:30', '2:30', 'Home', 'Code review'),
        row(tue, '22:00', '01:00', '3:00', 'Client: Brightline', timed ? 'Release cutover (ends next day)' : 'Release cutover'),
    ];
};

/** The template's first line, per the company's fields. */
export const templateIntro = (fields: TimesheetFields | undefined, projectsOn: boolean) => {
    let how = 'Use start and end times, or hours only. An end time earlier than the start counts as the next morning.';
    if (fields && usesTimes(fields)) how = 'Use a start and end time on every row. An end time earlier than the start counts as the next morning.';
    if (fields && !usesTimes(fields)) how = 'Use hours only (your company doesn’t record start and end times).';
    return `Fill one row per task, then use Upload timesheet. ${how} ${projectsOn ? TEMPLATE_TEXT.projectsOn : TEMPLATE_TEXT.projectsOff}`;
};

export const toCsv = (rows: string[][]) => rows.map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

// ---- download (PROTOTYPE-SETUP: Timesheet v6, Slice 4) ----------------------------------------------------------

export const EXPORT_COLUMNS = [...TEMPLATE_COLUMNS, 'Status'] as const;

/** The Status column. */
export const EXPORT_STATUS: Record<TimesheetStatus, string> = {
    DRAFT: 'Saved',
    SUBMITTED: 'With manager',
    WITH_PAYROLL: 'With Payroll',
    APPROVED: 'Approved',
    SENT_BACK: 'Update requested',
};

/** An entry's Status: its period's, except a date changed since sending (Saved) — and an edited period's other dates keep where they were. */
export const exportStatus = (period: Pick<TimesheetWeek, 'status' | 'dirtyDates' | 'editedAfter'>, date: string) => {
    if (period.dirtyDates?.includes(date)) return EXPORT_STATUS.DRAFT;
    if (period.status === 'DRAFT' && period.editedAfter) return EXPORT_STATUS[period.editedAfter];
    return EXPORT_STATUS[period.status];
};

/** One entry as a row (the template's columns + Status). */
export const exportEntryRow = (x: TimesheetEntry, status: string, projectsOn: boolean): string[] => [
    x.date,
    x.start ?? '',
    x.end ?? '',
    formatHoursInput(x.mins),
    locationChip(x.location, x.client),
    projectsOn ? x.projectCode ?? '' : '',
    x.description,
    status,
];

/** PROTOTYPE-SETUP (Leave & team, Slice 1): a leave / holiday row: Location "Leave" / "Public holiday" (an upload skips it). */
export const exportLeaveRow = (date: string, r: TimesheetLeaveRow, status: string): string[] => [date, r.start, r.end, formatHoursInput(r.minutes), r.tag, '', r.description, status];

/** A recorded break as a row: Location "Break" (an upload skips it). */
export const exportBreakRow = (b: TimesheetEntry): string[] => [b.date, b.start ?? '', b.end ?? '', formatHoursInput(b.mins), 'Break', '', b.description || 'Break', ''];

export const EXPORT_MAX_DAYS = 366;

/** Why a download range can't be used, or ''. */
export const exportRangeError = (from: string, to: string) => {
    if (!from || !to) return 'Pick a From and a To date.';
    if (to < from) return 'From must be on or before To.';
    if (daysBetween(from, to) >= EXPORT_MAX_DAYS) return 'Pick at most one year.';
    return '';
};

/** "timesheet-2026-10-01-to-2026-10-31.xlsx" */
export const exportFileName = (from: string, to: string) => `timesheet-${from}-to-${to}.xlsx`;

/** Tab-separated rows ("Copy rows" — pastes into a spreadsheet as cells). */
export const toTsv = (rows: string[][]) => rows.map(r => r.map(c => c.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');

/** "N entries · X logged" */
export const exportSummary = (entries: number, loggedMinutes: number) => `${entries} ${entries === 1 ? 'entry' : 'entries'} · ${formatDuration(loggedMinutes)} logged`;

const two = (n: number) => String(n).padStart(2, '0');

/**
 * An Excel cell as the text a person sees: a date cell → YYYY-MM-DD, a time cell (Excel's 1899-12-30 day) → HH:mm,
 * anything else → its formatted text (`text`, when the reader has it) or its value.
 */
export const sheetCellText = (value: unknown, text?: string): string => {
    if (value instanceof Date) {
        if (value.getUTCFullYear() < 1901) return `${two(value.getUTCHours())}:${two(value.getUTCMinutes())}`;
        return `${value.getUTCFullYear()}-${two(value.getUTCMonth() + 1)}-${two(value.getUTCDate())}`;
    }
    if (text !== undefined && text !== '') return String(text).trim();
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

export const TEMPLATE_TEXT = {
    projectsOn: 'Project code is required.',
    projectsOff: 'Leave Project code empty (projects are off for your company).',
    formats: 'Dates as YYYY-MM-DD or DD/MM/YYYY. Times as 09:30 or 9:30 AM. Hours as 1:30, 1.5 or 1h 30m.',
    beforeFile: 'Download the template first if you don’t have it. Your file is checked before anything is added.',
} as const;

export const IMPORT_MESSAGES = {
    empty: 'The file is empty.',
    columns: 'Missing columns. The file needs Date, Description, and either Hours or Start time + End time. Download the template to get the right columns.',
    date: 'Date isn’t readable',
    locked: 'Payroll is processed for that month',
    beforeJoining: 'Before your joining date',
    future: 'Too far in the future',
    time: 'Time isn’t readable',
    oneTime: 'Needs both times, or a start time and hours',
    noTime: 'Needs hours or start and end times',
    hours: 'Hours must be between 0 and 24',
    projectMissing: 'Project code missing',
    project: (code: string) => `Unknown project code “${code}”`,
    description: 'Description missing',
    locationMissing: 'Location missing (Office, Home or Client: Name)',
    clientMissing: 'Client name missing (use “Client: Name”)',
    location: 'Location must be Office, Home or Client: Name',
    unchanged: 'Already saved',
    break: 'Break (from Attendance)',
    leave: 'Leave or holiday (filled in for you)',
    updates: 'Updates the saved entry’s description',
} as const;

/**
 * PROTOTYPE-SETUP (Timesheet v6, Slice 4): the row is this saved entry — the same times (or hours, without times),
 * location and project (when projects are on), as the download writes them; the description may differ.
 */
const sameSlot = (o: TimesheetEntry, r: Pick<ImportRow, 'start' | 'end' | 'hours' | 'location' | 'project'>, projectsOn: boolean) => {
    const start = parseImportTime(r.start);
    const end = parseImportTime(r.end);
    const times = o.start ? start === o.start && end === o.end : !start && !end && parseHours(r.hours) === o.mins;
    const where = parseImportLocation(r.location);
    return (
        times &&
        typeof where !== 'string' &&
        where.location === (o.location ?? 'OFFICE') &&
        (where.client ?? '') === (o.client ?? '') &&
        (!projectsOn || normaliseProjectCode(r.project) === (o.projectCode ?? ''))
    );
};

/** Header names → template columns. */
export const HEADER_ALIASES: Record<string, ImportColumn> = {
    date: 'Date',
    day: 'Date',
    start: 'Start time',
    'start time': 'Start time',
    from: 'Start time',
    end: 'End time',
    'end time': 'End time',
    to: 'End time',
    hours: 'Hours',
    duration: 'Hours',
    project: 'Project code',
    'project code': 'Project code',
    code: 'Project code',
    description: 'Description',
    task: 'Description',
    work: 'Description',
    notes: 'Description',
    location: 'Location',
    'work location': 'Location',
    'working from': 'Location',
    where: 'Location',
};

/** CSV text → rows of trimmed cells (quoted cells may hold commas and doubled quotes). Blank lines are skipped. */
export const parseCsv = (text: string): string[][] =>
    text
        .replace(/^\uFEFF/, '')
        .replace(/\r/g, '')
        .split('\n')
        .filter(l => l.trim())
        .map(line => {
            const out: string[] = [];
            let cur = '';
            let quoted = false;
            for (let i = 0; i < line.length; i += 1) {
                const c = line[i];
                if (quoted && c === '"' && line[i + 1] === '"') {
                    cur += '"';
                    i += 1;
                } else if (c === '"') quoted = !quoted;
                else if (c === ',' && !quoted) {
                    out.push(cur.trim());
                    cur = '';
                } else cur += c;
            }
            out.push(cur.trim());
            return out;
        });

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-19" or "19/10/2026" → ISO; '' → null; anything else → undefined (unreadable). */
export const parseImportDate = (v: string): string | null | undefined => {
    const t = v.trim();
    if (!t) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Number.isNaN(Date.parse(`${t}T00:00:00Z`)) ? undefined : t;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!m) return undefined;
    const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[1]) ? undefined : iso;
};

/** "09:30", "9:30 AM", "9:30pm" → "HH:mm"; '' → null; anything else → undefined. */
export const parseImportTime = (v: string): string | null | undefined => {
    const t = v.trim();
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(t);
    if (!m) return undefined;
    let h = Number(m[1]);
    const mm = Number(m[2]);
    if (m[3]) {
        if (h < 1 || h > 12) return undefined;
        const pm = /pm/i.test(m[3]);
        if (h === 12) h = pm ? 12 : 0;
        else if (pm) h += 12;
    }
    if (h > 23 || mm > 59) return undefined;
    return `${pad(h)}:${pad(mm)}`;
};

/** "Office", "Home" / "WFH", "Client: Brightline" / "Client (Brightline)" → the location, or why not. */
export const parseImportLocation = (v: string): { location: WorkLocation; client?: string } | string => {
    const t = v.trim();
    const lower = t.toLowerCase();
    if (!lower) return IMPORT_MESSAGES.locationMissing;
    if (lower.startsWith('office')) return { location: 'OFFICE' };
    if (lower.startsWith('home') || lower === 'wfh') return { location: 'HOME' };
    if (lower.startsWith('client')) {
        const client = (t.split(/[:(]/)[1] ?? '').replace(')', '').trim();
        return client ? { location: 'CLIENT', client: client.slice(0, 60) } : IMPORT_MESSAGES.clientMissing;
    }
    return IMPORT_MESSAGES.location;
};

export interface ImportRow {
    /** The file's row number (the header is row 1). */
    row: number;
    /** PROTOTYPE-SETUP (Timesheet v6, Slice 4): left out, and not a problem — "Already saved" / "Break". */
    skipped?: string;
    /** Ready, and it updates this saved entry (only its description changed). */
    replaces?: string;
    /** As typed. */
    date: string;
    start: string;
    end: string;
    hours: string;
    location: string;
    project: string;
    description: string;
    ready: boolean;
    /** Why it won't be imported. */
    reason?: string;
    /** Ready, but worth a look (it overlaps another entry). */
    note?: string;
    /** What gets added (ready rows). */
    entry?: Omit<TimesheetEntry, 'id'>;
}

export interface ImportPreview {
    /** A problem with the whole file. */
    error?: string;
    /** Each header cell's column, or null (ignored). */
    columns?: (ImportColumn | null)[];
    rows?: ImportRow[];
    ready: number;
}

export interface ImportContext {
    today: string;
    fields: TimesheetFields;
    /** The company's codes (a code on the list, or any well-formed code — as the entry form allows). */
    projectCodes: string[];
    isLocked: (date: string) => boolean;
    dateOfJoin?: string;
    /** The day's saved entries and its recorded breaks (`break:` ids). */
    existingOn: (date: string) => TimesheetEntry[];
}

/** Matched columns line: "Date · Start time · (ignored) · …" */
export const columnsText = (columns: (ImportColumn | null)[]) => columns.map(c => c ?? '(ignored)').join(' · ');

/** Checks a file: the columns, then every row. Rows are checked against what's saved and the rows above them. */
export const analyseImport = (text: string, ctx: ImportContext): ImportPreview => {
    const rows = parseCsv(text);
    if (!rows.length) return { error: IMPORT_MESSAGES.empty, ready: 0 };
    const columns = rows[0].map(h => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
    const has = (c: ImportColumn) => columns.includes(c);
    if (!has('Date') || !has('Description') || !(has('Hours') || (has('Start time') && has('End time')))) {
        return { error: IMPORT_MESSAGES.columns, columns, ready: 0 };
    }
    const taken = new Map<string, TimesheetEntry[]>();
    const claimed = new Set<string>();
    const codesOn = ctx.fields.projectCode;
    const out = rows.slice(1).map((cells, i): ImportRow => {
        const cell = (c: ImportColumn) => {
            const j = columns.indexOf(c);
            return j >= 0 ? cells[j] ?? '' : '';
        };
        const row: ImportRow = {
            row: i + 2,
            date: cell('Date'),
            start: cell('Start time'),
            end: cell('End time'),
            hours: cell('Hours'),
            location: cell('Location'),
            project: cell('Project code'),
            description: cell('Description'),
            ready: false,
        };
        const bad = (reason: string): ImportRow => ({ ...row, reason });
        if (row.location.trim().toLowerCase() === 'break') return { ...row, skipped: IMPORT_MESSAGES.break };
        // PROTOTYPE-SETUP (Leave & team, Slice 1): leave / public-holiday rows come from approved leave and the calendar.
        if (['leave', 'public holiday'].includes(row.location.trim().toLowerCase())) return { ...row, skipped: IMPORT_MESSAGES.leave };
        const date = parseImportDate(row.date);
        if (!date) return bad(IMPORT_MESSAGES.date);
        // PROTOTYPE-SETUP (Timesheet v6, Slice 4): a row that is a saved entry (a downloaded file) — skipped when
        // unchanged (before any other check: a locked day, or an entry after midnight, stays as it is), or an update of
        // that entry's description (it keeps everything else).
        const same = ctx.existingOn(date).find(o => !isDerivedRow(o.id) && !claimed.has(o.id) && sameSlot(o, row, codesOn));
        if (same) claimed.add(same.id);
        if (same && same.description.trim() === row.description.trim()) return { ...row, skipped: IMPORT_MESSAGES.unchanged };
        if (ctx.isLocked(date)) return bad(IMPORT_MESSAGES.locked);
        if (ctx.dateOfJoin && date < ctx.dateOfJoin) return bad(IMPORT_MESSAGES.beforeJoining);
        if (date > addDays(ctx.today, 30)) return bad(IMPORT_MESSAGES.future);
        const start = parseImportTime(row.start);
        const end = parseImportTime(row.end);
        if (start === undefined || end === undefined) return bad(IMPORT_MESSAGES.time);
        const hoursText = row.hours.trim();
        if (end && !start) return bad(IMPORT_MESSAGES.oneTime);
        if (start && !end && !hoursText) return bad(IMPORT_MESSAGES.oneTime);
        if (!start && !hoursText) return bad(IMPORT_MESSAGES.noTime);
        if (start && end && toMinutes(start) === toMinutes(end)) return bad(IMPORT_MESSAGES.hours);
        if (hoursText && !(start && end)) {
            const h = parseHours(hoursText);
            if (h === null || h <= 0 || h > MAX_DAY_MINUTES) return bad(IMPORT_MESSAGES.hours);
        }
        const code = normaliseProjectCode(row.project);
        if (codesOn && !code) return bad(IMPORT_MESSAGES.projectMissing);
        if (codesOn && !ctx.projectCodes.includes(code) && !PROJECT_CODE_RE.test(code)) return bad(IMPORT_MESSAGES.project(row.project));
        if (!row.description.trim()) return bad(IMPORT_MESSAGES.description);
        const where = parseImportLocation(row.location);
        if (typeof where === 'string') return bad(where);
        if (same) {
            const entry: Omit<TimesheetEntry, 'id'> & { id?: string } = { ...same, description: row.description.trim().slice(0, 500) };
            delete entry.id;
            return { ...row, ready: true, entry, replaces: same.id, note: IMPORT_MESSAGES.updates };
        }
        const others = [...ctx.existingOn(date), ...(taken.get(date) ?? [])];
        let entry: Omit<TimesheetEntry, 'id'>;
        try {
            // Start + hours: the end follows from the hours (the form's rule). Duration-only filing keeps just the hours.
            const timed = usesTimes(ctx.fields);
            entry = validateEntry(
                {
                    date,
                    start: timed ? start : null,
                    end: timed ? end : null,
                    hoursText: !timed && start && end ? '' : hoursText,
                    mins: !timed && start && end ? ((toMinutes(end) - toMinutes(start) + 1440) % 1440 || null) : null,
                    description: row.description,
                    projectCode: codesOn ? code : null,
                    ...where,
                },
                others,
                ctx.fields
            );
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            if (/24 hours|more than 24|Add the hours worked/.test(e.message)) return bad(IMPORT_MESSAGES.hours);
            return bad(e.message.replace(/\.$/, '').replace(/^Overlaps with /, 'Overlaps '));
        }
        const id = `import:${i}`;
        const placed: TimesheetEntry = { id, ...entry };
        const clash = findOverlaps([placed, ...others.filter(o => !isDerivedRow(o.id))]).find(o => o.a === id || o.b === id);
        taken.set(date, [...(taken.get(date) ?? []), placed]);
        return {
            ...row,
            ready: true,
            entry,
            ...(clash ? { note: `Overlaps ${rangeText(clash.from, clash.to)} — you can still import it` } : {}),
        };
    });
    return { columns, rows: out, ready: out.filter(r => r.ready).length };
};

/** "N ready to import, M with problems (they won’t be imported). Imported entries are added as a draft." */
export const importSummary = (p: ImportPreview) => {
    const rows = p.rows ?? [];
    const skipped = rows.filter(r => r.skipped).length;
    const updates = rows.filter(r => r.ready && r.replaces).length;
    const problems = rows.length - p.ready - skipped;
    return `${p.ready} ready to import${updates ? ` (${updates} updating saved entries)` : ''}${skipped ? `, ${skipped} skipped (already saved, breaks or leave)` : ''}${
        problems ? `, ${problems} with problems (they won’t be imported)` : ''
    }. Imported entries are added as a draft.`;
};

/** The preview table's Time and Hours cells. */
export const importRowTime = (r: ImportRow) => {
    if (r.entry?.start) return entryTimeText(r.entry);
    // 12-hour where readable; as typed otherwise.
    const shown = (v: string) => {
        const t = parseImportTime(v);
        return t ? displayTime(t) : v;
    };
    if (r.start) return `${shown(r.start)}${r.end ? ` – ${shown(r.end)}` : ''}`;
    return '—';
};
export const importRowHours = (r: ImportRow) => (r.entry ? formatDuration(r.entry.mins) : r.hours || '—');

export const importedToast = (n: number) => `Imported ${n} ${n === 1 ? 'entry' : 'entries'}. Submit when you’re ready.`;
