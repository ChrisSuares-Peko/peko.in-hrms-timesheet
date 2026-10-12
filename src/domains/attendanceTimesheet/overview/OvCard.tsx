// PROTOTYPE-SETUP (Overview, Slice 2): the Overview's card shell — a labelled section with an optional heading
// row ("Attendance  ·  Open ›").
import { ReactNode } from 'react';

import { Typography } from 'antd';
import { Link } from 'react-router-dom';

const { Text } = Typography;

export const OvCard = ({
    label,
    title,
    sub,
    link,
    extra,
    className = '',
    children,
}: {
    /** aria-label of the section. */
    label: string;
    title?: ReactNode;
    sub?: ReactNode;
    /** "Open ›" style link in the heading row. */
    link?: { to: string; text: string };
    extra?: ReactNode;
    className?: string;
    children: ReactNode;
}) => (
    <section
        aria-label={label}
        className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-solid border-gray-100 bg-white p-4 shadow-sm ${className}`}
    >
        {(title || link || extra) && (
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    {title && <h3 className="m-0 text-base font-semibold text-valueText">{title}</h3>}
                    {extra}
                    <span className="flex-1" />
                    {link && (
                        <Link to={link.to} className="shrink-0 text-sm font-medium text-[#2E62E8] hover:underline">
                            {link.text}
                        </Link>
                    )}
                </div>
                {sub && <Text className="block text-xs text-titleText">{sub}</Text>}
            </div>
        )}
        {children}
    </section>
);

export default OvCard;
