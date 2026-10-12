// PROTOTYPE-SETUP (Overview, Slice 3; decluttered in Overview v2, Slice 3): section 6 — shortcut tiles, icon and
// title only (icon above the title, so long titles fit): Leave, Reimbursements, Overtime, Payslips, Documents.
// One row on desktop, 3 then 2 per row on smaller screens. Each opens its page (Overtime opens the Overtime tab).
import { ReactNode } from 'react';

import { CalendarOutlined, FieldTimeOutlined, FileTextOutlined, FolderOpenOutlined, WalletOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

export type ShortcutKey = 'leave' | 'reimbursements' | 'overtime' | 'payslips' | 'documents';

const TILES: { key: ShortcutKey; icon: ReactNode; label: string }[] = [
    { key: 'leave', icon: <CalendarOutlined />, label: 'Leave' },
    { key: 'reimbursements', icon: <WalletOutlined />, label: 'Reimbursements' },
    { key: 'overtime', icon: <FieldTimeOutlined />, label: 'Overtime' },
    { key: 'payslips', icon: <FileTextOutlined />, label: 'Payslips' },
    { key: 'documents', icon: <FolderOpenOutlined />, label: 'Documents' },
];

const OvShortcuts = ({ to, className = '' }: { to: Record<ShortcutKey, string>; className?: string }) => (
    <section aria-label="Shortcuts" className={`grid min-w-0 grid-cols-2 gap-2 self-start sm:grid-cols-3 xl:grid-cols-5 ${className}`}>
        {TILES.map(t => (
            <Link
                key={t.key}
                to={to[t.key]}
                className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-solid border-gray-100 bg-white px-2 py-2 text-center shadow-sm transition-shadow hover:shadow-md"
            >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFECEC] text-[#FF4F4F]" aria-hidden>
                    {t.icon}
                </span>
                <span className="max-w-full truncate text-[13px] font-medium text-[#101828]">{t.label}</span>
            </Link>
        ))}
    </section>
);

export default OvShortcuts;
