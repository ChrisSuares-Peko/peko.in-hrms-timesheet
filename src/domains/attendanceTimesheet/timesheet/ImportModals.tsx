// PROTOTYPE-SETUP (Final batch, Slice 3): "Download template" and "Upload timesheet" on the Timesheet tab's view bar.
// PROTOTYPE-SETUP (Timesheet v6, Slice 4): Excel both ways (exceljs — already a dependency, loaded lazily):
//   Download timesheet ... This week / This month / Last month / Custom, From–To (at most a year), one summary line
//                          ("N entries · X logged"; PROTOTYPE-SETUP (Leave & team, Slice 3): no preview table, the
//                          normal modal size), "Copy rows" (tab-separated) and "Download Excel"
//                          (timesheet-{from}-to-{to}.xlsx: the template's columns + Status; breaks as "Break" rows)
//   Upload timesheet ..... .xlsx, .xls or .csv; a strip with "Download template" (timesheet-template.xlsx); the first
//                          sheet is read as text and checked by the server (matched columns, then each row: Ready,
//                          Skipped — already saved / a break — or why not); "Import N entries" adds the ready rows
// Rules and wording: src/prototype/rules/timesheetImport.ts.
import { useEffect, useState } from 'react';

import { Alert, Button, DatePicker, Modal, Segmented, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import { downloadSheet } from '@src/domains/dashboard/globalBusinessSetup/utils/excel/downloadSheet';
import { useAppDispatch } from '@src/hooks/store';
import { addDays, locationChip, weekStartOf } from '@src/prototype/rules/attendance';
import {
    ImportPreview,
    ImportRow,
    TEMPLATE_TEXT,
    columnsText,
    exportFileName,
    exportRangeError,
    exportSummary,
    importRowHours,
    importRowTime,
    importSummary,
    importedToast,
    sheetCellText,
    templateRows,
    toCsv,
    toTsv,
} from '@src/prototype/rules/timesheetImport';
import { showToast } from '@src/slices/apiSlice';

import { getTimesheetExport, importTimesheet, previewTimesheetImport } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { TimesheetFields } from '../types';

const { Text } = Typography;

type Preset = 'week' | 'month' | 'last' | 'custom';

/** The preset's From–To. */
const presetRange = (preset: Exclude<Preset, 'custom'>, today: string): [string, string] => {
    if (preset === 'week') return [weekStartOf(today), addDays(weekStartOf(today), 6)];
    const m = preset === 'month' ? dayjs(today) : dayjs(today).subtract(1, 'month');
    return [m.startOf('month').format('YYYY-MM-DD'), m.endOf('month').format('YYYY-MM-DD')];
};

export const DownloadModal = ({ open, today, onClose }: { open: boolean; today: string; onClose: () => void }) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [preset, setPreset] = useState<Preset>('week');
    const [[from, to], setRange] = useState<[string, string]>(() => presetRange('week', today));
    const [data, setData] = useState<{ rows: string[][]; entries: number; loggedMinutes: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const error = exportRangeError(from, to);

    useEffect(() => {
        if (!open || error) return undefined;
        let live = true;
        setLoading(true);
        getTimesheetExport(scope, from, to).then(res => {
            if (!live) return;
            setLoading(false);
            setData(res || null);
        });
        return () => {
            live = false;
        };
    }, [open, from, to, error, scope]);

    const pick = (p: Preset) => {
        setPreset(p);
        if (p !== 'custom') setRange(presetRange(p, today));
    };
    const copy = async () => {
        if (!data) return;
        try {
            await navigator.clipboard.writeText(toTsv(data.rows));
            dispatch(showToast({ description: 'Rows copied', variant: 'success' }));
        } catch {
            dispatch(showToast({ description: 'Couldn’t copy. Download the Excel file instead.', variant: 'error' }));
        }
    };
    const download = async () => {
        if (!data) return;
        await downloadSheet(data.rows, 'Timesheet', exportFileName(from, to));
    };

    const empty = Boolean(data) && (data?.rows.length ?? 0) <= 1;
    const ready = !error && Boolean(data) && !loading && !empty;

    return (
        <Modal
            open={open}
            title="Download timesheet"
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={copy} disabled={!ready} data-copy-rows>
                        Copy rows
                    </Button>
                    <Button type="primary" onClick={download} disabled={!ready} data-download-excel>
                        Download Excel
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-3 pt-1" data-download-modal>
                <div className="-mx-1 max-w-full self-start overflow-x-auto px-1">
                    <Segmented<Preset>
                        value={preset}
                        onChange={pick}
                        options={[
                            { label: 'This week', value: 'week' },
                            { label: 'This month', value: 'month' },
                            { label: 'Last month', value: 'last' },
                            { label: 'Custom', value: 'custom' },
                        ]}
                        data-export-preset
                    />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">From</span>
                        <DatePicker
                            id="ts-export-from"
                            aria-label="From"
                            value={dayjs(from)}
                            allowClear={false}
                            format="D MMM YYYY"
                            onChange={d => {
                                if (!d) return;
                                setPreset('custom');
                                setRange([d.format('YYYY-MM-DD'), to]);
                            }}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">To</span>
                        <DatePicker
                            id="ts-export-to"
                            aria-label="To"
                            value={dayjs(to)}
                            allowClear={false}
                            format="D MMM YYYY"
                            onChange={d => {
                                if (!d) return;
                                setPreset('custom');
                                setRange([from, d.format('YYYY-MM-DD')]);
                            }}
                        />
                    </div>
                </div>
                {/* PROTOTYPE-SETUP (Leave & team, Slice 3): no preview — one summary line. */}
                {error && <Alert type="error" showIcon message={error} data-export-error />}
                {!error && (
                    <Text className="text-sm" data-export-summary>
                        {loading && !data && 'Counting entries…'}
                        {data && (empty ? 'No entries in this range.' : exportSummary(data.entries, data.loggedMinutes))}
                    </Text>
                )}
                <Text type="secondary" className="text-xs">
                    The file uses the same columns as the upload template (plus Status), so you can edit it and upload it back.
                </Text>
            </div>
        </Modal>
    );
};

/** PROTOTYPE-SETUP (Timesheet v6, Slice 4): an .xlsx / .xls / .csv file → CSV text (the first sheet, as text). */
const readTimesheetFile = async (file: File): Promise<string> => {
    if (file.name.toLowerCase().endsWith('.csv')) return file.text();
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
    if (!sheet) return '';
    const rows: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= sheet.columnCount; c += 1) {
            const cell = row.getCell(c);
            let text: string | undefined;
            try {
                ({ text } = cell);
            } catch {
                text = undefined;
            }
            cells.push(sheetCellText(cell.value, text));
        }
        if (cells.some(Boolean)) rows.push(cells);
    }
    return toCsv(rows);
};

export const UploadModal = ({
    open,
    today,
    projectsOn,
    projectCode,
    fields,
    onClose,
    onImported,
}: {
    open: boolean;
    today: string;
    projectsOn: boolean;
    /** The template's example code (the company's first one). */
    projectCode?: string;
    /** The company's task-entry fields (the template's examples follow them). */
    fields?: TimesheetFields;
    onClose: () => void;
    onImported: () => void;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [csv, setCsv] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [fileError, setFileError] = useState('');

    const reset = () => {
        setCsv('');
        setPreview(null);
        setFileError('');
    };
    const close = () => {
        reset();
        onClose();
    };

    const read = async (file: File) => {
        reset();
        setBusy(true);
        let text = '';
        try {
            text = await readTimesheetFile(file);
        } catch (e) {
            setBusy(false);
            setFileError(e instanceof Error ? e.message : String(e));
            return;
        }
        setCsv(text);
        const res = await previewTimesheetImport(scope, text);
        setBusy(false);
        setPreview(res || null);
    };

    const template = () => downloadSheet(templateRows(weekStartOf(today), projectsOn ? projectCode ?? '' : '', fields), 'Timesheet', 'timesheet-template.xlsx');

    const run = async () => {
        setBusy(true);
        const res = await importTimesheet(scope, csv);
        setBusy(false);
        if (!res) return;
        dispatch(showToast({ description: importedToast(res.imported), variant: 'success' }));
        reset();
        onImported();
    };

    const ready = preview?.ready ?? 0;
    const statusOf = (r: ImportRow) => {
        if (r.skipped) {
            return (
                <Tag className="!m-0 whitespace-normal" data-skipped>
                    {r.skipped}
                </Tag>
            );
        }
        if (!r.ready) {
            return (
                <Tag color="error" className="!m-0 whitespace-normal">
                    {r.reason}
                </Tag>
            );
        }
        return (
            <span className="flex flex-col gap-0.5">
                <Tag color="success" className="!m-0 w-fit">
                    Ready
                </Tag>
                {r.note && <span className="text-[11px] text-[#B54708]">{r.note}</span>}
            </span>
        );
    };
    const columns: ColumnsType<ImportRow> = [
        { title: 'Row', dataIndex: 'row', key: 'row', render: v => <span className="text-gray-400">{v}</span> },
        { title: 'Date', key: 'date', render: (_, r) => <span className="whitespace-nowrap">{r.entry ? dayjs(r.entry.date).format('ddd, D MMM') : r.date || '—'}</span> },
        { title: 'Time', key: 'time', render: (_, r) => <span className="whitespace-nowrap">{importRowTime(r)}</span> },
        { title: 'Hours', key: 'hours', render: (_, r) => importRowHours(r) },
        { title: 'Location', key: 'location', render: (_, r) => <span className="whitespace-nowrap">{r.entry ? locationChip(r.entry.location, r.entry.client) : r.location || '—'}</span> },
        ...(projectsOn ? [{ title: 'Project', key: 'project', render: (_: unknown, r: ImportRow) => r.entry?.projectCode ?? (r.project || '—') }] : []),
        { title: 'Description', dataIndex: 'description', key: 'description', render: v => <span className="block min-w-[140px] break-words">{v || '—'}</span> },
        { title: 'Status', key: 'status', render: (_, r) => statusOf(r) },
    ];

    return (
        <Modal
            open={open}
            title="Upload timesheet"
            width={880}
            onCancel={close}
            destroyOnHidden
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={close}>Cancel</Button>
                    <Button type="primary" disabled={!ready || busy} loading={busy && Boolean(preview)} onClick={run} data-import>
                        {ready ? `Import ${ready} ${ready === 1 ? 'entry' : 'entries'}` : 'Import'}
                    </Button>
                </div>
            }
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#EEF3FF] px-3 py-2 text-sm text-[#1D3F9E]" data-upload-strip>
                <span className="min-w-0">Fill in the template, then upload it here. Each row is one entry.</span>
                <Button size="small" onClick={template} data-template-download>
                    Download template
                </Button>
            </div>
            <label htmlFor="timesheet-upload" className="mb-3 block text-sm text-gray-700">
                <span className="mb-1 block">Excel or CSV file (.xlsx, .xls, .csv)</span>
                <input
                    id="timesheet-upload"
                    type="file"
                    accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="block w-full max-w-full text-sm"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) read(f);
                        e.target.value = '';
                    }}
                />
            </label>
            {!preview && !busy && !fileError && (
                <Text type="secondary" className="block text-xs">
                    {TEMPLATE_TEXT.formats} {TEMPLATE_TEXT.beforeFile}
                </Text>
            )}
            {fileError && <Alert type="error" showIcon className="mb-2" message={fileError} data-file-error />}
            {preview?.error && <Alert type="error" showIcon className="mb-2" message={preview.error} />}
            {preview?.columns && (
                <Text type="secondary" className="mb-2 block text-xs" data-matched-columns>
                    Matched columns: {columnsText(preview.columns)}
                </Text>
            )}
            {preview?.rows && (
                <>
                    <p className="mb-2 text-sm" data-import-summary>
                        {importSummary(preview)}
                    </p>
                    <Table
                        size="small"
                        pagination={false}
                        rowKey="row"
                        columns={columns}
                        dataSource={preview.rows}
                        scroll={{ x: 'max-content', y: 320 }}
                        data-import-preview
                    />
                </>
            )}
        </Modal>
    );
};
