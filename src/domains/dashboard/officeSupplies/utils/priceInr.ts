import { parseAmount } from '@utils/priceFormat';

/** Non-breaking space so "₹" and the digits cannot wrap onto separate lines. */
const INR_GAP = '\u00A0';

/**
 * "₹ 1,234.50" — en-IN grouping, always 2 decimals (Office Supplies is INR-only).
 *
 * The gap after the symbol matches how money is written everywhere else in the app
 * (the payments summary, the admin orders table, the legacy ecommerce order details).
 * It is a non-breaking space so a squeezed checkout row cannot put ₹ on one line
 * and the amount on the next.
 *
 * Goes through parseAmount so a value that already carries a symbol (some ONDC
 * sellers send "₹50.00") renders as ₹ 50.00 rather than the "₹NaN" a plain
 * Number() produced. The symbol is added here and only here.
 */
export const formatInr = (value?: number | string | null): string =>
    `₹${INR_GAP}${parseAmount(value).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
