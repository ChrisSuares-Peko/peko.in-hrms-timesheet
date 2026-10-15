// PROTOTYPE-SETUP (Timesheet filing): what a manual submission shows before the period goes (submissionPrompt):
//   issues ...... entries missing a required field — blocking: "Review entries" only
//   overlaps .... entries sharing time — "Review entries" or "Continue anyway"
//   gaps ........ workday time not covered for more than 5 minutes — "Review entries" or "Submit anyway"
// Each row names the day (and entries); clicking it opens that day with the entries outlined. Automatic submission
// never shows this.
import { RightOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Modal } from 'antd';
import dayjs from 'dayjs';

import { formatDuration } from '@src/prototype/rules/attendance';
import { PeriodReview, SubmissionPrompt, gapCount, rangeText } from '@src/prototype/rules/timesheetFiling';

import type { TimesheetEntry } from '../types';

export interface SubmitReviewModalProps {
    kind: Exclude<SubmissionPrompt, null> | null;
    review: PeriodReview | null;
    /** The period's entries (to name them). */
    entries: TimesheetEntry[];
    busy?: boolean;
    /** Open a day with these entries outlined (and close). */
    onReview: (date: string, entryIds: string[]) => void;
    /** Overlaps / gaps: go on with the submission. */
    onContinue: () => void;
    onClose: () => void;
}

/** At most this many rows; the rest are counted. */
const MAX_ROWS = 6;

const dayText = (iso: string) => dayjs(iso).format('ddd, D MMM');

interface Row {
    key: string;
    date: string;
    ids: string[];
    text: string;
}

const COPY = {
    issues: {
        title: 'Some entries need more details',
        intro: 'Add what’s missing before you submit.',
        go: null,
    },
    overlaps: {
        title: 'Some entries overlap',
        intro: 'These entries share time. Check your timings — if they’re right, you can still submit.',
        go: 'Continue anyway',
    },
    gaps: {
        title: 'Time not covered by an entry',
        intro: 'Parts of your workday have no entry for more than 5 minutes. You can still submit.',
        go: 'Submit anyway',
    },
} as const;

const SubmitReviewModal = ({ kind, review, entries, busy, onReview, onContinue, onClose }: SubmitReviewModalProps) => {
    if (!kind || !review) return null;
    const name = (id: string) => entries.find(e => e.id === id)?.description ?? 'An entry';
    let rows: Row[] = [];
    if (kind === 'issues') {
        rows = review.issues.map(i => ({ key: `${i.entryId}-${i.message}`, date: i.date, ids: [i.entryId], text: `${name(i.entryId)}: ${i.message}` }));
    } else if (kind === 'overlaps') {
        rows = review.overlaps.map(o => ({
            key: `${o.a}-${o.b}`,
            date: o.date,
            ids: [o.a, o.b],
            text: `${rangeText(o.from, o.to)}: ${name(o.a)} and ${name(o.b)}`,
        }));
    } else {
        rows = review.gaps.flatMap(d =>
            d.gaps.map(g => ({ key: `${d.date}-${g.from}`, date: d.date, ids: [], text: `${rangeText(g.from, g.to)} (${formatDuration(g.minutes)})` }))
        );
    }
    const copy = COPY[kind];
    const first = rows[0];
    let count = review.issues.length;
    if (kind === 'overlaps') count = review.overlaps.length;
    if (kind === 'gaps') count = gapCount(review);

    return (
        <Modal
            open
            title={
                <span className="flex items-center gap-2">
                    <WarningFilled className={kind === 'issues' ? 'text-[#FF4F4F]' : 'text-[#F79009]'} />
                    {copy.title}
                </span>
            }
            onCancel={onClose}
            destroyOnClose
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={() => first && onReview(first.date, rows.filter(r => r.date === first.date).flatMap(r => r.ids))} type={copy.go ? 'default' : 'primary'}>
                        Review entries
                    </Button>
                    {copy.go && (
                        <Button type="primary" loading={busy} disabled={busy} onClick={onContinue} data-continue>
                            {copy.go}
                        </Button>
                    )}
                </div>
            }
        >
            <p className="mb-3 mt-1 text-sm text-[#616161]">{copy.intro}</p>
            <ul className="m-0 list-none p-0" aria-label={copy.title} data-review-kind={kind}>
                {rows.slice(0, MAX_ROWS).map(r => (
                    <li key={r.key}>
                        <button
                            type="button"
                            onClick={() => onReview(r.date, r.ids)}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 border-b border-solid border-gray-100 bg-transparent px-0 py-2 text-left text-[13px] text-gray-900 hover:text-[#FF4F4F]"
                        >
                            <span className="min-w-0">
                                <b className="font-medium">{dayText(r.date)}</b>
                                <span className="text-gray-600"> · {r.text}</span>
                            </span>
                            <RightOutlined className="shrink-0 text-[10px] text-gray-400" />
                        </button>
                    </li>
                ))}
            </ul>
            {count > MAX_ROWS && <p className="mb-0 mt-2 text-xs text-gray-500">and {count - MAX_ROWS} more</p>}
        </Modal>
    );
};

export default SubmitReviewModal;
