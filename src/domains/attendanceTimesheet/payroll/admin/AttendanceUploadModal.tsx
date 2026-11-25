// PROTOTYPE-SETUP (Bulk attendance upload — notes pay:attendance): Payroll → Attendance → "Bulk attendance upload", for
// employees who aren't on the biometric system. Two steps like the other uploads:
//   1 · Upload file .. the blue Loss of Pay note; "Download template" (attendance-upload-template.xlsx: Employee ID,
//                      Date, Check-in, Check-out + two sample rows); drop or pick an .xlsx, .xls or .csv file
//   2 · Review ....... "file · N to import · M with problems · K already recorded"; "Replace existing records" (only when
//                      some rows already have attendance); Row, Employee, Date, Check-in, Check-out ("(next day)"),
//                      Status; "Import N records"; Back returns to the upload step
// Rules and wording: src/prototype/rules/attendanceImport.ts. The review runs on the server (it knows every existing
// record) and again on import.
import { useState } from 'react';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Flex, Modal, Steps, Table, Typography, Upload } from 'antd';
import dayjs from 'dayjs';

import InfoTip from '@src/components/peko/InfoTip';
import StatusTag from '@src/components/peko/StatusTag';
import { downloadSheet } from '@src/domains/dashboard/globalBusinessSetup/utils/excel/downloadSheet';
import { EMPLOYEES } from '@src/prototype/mocks/data/employees';
import {
    ATTENDANCE_IMPORT_STATUS,
    ATTENDANCE_PROBLEMS,
    type AttendanceImportRow,
    LOP_UPLOAD_NOTE,
    attendanceReviewSummary,
    attendanceTemplateRows,
    attendanceToImport,
} from '@src/prototype/rules/attendanceImport';

import { importAttendanceUpload, reviewAttendanceUpload } from '../../api';
import { readSheetRows } from '../../leave/sheetFile';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

const toneOf = (s: AttendanceImportRow['status']) => {
    if (s === 'ready') return 'success' as const;
    if (s === 'replace') return 'warning' as const;
    return s === 'recorded' ? ('neutral' as const) : ('error' as const);
};
const t12 = (t: string | null) => (t ? dayjs(`2000-01-01T${t}`).format('h:mm A') : '—');

const AttendanceUploadModal = ({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (message: string) => void }) => {
    const scope = usePayrollScope();
    const [step, setStep] = useState<0 | 1>(0);
    const [fileName, setFileName] = useState('');
    const [cells, setCells] = useState<string[][]>([]);
    const [rows, setRows] = useState<AttendanceImportRow[]>([]);
    const [replace, setReplace] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setStep(0);
        setFileName('');
        setCells([]);
        setRows([]);
        setReplace(false);
        setError('');
    };
    const close = () => {
        reset();
        onClose();
    };
    const review = async (data: string[][], rep: boolean) => {
        const res = await reviewAttendanceUpload(scope, data, rep);
        return res ? res.rows : null;
    };
    const read = async (file: File) => {
        setError('');
        try {
            const data = await readSheetRows(file, 4);
            const res = await review(data, false);
            if (!res) return;
            if (!res.length) {
                setError('No rows found in this file. Fill in the template and upload it again.');
                return;
            }
            setFileName(file.name);
            setCells(data);
            setRows(res);
            setReplace(false);
            setStep(1);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'This file can’t be read.');
        }
    };
    const toggleReplace = async (on: boolean) => {
        setReplace(on);
        const res = await review(cells, on);
        if (res) setRows(res);
    };
    const ok = attendanceToImport(rows);
    const someExist = rows.some(r => r.exists && !ATTENDANCE_PROBLEMS.includes(r.status));
    const doImport = async () => {
        setBusy(true);
        const res = await importAttendanceUpload(scope, ok, replace);
        setBusy(false);
        if (res) {
            reset();
            onImported(res.message);
        }
    };
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    const footer =
        step === 0
            ? [
                  <Button key="c" onClick={close}>
                      Cancel
                  </Button>,
              ]
            : [
                  <Button key="b" onClick={() => setStep(0)} data-att-back>
                      Back
                  </Button>,
                  <Button key="i" type="primary" disabled={!ok.length} loading={busy} onClick={doImport} data-att-import>
                      Import {ok.length} record{ok.length === 1 ? '' : 's'}
                  </Button>,
              ];

    return (
        <Modal open={open} title="Bulk attendance upload" onCancel={close} footer={footer} width={step === 1 ? 820 : 560} destroyOnHidden>
            <Flex vertical gap={16} data-att-upload={step === 0 ? 'upload' : 'review'}>
                <Steps size="small" current={step} items={[{ title: 'Upload file' }, { title: 'Review' }]} />
                {step === 0 && (
                    <>
                        <Alert type="info" showIcon message={LOP_UPLOAD_NOTE} data-att-lop-note />
                        <Flex align="center" justify="space-between" gap={8} wrap="wrap" className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2">
                            <Text className="inline-flex items-center text-sm">
                                One row per employee per day: Employee ID, Date, Check-in, Check-out
                                <InfoTip
                                    label="About the file"
                                    title="For employees not on the biometric system. Times in 24-hour or AM/PM (or Excel times); a check-out earlier than the check-in counts as the next day. Dates as YYYY-MM-DD or DD/MM/YYYY. Your file is checked before anything is added."
                                />
                            </Text>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() =>
                                    downloadSheet(
                                        attendanceTemplateRows(
                                            EMPLOYEES.slice(2, 4).map(e => e.employeeId),
                                            yesterday
                                        ),
                                        'Attendance',
                                        'attendance-upload-template.xlsx'
                                    )
                                }
                                data-att-template
                            >
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
                            data-att-file
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">Click or drag a file here</p>
                            <p className="ant-upload-hint">.xlsx, .xls or .csv</p>
                        </Upload.Dragger>
                        {error && <Alert type="error" showIcon message={error} data-att-file-error />}
                    </>
                )}
                {step === 1 && (
                    <>
                        <Flex align="center" gap={12} wrap="wrap">
                            <Text className="min-w-0 flex-1 text-sm" data-att-summary>
                                <b className="font-medium">{fileName}</b> · {attendanceReviewSummary(rows)}
                            </Text>
                            {someExist && (
                                <Checkbox checked={replace} onChange={e => toggleReplace(e.target.checked)} data-att-replace>
                                    Replace existing records
                                </Checkbox>
                            )}
                        </Flex>
                        <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)]">
                            <Table<AttendanceImportRow>
                                rowKey="row"
                                size="small"
                                dataSource={rows}
                                pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false}
                                scroll={{ x: 'max-content' }}
                                data-att-review
                                columns={[
                                    { title: 'Row', dataIndex: 'row', width: 56 },
                                    { title: 'Employee', key: 'e', render: (_, r) => r.employeeName || r.employeeId || '—' },
                                    { title: 'Date', key: 'd', render: (_, r) => (r.date ? dayjs(r.date).format('D MMM YYYY') : '—') },
                                    { title: 'Check-in', key: 'i', render: (_, r) => t12(r.checkIn) },
                                    { title: 'Check-out', key: 'o', render: (_, r) => (r.checkOut ? `${t12(r.checkOut)}${r.nextDay ? ' (next day)' : ''}` : '—') },
                                    {
                                        title: 'Status',
                                        key: 's',
                                        render: (_, r) => (
                                            <StatusTag tone={toneOf(r.status)} className="!m-0" data-att-status={r.status}>
                                                {ATTENDANCE_IMPORT_STATUS[r.status]}
                                            </StatusTag>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                        <Text type="secondary" className="text-xs">
                            Imported times show in Attendance and the employee’s timesheet, marked as uploaded. Late marks follow the usual rules.
                        </Text>
                    </>
                )}
            </Flex>
        </Modal>
    );
};

export default AttendanceUploadModal;
