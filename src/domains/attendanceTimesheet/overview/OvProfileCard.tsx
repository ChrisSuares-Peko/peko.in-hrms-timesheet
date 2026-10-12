// PROTOTYPE-SETUP (Overview, Slice 2; decluttered in Overview v2, Slice 2): section 1 — who you are.
// Photo (initials fallback), name and role, then work email, reporting manager and department. Employee ID and
// grade live on the Profile page. "Edit profile" is a small link in the top-right corner; the card is only as
// tall as its content.
import { Link } from 'react-router-dom';

import { OvCard } from './OvCard';
import ProfilePhoto from './ProfilePhoto';
import type { MyProfileView } from '../types';

export const OvItem = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
        <dt className="text-[11px] text-gray-400">{label}</dt>
        <dd className="m-0 min-w-0 text-sm font-normal text-[#101828]">{children}</dd>
    </>
);

const OvProfileCard = ({ profile, profilePath, className = '' }: { profile: MyProfileView; profilePath: string; className?: string }) => {
    const { work, personal } = profile;
    return (
        <OvCard label="Employee profile" className={`self-start ${className}`}>
            <div className="flex min-w-0 items-start gap-3">
                <ProfilePhoto name={work.name} photo={personal.photo} size={48} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-valueText">{work.name}</div>
                    <div className="truncate text-xs text-gray-500">{work.designation}</div>
                </div>
                <Link to={profilePath} className="shrink-0 text-xs font-medium text-[#2E62E8] hover:underline">
                    Edit profile
                </Link>
            </div>
            <dl className="m-0 grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2">
                <OvItem label="Work email">
                    <span className="block truncate" title={work.workEmail}>
                        {work.workEmail}
                    </span>
                </OvItem>
                <OvItem label="Manager">{work.manager?.name ?? 'No reporting manager'}</OvItem>
                <OvItem label="Department">{work.department}</OvItem>
            </dl>
        </OvCard>
    );
};

export default OvProfileCard;
