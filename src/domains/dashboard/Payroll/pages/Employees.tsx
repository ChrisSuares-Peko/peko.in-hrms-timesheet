import { useEffect, useState } from 'react';

import { PlusCircleOutlined } from '@ant-design/icons';
import { Button, Col, Row, Tabs, TabsProps } from 'antd';
import { Content } from 'antd/es/layout/layout';
import { useLocation, useNavigate } from 'react-router-dom';

import { PekoPageHeader, PekoTabLabel } from '@src/components/peko/PageHeader';
import AdminRequestsList from '@src/domains/attendanceTimesheet/payroll/admin/AdminRequestsList';
import { PayrollServiceBar, useAdminCounts } from '@src/domains/attendanceTimesheet/payroll/admin/adminShared';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import useDebounce from '@src/hooks/useDebounce';
import { useDevPage } from '@src/prototype/devNotes/devPage';
import { paths } from '@src/routes/paths';

import PayrollAccessBanner from '../components/Dashboard/PayrollAccessBanner';
import DepartmentTab from '../components/Employees/DepartmentTab';
import DocumentRequestsTab from '../components/Employees/DocumentRequestsTab';
import EmployeesListTab from '../components/Employees/EmployeesListTab';
import NewHireTab from '../components/Employees/NewHireTab';
import ProfileUpdateRequestTab from '../components/Employees/ProfileUpdateRequestTab';
import AddEmployeeModal from '../components/modals/AddEmployeeModal';
import BulkUploadModal from '../components/modals/BulkUploadModal';
import DepartmentModal from '../components/modals/DepartmentModal';
import OffBoardEmployeeModal from '../components/modals/OffBoardEmployeeModal';
import SelectEmployeeModal from '../components/modals/SelectEmployeeModal';
import { useGetDepartmentList } from '../hooks/departmentHooks/useGetDepartmentList';
import { useValidateEmployeeSubscriptionLimit } from '../hooks/employeeHooks/useValidateEmployeeSubscriptionLimit';
import { resetEmployeeState } from '../slices/employeeSettings';

function Employees() {
    // PROTOTYPE-SETUP (Developer notes): Payroll → Employees.
    useDevPage('pay:employees');
    // const [departmentCount, setDepartmentCount] = useState<number>(0);
    const dispatch = useAppDispatch();
    const [page, setPage] = useState<number>(1);
    const limit = 10;
    const [searchText, setSearchText] = useState<string>('');
    const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
    const [offboardReload, setOffboardReload] = useState<boolean | number>(false);
    const debouncedSearch = useDebounce(searchText, 500);
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const { validateLimit, isLoading: isValidating } = useValidateEmployeeSubscriptionLimit();
    const params = useLocation();
    const queryParams = new URLSearchParams(params.search);

    const {
        tableData,
        count,
        isLoading,
        departmentCount: dCount,
        setRefresh,
    } = useGetDepartmentList(debouncedSearch, page, limit);

    useEffect(() => {
        // setDepartmentCount(dCount);
        setLoadingInitial(false);
    }, [dCount]);

    const handleNewEmployeeClick = async () => {
        if (loadingInitial || isValidating) {
            return;
        }
        const response = await validateLimit({
            userId: id,
            userType: role,
        });

        if (!response) return;
        dispatch(resetEmployeeState());
        setOpenAddEmployeeModal(true);
    };

    const [openAddEmployeeModal, setOpenAddEmployeeModal] = useState(false);
    const [openAddDepartmentModal, setOpenAddDepartmentModal] = useState(false);
    const [openOffBoardEmployeeModal, setOpenOffBoardEmployeeModal] = useState(false);
    const [openSelectEmployeeModal, setOpenSelectEmployeeModal] = useState(false);

    const [selectedEmployee, setSelectedEmployee] = useState(null);

    const [profileUpdatePendingCount, setProfileUpdatePendingCount] = useState(0);
    const [documentRequestPendingCount, setDocumentRequestPendingCount] = useState(0);

    // PROTOTYPE-SETUP (Design update): tab counts are small red pills (PekoTabLabel).
    const tabLabel = (label: string, pendingCount: number) => <PekoTabLabel label={label} count={pendingCount} />;

    const adminCounts = useAdminCounts();
    const items: TabsProps['items'] = [
        {
            key: '1',
            label: 'Active Employees',
            children: (
                <EmployeesListTab
                    updateDepartmentCount={() => {}}
                    employeeStatus="active"
                    offboardReload={offboardReload as boolean}
                    setOffboardReload={setOffboardReload}
                />
            ),
        },
        {
            key: '2',
            label: 'New Hire',
            children: <NewHireTab />,
        },
        {
            key: '3',
            label: 'Departments',
            children: (
                <DepartmentTab
                    updateDepartmentCount={() => {}}
                    tableData={tableData}
                    count={count}
                    isLoading={isLoading}
                    page={page}
                    searchText={searchText}
                    setPage={setPage}
                    setRefresh={setRefresh}
                    setSearchText={setSearchText}
                />
            ),
        },
        {
            key: '4',
            label: 'Past Employees',
            children: (
                <EmployeesListTab
                    updateDepartmentCount={() => {}}
                    employeeStatus="past"
                    offboardReload={offboardReload as boolean}
                    setOffboardReload={setOffboardReload}
                />
            ),
        },
        {
            key: '5',
            label: tabLabel('Profile Update Request', profileUpdatePendingCount),
            forceRender: true,
            children: (
                <ProfileUpdateRequestTab onPendingCountChange={setProfileUpdatePendingCount} />
            ),
        },
        {
            key: '6',
            label: tabLabel('Document Requests', documentRequestPendingCount),
            forceRender: true,
            children: <DocumentRequestsTab onPendingCountChange={setDocumentRequestPendingCount} />,
        },
        // PROTOTYPE-SETUP (Payroll admin, Slice 5): ESS profile updates — the admin requests list (HR, no manager step).
        {
            key: '7',
            label: tabLabel('Profile updates', adminCounts?.profile ?? 0),
            children: <AdminRequestsList type="profile" />,
        },
    ];

    const navigate = useNavigate();
    const handleEmployeeSelected = (employeeData: any) => {
        setSelectedEmployee(employeeData);
        setOpenSelectEmployeeModal(false);
        setOpenOffBoardEmployeeModal(true);
    };

    const [openBulkUploadModal, setOpenBulkUploadModal] = useState(false);
    const [activeTab, setActiveTab] = useState<string>(queryParams.get('tab') || '1');

    const isEmployeeTab =
        Number(activeTab) === 1 || Number(activeTab) === 2 || Number(activeTab) === 4;
    const isDepartmentTab = Number(activeTab) === 3;
    const isDocumentRequestsTab = Number(activeTab) === 6;

    let pageTitle = 'Profile Update Request';
    if (isEmployeeTab) {
        pageTitle = 'Employees';
    } else if (isDepartmentTab) {
        pageTitle = 'Departments';
    } else if (isDocumentRequestsTab) {
        pageTitle = 'Document Requests';
    }

    let headerActions: React.ReactNode = null;
    if (isEmployeeTab) {
        headerActions = (
            <>
                <Button type="primary" loading={isValidating} onClick={handleNewEmployeeClick} icon={<PlusCircleOutlined />}>
                    New Employee
                </Button>
                <Button onClick={() => setOpenBulkUploadModal(true)}>
                    Upload Employees
                </Button>
                <Button onClick={() => setOpenSelectEmployeeModal(true)}>
                    Offboard Employee
                </Button>
            </>
        );
    } else if (isDepartmentTab) {
        headerActions = (
            <Button
                type="primary"
                onClick={() => setOpenAddDepartmentModal(true)}
                icon={<PlusCircleOutlined />}
            >
                Add Department
            </Button>
        );
    }

    return (
        <Content>
            {/* PROTOTYPE-SETUP (Leave module, update): no service tabs — the way back to the dashboard. */}
            <PayrollServiceBar active="employees" />
            <PayrollAccessBanner />
            {/* PROTOTYPE-SETUP (Design update): the Peko page header (title, one grey line, actions on the right). */}
            <PekoPageHeader title={pageTitle} description="Employees, departments and profile updates." actions={headerActions} />
            <Row>
                <Col xs={24}>
                    <Tabs
                        defaultActiveKey="1"
                        activeKey={queryParams.get('tab') || '1'}
                        onChange={e => {
                            setActiveTab(e);
                            navigate(`/${paths.payroll.index}/${paths.payroll.employees}?tab=${e}`);
                        }}
                        items={items}
                    />
                </Col>
            </Row>
            {openAddEmployeeModal && (
                <AddEmployeeModal
                    open={openAddEmployeeModal}
                    onClose={() => setOpenAddEmployeeModal(false)}
                />
            )}
            {openAddDepartmentModal && (
                <DepartmentModal
                    setRefresh={setRefresh}
                    open={openAddDepartmentModal}
                    handleCancel={() => setOpenAddDepartmentModal(false)}
                />
            )}

            {openBulkUploadModal && (
                <BulkUploadModal
                    open={openBulkUploadModal}
                    handleCancel={() => setOpenBulkUploadModal(false)}
                />
            )}

            {openSelectEmployeeModal && (
                <SelectEmployeeModal
                    onEmployeeSelect={handleEmployeeSelected}
                    open={openSelectEmployeeModal}
                    handleCancel={() => setOpenSelectEmployeeModal(false)}
                />
            )}
            {openOffBoardEmployeeModal && (
                <OffBoardEmployeeModal
                    open={openOffBoardEmployeeModal}
                    handleCancel={() => setOpenOffBoardEmployeeModal(false)}
                    employeeData={selectedEmployee}
                    setOffboardReload={setOffboardReload}
                />
            )}
        </Content>
    );
}

export default Employees;
