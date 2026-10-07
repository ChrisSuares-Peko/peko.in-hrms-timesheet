// PROTOTYPE-SETUP: ESS Service 1 — 'both' mode: "Time logged outside check-in hours". Lists the flagged entries
// and offers "Update check-out" (auto-closed day) or "Request correction", or shows the correction already
// raised. Makes clear this time is not overtime. Without `onAction` (manager view) it is informational.
import { WarningFilled } from '@ant-design/icons';
import { Alert, Button, Tag } from 'antd';

import { displayTime } from '@src/prototype/rules/attendance';

import type { TimesheetDay } from '../types';

export interface OutsideFlagBannerProps {
    day: TimesheetDay;
    perspective?: 'employee' | 'manager';
    /** Opens the correction modal. Omit for read-only. */
    onAction?: () => void;
}

const OutsideFlagBanner = ({ day, perspective = 'employee', onAction }: OutsideFlagBannerProps) => {
    const flag = day.outsideCheckIn;
    if (!flag) return null;
    const flagged = day.entries.filter(e => flag.entryIds.includes(e.id));
    const isUpdate = flag.action === 'update-check-out';
    const suggestion = isUpdate
        ? `Update the auto check-out to ${displayTime(flag.suggested.checkOut ?? '')}`
        : `Correct attendance to ${flag.suggested.checkIn ? displayTime(flag.suggested.checkIn) : '—'} – ${
              flag.suggested.checkOut ? displayTime(flag.suggested.checkOut) : '—'
          }`;
    const explain =
        perspective === 'employee'
            ? `This time is not overtime. If you worked these hours, ${
                  isUpdate ? 'update your check-out' : 'request an attendance correction'
              } so your attendance matches.`
            : 'This time is not counted as overtime unless the attendance is corrected.';

    let action = null;
    if (flag.pendingCorrection) {
        action = (
            <Tag color="processing" className="!m-0 whitespace-normal">
                Correction requested · {flag.pendingCorrection.statusLabel}
            </Tag>
        );
    } else if (onAction && !day.locked) {
        action = (
            <Button size="small" onClick={onAction}>
                {isUpdate ? 'Update check-out' : 'Request correction'}
            </Button>
        );
    }

    return (
        <Alert
            type="warning"
            showIcon
            icon={<WarningFilled />}
            className="!items-start"
            message={<span className="font-medium">Time logged outside check-in hours</span>}
            description={
                <div className="flex flex-col gap-1.5 text-xs">
                    <ul className="m-0 list-disc pl-4">
                        {flagged.map(e => (
                            <li key={e.id} className="break-words">
                                <span className="tabular-nums">
                                    {displayTime(e.start)}–{displayTime(e.end)}
                                </span>{' '}
                                · {e.description}
                            </li>
                        ))}
                    </ul>
                    <span className="text-gray-600">{explain}</span>
                    {!flag.pendingCorrection && perspective === 'employee' && (
                        <span className="text-gray-500">Suggested: {suggestion}.</span>
                    )}
                    {action && <div className="mt-0.5">{action}</div>}
                </div>
            }
        />
    );
};

export default OutsideFlagBanner;
