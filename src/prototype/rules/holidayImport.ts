// PROTOTYPE-SETUP (Leave settings rework — notes pay:settings:leave:holidays → "Bulk upload"): public holidays from a
// spreadsheet. One row per holiday: Start date, End date (same as the start for one day), Holiday name. Dates as
// YYYY-MM-DD, DD/MM/YYYY or Excel dates (a serial number, or a date cell read as YYYY-MM-DD). Each row gets a status:
// Ready, Already added (every date is a holiday already; duplicates are skipped) or the problem. "Import N days" adds
// the Ready rows only, one entry per date with the same name.
import { addDays } from './attendance';

export const HOLIDAY_TEMPLATE_COLUMNS = ['Start date', 'End date', 'Holiday name'] as const;

/** The template's two sample rows (this year's Republic Day, and a two-day Diwali). */
export const holidayTemplateRows = (year: number): string[][] => [
    [...HOLIDAY_TEMPLATE_COLUMNS],
    [`${year}-01-26`, `${year}-01-26`, 'Republic Day'],
    [`${year}-11-08`, `${year}-11-09`, 'Diwali'],
];

export const HOLIDAY_IMPORT_STATUS = {
    ready: 'Ready',
    added: 'Already added',
    badStart: 'Start date isn’t a date',
    badEnd: 'End date isn’t a date',
    name: 'Holiday name is missing',
    order: 'End date is before the start date',
    long: 'More than 31 days long',
} as const;

export type HolidayImportStatus = keyof typeof HOLIDAY_IMPORT_STATUS;

export interface HolidayImportRow {
    /** The spreadsheet row number (the header is row 1). */
    row: number;
    name: string;
    from: string | null;
    to: string | null;
    /** Days in the range (0 when the dates are wrong). */
    days: number;
    status: HolidayImportStatus;
    /** The dates that get added (Ready rows: the range minus dates already holidays). */
    dates: string[];
}

const two = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** "2027-01-26", "26/01/2027", "26-01-2027", "2027/1/26" or an Excel serial (46413) → "YYYY-MM-DD"; null when it isn't a date. */
export const parseHolidayDate = (raw: string): string | null => {
    const s = raw.trim();
    if (!s) return null;
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
    if (m) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${two(+m[2])}-${two(+m[3])}` : null;
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (m) return valid(+m[3], +m[2], +m[1]) ? `${m[3]}-${two(+m[2])}-${two(+m[1])}` : null;
    if (/^\d{4,5}(\.\d+)?$/.test(s)) {
        // Excel's day 1 is 1 Jan 1900 (with its 1900 leap-year bug: serial 60 is the phantom 29 Feb).
        const serial = Math.floor(Number(s));
        if (serial < 367 || serial > 2958465) return null;
        const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return `${dt.getUTCFullYear()}-${two(dt.getUTCMonth() + 1)}-${two(dt.getUTCDate())}`;
    }
    return null;
};

const daysBetween = (from: string, to: string) => Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8))) / 86400000) + 1;

const isHeader = (cells: string[]) => /start/i.test(cells[0] ?? '') || /name/i.test(cells[2] ?? '');

/**
 * The review table for a sheet (rows of cell text, the header first). A row's own dates that repeat an earlier Ready
 * row count as already added too. Blank rows are skipped.
 */
export const reviewHolidayRows = (rows: string[][], existing: string[]): HolidayImportRow[] => {
    const taken = new Set(existing);
    const review = (cells: string[], row: number): HolidayImportRow => {
        const [a = '', b = '', c = ''] = cells.map(x => String(x ?? '').trim());
        const from = parseHolidayDate(a);
        const to = b ? parseHolidayDate(b) : from;
        const base = { row, name: c, from, to, days: 0, dates: [] as string[] };
        if (!from) return { ...base, status: 'badStart' };
        if (!to) return { ...base, status: 'badEnd' };
        if (!c) return { ...base, days: Math.max(0, daysBetween(from, to)), status: 'name' };
        if (to < from) return { ...base, status: 'order' };
        const days = daysBetween(from, to);
        if (days > 31) return { ...base, days, status: 'long' };
        const all: string[] = [];
        for (let d = from; d <= to; d = addDays(d, 1)) all.push(d);
        const dates = all.filter(d => !taken.has(d));
        if (!dates.length) return { ...base, days, status: 'added' };
        dates.forEach(d => taken.add(d));
        return { ...base, days, dates, status: 'ready' };
    };
    return rows.flatMap((cells, i) => {
        if (i === 0 && isHeader(cells)) return [];
        if (!cells.some(x => String(x ?? '').trim())) return [];
        return [review(cells, i + 1)];
    });
};

/** "3 ready (4 days) · 1 already added · 2 with problems" */
export const holidayReviewSummary = (rows: HolidayImportRow[]) => {
    const ready = rows.filter(r => r.status === 'ready');
    const added = rows.filter(r => r.status === 'added').length;
    const bad = rows.length - ready.length - added;
    const days = ready.reduce((n, r) => n + r.dates.length, 0);
    const parts = [`${ready.length} ready (${days} day${days === 1 ? '' : 's'})`];
    if (added) parts.push(`${added} already added`);
    if (bad) parts.push(`${bad} with problem${bad === 1 ? '' : 's'}`);
    return parts.join(' · ');
};

/** The entries "Import N days" adds: one per date of each Ready row. */
export const holidaysToImport = (rows: HolidayImportRow[]) => rows.filter(r => r.status === 'ready').flatMap(r => r.dates.map(date => ({ date, name: r.name })));

// ---- holidays with ranges (notes pay:settings:leave:holidays → "Holidays with ranges") -------------------------------

export interface HolidayGroup {
    name: string;
    from: string;
    to: string;
    days: number;
}

/**
 * Consecutive dates with the same name are one holiday (e.g. Diwali, 3 days). Holidays are stored per date; the grouping
 * is for display and editing.
 */
export const holidayGroups = (list: { date: string; name: string }[]): HolidayGroup[] => {
    const out: HolidayGroup[] = [];
    [...list]
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach(h => {
            const last = out[out.length - 1];
            if (last && last.name === h.name && addDays(last.to, 1) === h.date) {
                last.to = h.date;
                last.days += 1;
            } else out.push({ name: h.name, from: h.date, to: h.date, days: 1 });
        });
    return out;
};

/** Every date from `from` to `to`, both included. */
export const datesBetween = (from: string, to: string) => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
};

export const HOLIDAY_RANGE_MESSAGES = {
    from: 'Pick the start date.',
    order: 'The end date is before the start date.',
    long: 'A holiday can be at most 31 days long.',
    name: 'Add the holiday’s name.',
} as const;

/**
 * Checks a holiday being added or edited: a start date, the end not before it, at most 31 days, a name, and no date that
 * is already another holiday (`own` = the dates of the holiday being edited, which it may keep). Returns the problem
 * (`clash` = the first date already taken) or null.
 */
export const holidayRangeProblem = (h: { name: string; from: string; to: string }, existing: string[], own: string[] = []): { message: string; clash?: string } | null => {
    if (!h.from) return { message: HOLIDAY_RANGE_MESSAGES.from };
    const to = h.to || h.from;
    if (to < h.from) return { message: HOLIDAY_RANGE_MESSAGES.order };
    if (datesBetween(h.from, to).length > 31) return { message: HOLIDAY_RANGE_MESSAGES.long };
    if (!h.name.trim()) return { message: HOLIDAY_RANGE_MESSAGES.name };
    const mine = new Set(own);
    const taken = new Set(existing.filter(d => !mine.has(d)));
    const clash = datesBetween(h.from, to).find(d => taken.has(d));
    return clash ? { message: 'is already a holiday.', clash } : null;
};
