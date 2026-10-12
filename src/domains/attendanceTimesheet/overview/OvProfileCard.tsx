// PROTOTYPE-SETUP (Overview, Slice 2): section 1 — who you are. Photo (initials fallback), name, employee ID,
// work email, role and grade, department and reporting manager (with their title). "Edit profile" opens the
// Profile page.
import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import { OvCard } from './OvCard';
import ProfilePhoto from './ProfilePhoto';
import type { MyProfileView } from '../types';

const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
        <dt className="text-xs text-titleText">{label}</dt>
        <dd className="m-0 min-w-0 break-words text-sm text-valueText">{children}</dd>
    </>
);

const OvProfileCard = ({ profile, profilePath, className }: { profile: MyProfileView; profilePath: string; className?: string }) => {
    const navigate = useNavigate();
    const { work, personal } = profile;
    return (
        <OvCard label="Employee profile" className={className}>
            <div className="flex min-w-0 items-center gap-3">
                <ProfilePhoto name={work.name} photo={personal.photo} />
                <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-valueText">{work.name}</div>
                    <div className="truncate text-xs text-titleText">{work.designation}</div>
                </div>
            </div>
            <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <Item label="Employee ID">{work.employeeId}</Item>
                <Item label="Work email">
                    <span className="block truncate" title={work.workEmail}>
                        {work.workEmail}
                    </span>
                </Item>
                <Item label="Role and grade">
                    {work.designation} · {work.grade}
                </Item>
                <Item label="Department">{work.department}</Item>
                <Item label="Reports to">
                    {work.manager ? (
                        <>
                            {work.manager.name}
                            <span className="block text-xs text-titleText">{work.manager.designation}</span>
                        </>
                    ) : (
                        'No reporting manager'
                    )}
                </Item>
            </dl>
            <span className="flex-1" />
            <Button block onClick={() => navigate(profilePath)}>
                Edit profile
            </Button>
        </OvCard>
    );
};

export default OvProfileCard;
