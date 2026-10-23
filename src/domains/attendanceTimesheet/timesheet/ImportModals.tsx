// PROTOTYPE-SETUP (Final batch, Slice 3): "Download template" and "Upload timesheet" on the Timesheet tab's view bar.
//   Timesheet template ... the columns with four example rows (a preview), "Copy CSV" and "Download CSV"
//   Upload timesheet ..... pick a CSV; the server checks it (matched columns, then each row: Ready, or why not) and
//                          "Import N entries" adds only the ready rows, as a draft
// Rules and wording: src/prototype/rules/timesheetImport.ts.
import { useState } from 'react';

import { Alert, Button, Modal, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { locationChip, weekStartOf } from '@src/prototype/rules/attendance';
import {
    ImportPreview,
    ImportRow,
    TEMPLATE_COLUMNS,
    TEMPLATE_TEXT,
    columnsText,
    importRowHours,
    importRowTime,
    importSummary,
    importedToast,
    templateIntro,
    templateRows,
    toCsv,
} from '@src/prototype/rules/timesheetImport';
import { showToast } from '@src/slices/apiSlice';

import { importTimesheet, previewTimesheetImport } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { TimesheetFields } from '../types';

const { Text } = Typography;

export const TemplateModal = ({
    open,
    today,
    projectsOn,
    projectCode,
    fields,
    onClose,
}: {
    open: boolean;
    today: string;
    projectsOn: boolean;
    /** The example rows' code (the company's first one). */
    projectCode?: string;
    /** The company's task-entry fields (the examples and the intro follow them). */
    fields?: TimesheetFields;
    onClose: () => void;
}) => {
    const dispatch = useAppDispatch();
    const rows = templateRows(weekStartOf(today), projectsOn ? projectCode ?? '' : '', fields);
    const csv = toCsv(rows);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(csv);
            dispatch(showToast({ description: 'Template copied', variant: 'success' }));
        } catch {
            dispatch(showToast({ description: 'Couldn’t copy. Select the text instead.', variant: 'error' }));
        }
    };
    const columns: ColumnsType<string[]> = TEMPLATE_COLUMNS.map((c, i) => ({
        title: c,
        key: c,
        render: (_, r) => (r[i] ? <span className="whitespace-nowrap">{r[i]}</span> : <span className="text-gray-400">—</span>),
    }));
    return (
        <Modal
            open={open}
            title="Timesheet template"
            width={760}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={copy}>Copy CSV</Button>
                    <Button type="primary" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download="timesheet-template.csv">
                        Download CSV
                    </Button>
                </div>
            }
        >
            <p className="mb-3 mt-1 text-sm text-[#616161]">
                {templateIntro(fields, projectsOn)}
            </p>
            <Table size="small" pagination={false} rowKey={r => r.join('|')} columns={columns} dataSource={rows.slice(1)} scroll={{ x: 'max-content' }} data-template-preview />
            <Text type="secondary" className="mt-2 block text-xs">
                {TEMPLATE_TEXT.formats}
            </Text>
        </Modal>
    );
};

export const UploadModal = ({
    open,
    projectsOn,
    onClose,
    onImported,
}: {
    open: boolean;
    projectsOn: boolean;
    onClose: () => void;
    onImported: () => void;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [csv, setCsv] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setCsv('');
        setPreview(null);
    };
    const close = () => {
        reset();
        onClose();
    };

    const read = (file: File) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const text = String(reader.result ?? '');
            setCsv(text);
            setBusy(true);
            const res = await previewTimesheetImport(scope, text);
            setBusy(false);
            setPreview(res || null);
        };
        reader.readAsText(file);
    };

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
    const columns: ColumnsType<ImportRow> = [
        { title: 'Row', dataIndex: 'row', key: 'row', render: v => <span className="text-gray-400">{v}</span> },
        { title: 'Date', key: 'date', render: (_, r) => <span className="whitespace-nowrap">{r.entry ? dayjs(r.entry.date).format('ddd, D MMM') : r.date || '—'}</span> },
        { title: 'Time', key: 'time', render: (_, r) => <span className="whitespace-nowrap">{importRowTime(r)}</span> },
        { title: 'Hours', key: 'hours', render: (_, r) => importRowHours(r) },
        { title: 'Location', key: 'location', render: (_, r) => <span className="whitespace-nowrap">{r.entry ? locationChip(r.entry.location, r.entry.client) : r.location || '—'}</span> },
        ...(projectsOn ? [{ title: 'Project', key: 'project', render: (_: unknown, r: ImportRow) => r.entry?.projectCode ?? (r.project || '—') }] : []),
        { title: 'Description', dataIndex: 'description', key: 'description', render: v => <span className="block min-w-[140px] break-words">{v || '—'}</span> },
        {
            title: 'Status',
            key: 'status',
            render: (_, r) =>
                r.ready ? (
                    <span className="flex flex-col gap-0.5">
                        <Tag color="success" className="!m-0 w-fit">
                            Ready
                        </Tag>
                        {r.note && <span className="text-[11px] text-[#B54708]">{r.note}</span>}
                    </span>
                ) : (
                    <Tag color="error" className="!m-0 whitespace-normal">
                        {r.reason}
                    </Tag>
                ),
        },
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
            <label htmlFor="timesheet-upload" className="mb-3 block text-sm text-gray-700">
                <span className="mb-1 block">CSV file (from the template)</span>
                <input
                    id="timesheet-upload"
                    type="file"
                    accept=".csv,text/csv"
                    className="block w-full max-w-full text-sm"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) read(f);
                    }}
                />
            </label>
            {!preview && !busy && <Text type="secondary" className="text-xs">{TEMPLATE_TEXT.beforeFile}</Text>}
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
