import { Avatar, Flex, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';
import { useLocation } from 'react-router-dom';

import ProfilePhoto from '@src/domains/attendanceTimesheet/overview/ProfilePhoto';
import EssProfileEditor from '@src/domains/attendanceTimesheet/profile/EssProfileEditor';
import { essTabFor } from '@src/prototype/persona/essPersonas';
import { useEssPersonaPhoto } from '@src/prototype/persona/useEssPersonaPhoto';
import { paths } from '@src/routes/paths';

import { EmployeeDepartment } from '../api/onboarding';
import BankDetailsTab from '../components/profile/BankDetailsTab';
import PersonalInfoTab from '../components/profile/PersonalInfoTab';
import { useEmployeeProfile } from '../hooks/useEmployeeProfile';

const { Text } = Typography;

const FALLBACK = '—';

const STATUS_LABELS: Record<string, string> = {
    ACTIVE: 'Active Employee',
    CONFIRMED: 'Confirmed',
    INPROBATION: 'In Probation',
    NEW_HIRE: 'New Hire',
    LEAVE: 'On Leave',
    SUSPENDED: 'Suspended',
    RESIGNED: 'Resigned',
};

const getInitials = (name?: string) =>
    (name || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0])
        .join('')
        .toUpperCase() || 'NA';

const displayDepartment = (department?: EmployeeDepartment | string) =>
    department && typeof department === 'object' && department.departmentName
        ? department.departmentName
        : FALLBACK;

const ProfileStat = ({ label, value }: { label: string; value: string }) => (
    <Flex vertical align="center" className="flex-1 min-w-[140px]">
        <Text className="text-xs text-gray-500">{label}</Text>
        <Text className="font-medium text-black">{value}</Text>
    </Flex>
);

const StatDivider = () => <div className="hidden h-12 w-px bg-[#e5e5e5] sm:block" />;

const Profile = () => {
    const { profile, loading, reload } = useEmployeeProfile();
    // PROTOTYPE-SETUP (Overview, Slice 4): on ESS - Employee the personal details are edited here and sent to HR
    // for approval (EssProfileEditor), and the photo is the approved one. Elsewhere the page is unchanged.
    const essTab = essTabFor(useLocation().pathname);
    const isEssEmployee = essTab?.base === paths.essEmployee.index;
    const essPhoto = useEssPersonaPhoto(essTab?.persona);
    // PROTOTYPE-SETUP (ESS design, Slice 4): on the ESS tabs the header matches the Overview's profile card
    // (round 72px photo or initials, 20px medium name, grey role). The /employee portal keeps its own header.
    const essHeader = Boolean(essTab);
    const personal = profile?.personalInformation;
    const info = profile?.employeeInformation;

    const statusLabel = info?.employeeStatus
        ? (STATUS_LABELS[info.employeeStatus] ?? info.employeeStatus)
        : FALLBACK;

    return (
        <Flex vertical gap={28} className="w-full max-w-[900px] mx-auto py-4">
            <div className="bg-white rounded-3xl shadow-[0px_1.66px_16.56px_1.52px_rgba(0,0,0,0.06)] px-8 py-7">
                {loading && !profile ? (
                    <Skeleton avatar active paragraph={{ rows: 2 }} />
                ) : (
                    <>
                        <Flex justify="space-between" align="center" gap={16} wrap="wrap">
                            <Flex gap={16} align="center">
                                {essHeader ? (
                                    <ProfilePhoto name={personal?.fullName || essTab!.persona.fullName} photo={essPhoto} size={72} />
                                ) : (
                                    <Avatar
                                        size={72}
                                        shape="square"
                                        style={{ borderRadius: 12, background: '#f9f6ff' }}
                                        src={profile?.profileImage}
                                    >
                                        <Text
                                            style={{ color: '#af9ed4' }}
                                            className="text-xl font-bold"
                                        >
                                            {getInitials(personal?.fullName)}
                                        </Text>
                                    </Avatar>
                                )}
                                <Flex vertical>
                                    <Text className={essHeader ? 'text-xl font-medium text-[#080808]' : 'text-xl font-bold text-black'}>
                                        {personal?.fullName || FALLBACK}
                                    </Text>
                                    <Text className={essHeader ? 'text-sm text-[#616161]' : 'text-sm text-gray-500'}>
                                        {info?.designation || FALLBACK}
                                    </Text>
                                </Flex>
                            </Flex>
                            <Flex
                                align="center"
                                gap={6}
                                className="px-3 py-1 rounded-full"
                                style={{
                                    color: '#43b75d',
                                    backgroundColor: '#ecfdf5',
                                    border: '0.5px solid #c8f3df',
                                }}
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-[#43b75d]" />
                                <Text style={{ color: '#43b75d' }} className="text-xs font-medium">
                                    {statusLabel}
                                </Text>
                            </Flex>
                        </Flex>

                        <Flex
                            align="center"
                            justify="space-between"
                            wrap="wrap"
                            className="mt-6 px-6 py-4 bg-[#f9f9f9] rounded-2xl"
                        >
                            <ProfileStat label="Employee ID" value={info?.employeeId || FALLBACK} />
                            <StatDivider />
                            <ProfileStat
                                label="Department"
                                value={displayDepartment(info?.department)}
                            />
                            <StatDivider />
                            <ProfileStat
                                label="Joined"
                                value={
                                    info?.dateOfJoin
                                        ? dayjs(info.dateOfJoin).format('MMM YYYY')
                                        : FALLBACK
                                }
                            />
                            <StatDivider />
                            <ProfileStat
                                label="Reports To"
                                value={info?.reportingStaffName || FALLBACK}
                            />
                            <StatDivider />
                            <ProfileStat
                                label="Company"
                                value={profile?.corporateUser?.companyName || FALLBACK}
                            />
                        </Flex>
                    </>
                )}
            </div>

            {isEssEmployee ? <EssProfileEditor /> : <PersonalInfoTab profile={profile} onRequestSubmitted={reload} />}
            <BankDetailsTab
                bankDetails={profile?.bankDetails}
                bankUpdateRequestPending={profile?.bankUpdateRequestPending}
                onRequestSubmitted={reload}
            />
        </Flex>
    );
};

export default Profile;
