// PROTOTYPE-SETUP: date helpers for mock data. Dates are computed relative to "today" at load time, so
// facts like "joined this month" or "joined within the last 4 years" stay true whenever the demo runs.

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => new Date();

/** A date `months` months before the current month, on `day` (clamped to the month's length). */
export const monthsAgo = (months: number, day: number) => {
    const now = today();
    const target = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return toIsoDate(target);
};

export const daysFromToday = (days: number) => {
    const d = today();
    d.setDate(d.getDate() + days);
    return toIsoDate(d);
};

/** First day of the current month — used for the "newly joined this month" employee. */
export const startOfThisMonth = () => {
    const now = today();
    return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
};

export const isoDateTime = (isoDate: string, time = '09:30:00') => `${isoDate}T${time}.000Z`;
