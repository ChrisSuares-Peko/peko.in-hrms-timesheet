// PROTOTYPE-SETUP: tiny in-memory document builders for the salary mocks. Payslip/Form 16 downloads expect
// the PDF bytes in the response (`pdfData.data`, or a Blob for ESS) and the exports expect Excel bytes, so
// real (small) files are generated here instead of fetching anything from the network.
import { COMPANY } from './company';
import { PayrollLine, inr, monthLabel } from './salary-payroll';

const ascii = (s: string) => s.replace(/₹/g, 'INR ').replace(/[^\x20-\x7E]/g, '');
const escapePdf = (s: string) => ascii(s).replace(/[\\()]/g, m => `\\${m}`);

/** A one-page A4 PDF with a title and plain text lines (Helvetica). Returns the file's bytes. */
export const buildPdf = (title: string, lines: string[]): number[] => {
    const body = [
        'BT',
        '/F1 16 Tf',
        '50 790 Td',
        `(${escapePdf(title)}) Tj`,
        '/F1 10 Tf',
        '0 -28 Td',
        ...lines.map(line => `(${escapePdf(line)}) Tj 0 -15 Td`),
        'ET',
    ].join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((obj, i) => {
        const at = pdf.length;
        pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
        return at;
    });
    const xrefAt = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
    return Array.from(pdf, c => c.charCodeAt(0));
};

export const payslipPdf = (line: PayrollLine): number[] => {
    const e = line.employee;
    const b = line.breakup;
    return buildPdf(`${COMPANY.name} - Payslip for ${monthLabel(line.pm)}`, [
        `${COMPANY.offices[e.location].line1}, ${COMPANY.offices[e.location].city}`,
        '',
        `Employee: ${e.fullName} (${e.employeeId})`,
        `Designation: ${e.designation}, ${e.department}`,
        `PAN: ${e.pan}    UAN: ${e.uan}`,
        `Bank: ${e.bank.bankName} A/c XXXX${e.bank.accountNumber.slice(-4)}`,
        `Paid days: ${line.paidDays} of ${line.pm.daysInMonth}`,
        '',
        'EARNINGS',
        `Basic Salary: ${inr(b.basic)}`,
        `House Rent Allowance: ${inr(b.hra)}`,
        `Conveyance Allowance: ${inr(b.conveyance)}`,
        `Medical Allowance: ${inr(b.medical)}`,
        `Special Allowance: ${inr(b.specialAllowance)}`,
        ...(line.bonus ? [`Diwali Bonus: ${inr(line.bonus)}`] : []),
        ...(line.incentive ? [`Sales Incentive: ${inr(line.incentive)}`] : []),
        `Gross Earnings: ${inr(line.gross)}`,
        '',
        'DEDUCTIONS',
        `Employee PF: ${inr(b.employeePf)}`,
        `Professional Tax: ${inr(b.professionalTax)}`,
        `TDS: ${inr(b.tds)}`,
        `Total Deductions: ${inr(line.deductions)}`,
        '',
        `NET PAY: ${inr(line.netPayable)}`,
        `Employer PF contribution: ${inr(b.employerPf)}`,
        '',
        'This is a system-generated payslip and does not require a signature.',
    ]);
};

/** Builds an .xlsx workbook (single sheet) with exceljs and returns its bytes. */
export const buildXlsx = async (sheetName: string, header: string[], rows: (string | number)[][]) => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(header).font = { bold: true };
    rows.forEach(r => sheet.addRow(r));
    sheet.columns.forEach(col => {
        // eslint-disable-next-line no-param-reassign
        col.width = 20;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return Array.from(new Uint8Array(buffer as ArrayBuffer));
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const toBase64 = (bytes: number[]) => btoa(bytes.map(b => String.fromCharCode(b)).join(''));
