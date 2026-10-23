// PROTOTYPE-SETUP (Final batch, Slice 3): the timesheet template and CSV upload — pure, so the screens and the mock
// server share it. Wording from docs/prototypes/attendance-timesheet.html (TemplateModal / UploadModal).
//   template ..... Date, Start time, End time, Hours, Location, Project code, Description; four example rows from
//                  this week (times, hours only, a client site that ends the next morning)
//   upload ....... header synonyms; each row is checked (date, payroll processed, more than 30 days ahead, times,
//                  hours, project code, description, location, then the entry rules — validateEntry with the company's
//                  fields, as the form does); only ready rows are imported, as a draft
// Overlapping another entry is allowed, as in the form (f19137e): the row is ready, with a note. Overlapping a recorded
// break isn't.
import type { TimesheetEntry, TimesheetFields, WorkLocation } from '@src/domains/attendanceTimesheet/types';

import {
    MAX_DAY_MINUTES,
    PROJECT_CODE_RE,
    RuleError,
    addDays,
    displayTime,
    entryTimeText,
    formatDuration,
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
} as const;

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
        const date = parseImportDate(row.date);
        if (!date) return bad(IMPORT_MESSAGES.date);
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
        const clash = findOverlaps([placed, ...others.filter(o => !o.id.startsWith('break:'))]).find(o => o.a === id || o.b === id);
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
    const problems = rows.length - p.ready;
    return `${p.ready} ready to import${problems ? `, ${problems} with problems (they won’t be imported)` : ''}. Imported entries are added as a draft.`;
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
