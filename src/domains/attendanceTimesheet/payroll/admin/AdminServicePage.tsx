// PROTOTYPE-SETUP (Payroll admin, Slice 1): Payroll → Leave / Overtime / Reimbursements — Requests: the admin
// requests list for the service (every employee; level 2).
import AdminRequestsList from './AdminRequestsList';
import { AdminSubTabs, PayrollServiceTabs, ServiceHeader, useAdminCounts, useAdminView } from './adminShared';

type Service = 'overtime' | 'reimbursement';

const COPY: Record<Service, { title: string; line: string }> = {
    overtime: { title: 'Overtime', line: 'Overtime requests from every employee. You approve after their manager.' },
    reimbursement: { title: 'Reimbursements', line: 'Every employee’s claims. You approve after their manager.' },
};

const AdminServicePage = ({ service }: { service: Service }) => {
    const [view, setView] = useAdminView(['requests']);
    const counts = useAdminCounts();
    return (
        <div className="w-full min-w-0" data-admin-page={service}>
            <PayrollServiceTabs active={service} />
            <ServiceHeader title={COPY[service].title} line={COPY[service].line} />
            <AdminSubTabs value={view} onChange={setView} options={[{ value: 'requests', label: `Requests (${counts?.[service] ?? 0})` }]} />
            {view === 'requests' && <AdminRequestsList type={service} />}
        </div>
    );
};

export default AdminServicePage;
