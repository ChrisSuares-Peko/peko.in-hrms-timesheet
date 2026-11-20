// PROTOTYPE-SETUP (Leave types, "Unused leave on leaving"): the ESS leaving banner names what happens per type.
import { describe, expect, it } from 'vitest';

import { settlementText } from '../leaveUi';

describe('settlementText (ESS leaving banner)', () => {
    it('encash types say "encashed"; bring-forward types say they can bring the last working day forward; overdrawn ones are recovered', () => {
        const text = settlementText({
            exit: {
                date: '2026-12-18',
                settlement: [
                    { type: 'ANNUAL', name: 'Annual', encash: 3, bringForward: 0, recover: 0 },
                    { type: 'CASUAL', name: 'Casual', encash: 0, bringForward: 2, recover: 0 },
                    { type: 'SICK', name: 'Sick', encash: 0, bringForward: 0, recover: 1.5 },
                ],
            },
        });
        expect(text).toContain('Leaving on Friday, 18 December.');
        expect(text).toContain('Annual: 3 unused days encashed in the final settlement.');
        expect(text).toContain('Casual: 2 days can be used to bring your last working day forward.');
        expect(text).toContain('Sick: 1.5 days more than earned, recovered in the final settlement.');
    });
    it('nothing left over: "Nothing to settle."', () => {
        expect(settlementText({ exit: { date: '2026-12-18', settlement: [{ type: 'CASUAL', name: 'Casual', encash: 0, bringForward: 0, recover: 0 }] } })).toMatch(/Nothing to settle\.$/);
    });
});
