import React, { useState } from 'react';

import { formatNumberWithLocalStringWithoutDecimalPoint } from '@utils/priceFormat';

import StatutoryCardShell from './StatutoryCardShell';
import { EPF_INFO } from './statutoryInfoContent';
import { EpfCardData } from '../../../hooks/employeeProfileHooks/useEmployeeStatutoryDetails';
import UpdateStatutoryTextModal from '../modals/UpdateStatutoryTextModal';

interface EpfStatutoryCardProps {
    data: EpfCardData;
    toggleLoading?: boolean;
    onToggle: (checked: boolean) => void;
    onUpdateUan: (value: string) => Promise<any>;
}

const EpfStatutoryCard = ({ data, toggleLoading, onToggle, onUpdateUan }: EpfStatutoryCardProps) => {
    const [modalOpen, setModalOpen] = useState(false);

    const pfWageNote = data.isCapped
        ? ` (PF wages capped ₹${formatNumberWithLocalStringWithoutDecimalPoint(data.pfWage)})`
        : '';
    const employeeBadge = `12% of Basic${pfWageNote} — ₹${formatNumberWithLocalStringWithoutDecimalPoint(data.employeeContribution)}`;
    const epsBadge = `8.33% of Basic${pfWageNote} — ₹${formatNumberWithLocalStringWithoutDecimalPoint(data.employerEps)}`;
    const employerEpfBadge = `Balance of 12% after EPS${pfWageNote} — ₹${formatNumberWithLocalStringWithoutDecimalPoint(data.employerEpf)}`;
    const edliBadge = `0.5% of Basic${pfWageNote} — ₹${formatNumberWithLocalStringWithoutDecimalPoint(data.edli)}`;
    const adminBadge = `0.5% of Basic${pfWageNote} — ₹${formatNumberWithLocalStringWithoutDecimalPoint(data.adminCharges)}`;

    return (
        <>
            <StatutoryCardShell
                title="EPF"
                statusText={data.isActive ? 'Active' : 'Inactive'}
                statusPositive={data.isActive}
                actionLabel="Update UAN"
                onAction={() => setModalOpen(true)}
                showToggle
                toggleChecked={data.isActive}
                toggleLoading={toggleLoading}
                onToggle={onToggle}
                infoContent={EPF_INFO}
                fields={[
                    { label: 'UAN Number', value: data.uan || '—' },
                    { label: 'Employee Contribution (A/c 1)', value: employeeBadge },
                    { label: 'EPS / Pension (A/c 10)', value: epsBadge },
                    { label: "Employer EPF (A/c 1)", value: employerEpfBadge },
                    { label: 'EDLI (A/c 21)', value: edliBadge },
                    { label: 'Admin Charges (A/c 2)', value: adminBadge },
                    { label: 'Included in EPF (ECR) Filing', value: data.isActive ? 'Yes' : 'No' },
                ]}
            />
            {modalOpen && (
                <UpdateStatutoryTextModal
                    open={modalOpen}
                    title="Update UAN"
                    label="UAN Number"
                    fieldKey="epfUAN"
                    initialValue={data.uan}
                    handleCancel={() => setModalOpen(false)}
                    onSave={(_fieldKey, value) => onUpdateUan(value)}
                />
            )}
        </>
    );
};

export default EpfStatutoryCard;
