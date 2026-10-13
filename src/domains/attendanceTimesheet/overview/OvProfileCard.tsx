// PROTOTYPE-SETUP (Overview; ESS design, Slice 2): section 1 — "Profile" with "Edit profile". A 72px avatar (the
// approved photo, or initials), the name (20px medium) and role in grey, then work email, manager and department
// as value / label pairs in the ESS ProfileCard style (inner bordered block); Employee ID added in Overview v4.
import { ESS_INNER, ESS_LABEL } from '@src/components/ess/essTokens';
import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';

import ProfilePhoto from './ProfilePhoto';
import type { MyProfileView } from '../types';

const Pair = ({ label, value, title }: { label: string; value: string; title?: string }) => (
    <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-medium text-[#080808]" title={title ?? value}>
            {value}
        </span>
        <span className={ESS_LABEL}>{label}</span>
    </div>
);

const OvProfileCard = ({
    profile,
    profilePath,
    wide = false,
    className = '',
}: {
    profile: MyProfileView;
    profilePath: string;
    /** PROTOTYPE-SETUP (Overview v4, Slice 5): spans two columns ('none' mode) — details in two columns. */
    wide?: boolean;
    className?: string;
}) => {
    const { work, personal } = profile;
    const manager = work.manager?.name ?? 'No reporting manager';
    return (
        <EssCard label="Employee profile" heading={<EssSectionHeading title="Profile" link={{ to: profilePath, text: 'Edit profile' }} />} className={className}>
            <div className="flex min-w-0 items-center gap-4">
                <ProfilePhoto name={work.name} photo={personal.photo} size={72} />
                <div className="min-w-0">
                    <div className="truncate text-xl font-medium text-[#080808]">{work.name}</div>
                    <div className="truncate text-sm text-[#616161]">{work.designation}</div>
                </div>
            </div>
            {/* PROTOTYPE-SETUP (Overview v5, Slice 1): two rows of two — Work email | Employee ID, Manager | Department —
                at their natural size (no stretching to fill the card). A long value truncates; hover shows it all. */}
            <div className={`grid grid-cols-2 ${wide ? 'gap-x-8' : 'gap-x-4'} gap-y-3 ${ESS_INNER}`}>
                <Pair label="Work email" value={work.workEmail} />
                <Pair label="Employee ID" value={work.employeeId} />
                <Pair label="Manager" value={manager} />
                <Pair label="Department" value={work.department} />
            </div>
        </EssCard>
    );
};

export default OvProfileCard;
