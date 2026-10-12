// PROTOTYPE-SETUP (Overview, Slice 3): section 6 — shortcut cards (prototype "OvCards"). Each has an icon, a
// label, one value line and one sub line. Leave, Reimbursements, Payslips and Documents open the existing ESS
// pages; Overtime opens the Overtime tab.
import { ReactNode } from 'react';

import { CalendarOutlined, FieldTimeOutlined, FileTextOutlined, FolderOpenOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { formatDuration } from '../components/format';
import type { OverviewShortcuts } from '../types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Shortcut {
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    sub: string;
    to: string;
}

export const shortcutCards = (s: OverviewShortcuts, to: Record<'leave' | 'reimbursements' | 'overtime' | 'payslips' | 'documents', string>): Shortcut[] => {
    const next = s.leave.nextLeave;
    const {latest} = s.payslip;
    return [
        {
            key: 'leave',
            icon: <CalendarOutlined />,
            label: 'Leave',
            value: next ? `Next: ${dayjs(next.start).format('D MMM')}` : 'None booked',
            sub: `${plural(s.leave.waiting, 'request')} waiting`,
            to: to.leave,
        },
        {
            key: 'reimbursements',
            icon: <WalletOutlined />,
            label: 'Reimbursements',
            value: s.reimbursement.pendingAmount ? `₹${s.reimbursement.pendingAmount.toLocaleString('en-IN')} pending` : 'Nothing pending',
            sub: `${plural(s.reimbursement.inApproval, 'claim')} in approval`,
            to: to.reimbursements,
        },
        {
            key: 'overtime',
            icon: <FieldTimeOutlined />,
            label: 'Overtime',
            value: `${formatDuration(s.overtime.approvedMinutes)} approved`,
            sub: `in ${s.overtime.monthLabel.split(' ')[0]}, ${plural(s.overtime.waiting, 'request')} waiting`,
            to: to.overtime,
        },
        {
            key: 'payslips',
            icon: <FileTextOutlined />,
            label: 'Payslips',
            // PROTOTYPE-SETUP (Overview follow-ups): no amount here — net pay shows on the Payslips page only.
            value: latest ? `${dayjs(`${latest.year}-${String(latest.month).padStart(2, '0')}-01`).format('MMMM YYYY')} payslip ready` : 'None yet',
            sub: latest ? 'View and download your payslips' : 'Payslips appear after payroll runs',
            to: to.payslips,
        },
        {
            key: 'documents',
            icon: <FolderOpenOutlined />,
            label: 'Documents',
            value: plural(s.documents.count, 'document'),
            sub: 'In your document vault',
            to: to.documents,
        },
    ];
};

const OvShortcuts = ({ cards, className = '' }: { cards: Shortcut[]; className?: string }) => (
    <section aria-label="Shortcuts" className={`grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5 ${className}`}>
        {cards.map(c => (
            <Link
                key={c.key}
                to={c.to}
                className="flex min-w-0 flex-col gap-1 rounded-2xl border border-solid border-gray-100 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md"
            >
                <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#FFECEC] text-[#FF4F4F]" aria-hidden>
                    {c.icon}
                </span>
                <span className="text-xs text-titleText">{c.label}</span>
                <b className="break-words text-sm font-semibold leading-snug text-valueText">{c.value}</b>
                <span className="text-[11px] leading-snug text-titleText">{c.sub}</span>
            </Link>
        ))}
    </section>
);

export default OvShortcuts;
