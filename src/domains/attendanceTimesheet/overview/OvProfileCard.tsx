// PROTOTYPE-SETUP (Overview; ESS design, Slice 2): section 1 — "Profile" with "Edit profile". A 72px avatar (the
// approved photo, or initials), the name (20px medium) and role in grey, then work email, manager and department
// as value / label pairs in the ESS ProfileCard style (inner bordered block).
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

const OvProfileCard = ({ profile, profilePath, className = '' }: { profile: MyProfileView; profilePath: string; className?: string }) => {
    const { work, personal } = profile;
    return (
        <EssCard label="Employee profile" heading={<EssSectionHeading title="Profile" link={{ to: profilePath, text: 'Edit profile' }} />} className={className}>
            <div className="flex min-w-0 items-center gap-4">
                <ProfilePhoto name={work.name} photo={personal.photo} size={72} />
                <div className="min-w-0">
                    <div className="truncate text-xl font-medium text-[#080808]">{work.name}</div>
                    <div className="truncate text-sm text-[#616161]">{work.designation}</div>
                </div>
            </div>
            <div className={`flex flex-col gap-4 ${ESS_INNER}`}>
                <Pair label="Work email" value={work.workEmail} />
                <div className="grid grid-cols-2 gap-4">
                    <Pair label="Manager" value={work.manager?.name ?? 'No reporting manager'} />
                    <Pair label="Department" value={work.department} />
                </div>
            </div>
        </EssCard>
    );
};

export default OvProfileCard;
