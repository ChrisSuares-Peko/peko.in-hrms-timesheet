// PROTOTYPE-SETUP (Leave settings rework — notes pay:settings:leave:holidays → "Bulk upload"): a two-step popup, the
// same pattern as bulk employee upload in Payroll.
//   1 · Upload file .. "Download template" (public-holidays-template.xlsx: Start date, End date, Holiday name + two
//                      sample rows); drop or pick an .xlsx, .xls or .csv file
//   2 · Review ....... Row, Holiday, From, To, Days, Status (Ready / Already added / the problem); a summary line;
//                      "Import N days" adds the Ready rows only (one entry per date); Back returns to the upload step
// Rules and wording: src/prototype/rules/holidayImport.ts. The old Excel 97–2003 .xls format can't be read in the
// browser (exceljs): the popup asks for .xlsx or .csv instead.
import { useState } from 'react';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Modal, Steps, Table, Typography, Upload } from 'antd';
import dayjs from 'dayjs';

import InfoTip from '@src/components/peko/InfoTip';
import StatusTag from '@src/components/peko/StatusTag';
import { downloadSheet } from '@src/domains/dashboard/globalBusinessSetup/utils/excel/downloadSheet';
import { HOLIDAY_IMPORT_STATUS, type HolidayImportRow, holidayReviewSummary, holidayTemplateRows, holidaysToImport, reviewHolidayRows } from '@src/prototype/rules/holidayImport';

import { importPublicHolidays } from '../../api';
import { usePayrollScope } from '../../payroll/usePayrollAts';
import type { LeaveSettingsView } from '../../types';
import { readSheetRows } from '../sheetFile';

const { Text } = Typography;

const toneOf = (s: HolidayImportRow['status']) => {
    if (s === 'ready') return 'success' as const;
    return s === 'added' ? ('neutral' as const) : ('error' as const);
};
const fmt = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—');

const HolidayUploadModal = ({ open, existing, onClose, onImported }: { open: boolean; existing: string[]; onClose: () => void; onImported: (v: LeaveSettingsView, days: number) => void }) => {
    const scope = usePayrollScope();
    const [step, setStep] = useState<0 | 1>(0);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<HolidayImportRow[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setStep(0);
        setFileName('');
        setRows([]);
        setError('');
    };
    const close = () => {
        reset();
        onClose();
    };
    const read = async (file: File) => {
        setError('');
        try {
            const review = reviewHolidayRows(await readSheetRows(file), existing);
            if (!review.length) {
                setError('No holidays found in this file. Fill in the template’s rows and upload it again.');
                return;
            }
            setFileName(file.name);
            setRows(review);
            setStep(1);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'This file can’t be read.');
        }
    };
    const toAdd = holidaysToImport(rows);
    const doImport = async () => {
        setBusy(true);
        const res = await importPublicHolidays(scope, toAdd);
        setBusy(false);
        if (res) {
            onImported(res, toAdd.length);
            reset();
        }
    };

    const footer =
        step === 0
            ? [
                  <Button key="c" onClick={close}>
                      Cancel
                  </Button>,
              ]
            : [
                  <Button key="b" onClick={() => setStep(0)} data-holiday-back>
                      Back
                  </Button>,
                  <Button key="i" type="primary" disabled={!toAdd.length} loading={busy} onClick={doImport} data-holiday-import>
                      Import {toAdd.length} day{toAdd.length === 1 ? '' : 's'}
                  </Button>,
              ];

    return (
        <Modal open={open} title="Bulk upload public holidays" onCancel={close} footer={footer} width={step === 1 ? 760 : 560} destroyOnHidden>
            <Flex vertical gap={16} data-holiday-upload={step === 0 ? 'upload' : 'review'}>
                <Steps size="small" current={step} items={[{ title: 'Upload file' }, { title: 'Review' }]} />
                {step === 0 && (
                    <>
                        <Flex align="center" justify="space-between" gap={8} wrap="wrap" className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2">
                            <Text className="inline-flex items-center text-sm">
                                One row per holiday: Start date, End date, Holiday name
                                <InfoTip
                                    label="About the file"
                                    title="End date = the start date for a one-day holiday. Dates as YYYY-MM-DD or DD/MM/YYYY (Excel dates work too). A holiday that runs over several days becomes one entry per date. Your file is checked before anything is added."
                                />
                            </Text>
                            <Button icon={<DownloadOutlined />} onClick={() => downloadSheet(holidayTemplateRows(dayjs().year() + 1), 'Public holidays', 'public-holidays-template.xlsx')} data-holiday-template>
                                Download template
                            </Button>
                        </Flex>
                        <Upload.Dragger
                            accept=".xlsx,.xls,.csv"
                            multiple={false}
                            showUploadList={false}
                            beforeUpload={file => {
                                read(file);
                                return false;
                            }}
                            data-holiday-file
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">Click or drag a file here</p>
                            <p className="ant-upload-hint">.xlsx, .xls or .csv</p>
                        </Upload.Dragger>
                        {error && <Alert type="error" showIcon message={error} data-holiday-file-error />}
                    </>
                )}
                {step === 1 && (
                    <>
                        <Text className="text-sm" data-holiday-summary>
                            {fileName}: {holidayReviewSummary(rows)}
                        </Text>
                        <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)]">
                            <Table<HolidayImportRow>
                                rowKey="row"
                                size="small"
                                dataSource={rows}
                                pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false}
                                scroll={{ x: 'max-content' }}
                                data-holiday-review
                                columns={[
                                    { title: 'Row', dataIndex: 'row', width: 56 },
                                    { title: 'Holiday', key: 'n', render: (_, r) => r.name || '—' },
                                    { title: 'From', key: 'f', render: (_, r) => fmt(r.from) },
                                    { title: 'To', key: 't', render: (_, r) => fmt(r.to) },
                                    { title: 'Days', key: 'd', render: (_, r) => r.days || '—' },
                                    {
                                        title: 'Status',
                                        key: 's',
                                        render: (_, r) => (
                                            <StatusTag tone={toneOf(r.status)} className="!m-0" data-holiday-status={r.status}>
                                                {HOLIDAY_IMPORT_STATUS[r.status]}
                                            </StatusTag>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </>
                )}
            </Flex>
        </Modal>
    );
};

export default HolidayUploadModal;
