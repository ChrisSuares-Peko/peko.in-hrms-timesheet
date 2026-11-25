// PROTOTYPE-SETUP (Leave fixes): reading an uploaded spreadsheet (public holidays bulk upload, opening balances import).
// The old Excel 97–2003 .xls format can't be read in the browser (exceljs): the message asks for .xlsx or .csv instead.
import { parseCsv, sheetCellText } from '@src/prototype/rules/timesheetImport';

/** An .xlsx / .xls / .csv file → rows of cell text (the first sheet). */
export const readSheetRows = async (file: File, minColumns = 3): Promise<string[][]> => {
    if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
        throw new Error(
            file.name.toLowerCase().endsWith('.xls')
                ? 'This .xls file is in the old Excel 97–2003 format. Save it as .xlsx (or .csv) and upload it again.'
                : 'This file can’t be read. Upload an .xlsx, .xls or .csv file.'
        );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= Math.max(minColumns, sheet.columnCount); c += 1) {
            const cell = row.getCell(c);
            const { value } = cell;
            // Date cells as YYYY-MM-DD (not the cell's display text, which follows the sheet's locale).
            cells.push(value instanceof Date ? sheetCellText(value) : sheetCellText(value, typeof value === 'object' && value ? cell.text : undefined));
        }
        rows.push(cells);
    }
    return rows;
};
