import { Col, Flex, Row, Skeleton } from 'antd';
import { useNavigate, useOutletContext } from 'react-router-dom';

import AtsDashboardCard from '@src/domains/attendanceTimesheet/ess/AtsDashboardCard';
import MyTeamCard from '@src/domains/attendanceTimesheet/team/MyTeamCard';
import type { EssOutletContext } from '@src/domains/dashboard/Ess/pages/EssLayout';

import AnnouncementsPanel from '../components/dashboard/AnnouncementsPanel';
import AttendanceTable from '../components/dashboard/AttendanceTable';
import ProfileCard from '../components/dashboard/ProfileCard';
import ServiceShortcuts from '../components/dashboard/ServiceShortcuts';
import StatCard from '../components/dashboard/StatCard';
import { useEmployeeDashboard } from '../hooks/useEmployeeDashboard';
import { useEmployeePaths } from '../hooks/useEmployeePaths';

const Dashboard = () => {
    const navigate = useNavigate();
    const employeePaths = useEmployeePaths(); // PROTOTYPE-SETUP: /employee or /ess-employee base
    // PROTOTYPE-SETUP: ESS Service 1 — on the ESS tabs the Attendance & Timesheet card (with check-in / out)
    // replaces the profile card's punch button and the Attendance stat; managers also get "My team".
    const essContext = useOutletContext<EssOutletContext | undefined>();
    const { data, isLoading, checkInLoading, checkOutLoading, handleCheckIn, handleCheckOut } =
        useEmployeeDashboard();

    if (isLoading || !data) {
        return (
            <Flex vertical gap={24}>
                <Skeleton active paragraph={{ rows: 6 }} />
                <Skeleton active paragraph={{ rows: 6 }} />
            </Flex>
        );
    }

    return (
        <Flex vertical gap={24}>
            <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                    <ProfileCard
                        profile={data.profile}
                        checkInLoading={checkInLoading}
                        checkOutLoading={checkOutLoading}
                        onCheckIn={handleCheckIn}
                        onCheckOut={handleCheckOut}
                        hidePunch={Boolean(essContext)}
                    />
                </Col>
                <Col xs={24} lg={8}>
                    {essContext ? (
                        <AtsDashboardCard />
                    ) : (
                        <StatCard
                            title="Attendance"
                            stat={data.attendance}
                            onViewMore={() => navigate(employeePaths.attendance)}
                        />
                    )}
                </Col>
            </Row>
            {essContext?.isManager && <MyTeamCard />}

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={13}>
                    <Flex vertical gap={24}>
                        <ServiceShortcuts />
                        <AttendanceTable records={data.attendanceRecords} />
                    </Flex>
                </Col>
                <Col xs={24} lg={11}>
                    <AnnouncementsPanel announcements={data.announcements} />
                </Col>
            </Row>
        </Flex>
    );
};

export default Dashboard;
