import React from 'react';

import { useDevPage } from '@src/prototype/devNotes/devPage';

import ReimbursementClaimsTab from '../components/sections/ReimbursementClaimsTab';

const Reimbursements: React.FC = () => {
    // PROTOTYPE-SETUP (Developer notes): ESS → Reimbursements.
    useDevPage('ess:reimbursement');
    return (
        <div className="w-full">
            <ReimbursementClaimsTab />
        </div>
    );
};

export default Reimbursements;
