// PROTOTYPE-SETUP (Leave fixes — notes pay:leave:details → "Adjust, import, export"): Payroll → Leave → Balances.
//   AdjustBalanceModal ..... "Adjust balance": leave type (with what's available now), Add days / Deduct days, days, a
//                            reason (required; shown in the employee's ledger and Recent activity) and a live "9.5 → 11.5
//                            days available after this". Saved as an adjustment the engine counts in this cycle.
//   OpeningBalancesModal ... "Import opening balances": 1 · Upload file (template: Employee ID, Leave type, Opening
//                            balance (days), As of date), 2 · Review (Row, Employee, Leave type, Opening balance, As of,
//                            Status), "Import N rows" adds the Ready rows as "Opening balance" ledger lines.
// Rules and wording: src/prototype/rules/openingBalances.ts.
import { useEffect, useState } from 'react';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Input, InputNumber, Modal, Radio, Select, Skeleton, Steps, Table, Typography, Upload } from 'antd';
import dayjs from 'dayjs';

import InfoTip from '@src/components/peko/InfoTip';
import StatusTag from '@src/components/peko/StatusTag';
import { downloadSheet } from '@src/domains/dashboard/globalBusinessSetup/utils/excel/downloadSheet';
import { daysText, fmtDays, negativeRoom, typeLabel } from '@src/prototype/rules/leave';
import { OPENING_STATUS, type OpeningRow, adjustedBalance, adjustmentProblem, openingReviewSummary, openingTemplateRows, openingToImport, reviewOpeningRows } from '@src/prototype/rules/openingBalances';

import { adjustLeaveBalance, getAdminLeaveView, getOpeningBalanceContext, importOpeningBalances } from '../../api';
import { readSheetRows } from '../../leave/sheetFile';
import type { LeaveView } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

// ---- Adjust balance ---------------------------------------------------------------------------------------------------

export const AdjustBalanceModal = ({ employeeId, onClose, onSaved }: { employeeId: number | null; onClose: () => void; onSaved: (message: string) => void }) => {
    const scope = usePayrollScope();
    const [view, setView] = useState<LeaveView | null>(null);
    const [type, setType] = useState<string>('');
    const [direction, setDirection] = useState<'add' | 'deduct'>('add');
    const [days, setDays] = useState<number | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        setView(null);
        setDirection('add');
        setDays(null);
        setReason('');
        setError('');
        if (employeeId)
            getAdminLeaveView(scope, employeeId).then(v => {
                if (!v) return;
                setView(v);
                setType(v.balances.find(b => b.type !== 'COMP_OFF')?.type ?? '');
            });
    }, [scope, employeeId]);
    // Yearly types only: comp off has its own earned / expiry rules, per-event leave has no balance.
    const types = (view?.balances ?? []).filter(b => b.type !== 'COMP_OFF');
    const b = types.find(x => x.type === type);
    const first = view?.employeeName.split(' ')[0] ?? '';
    const now = b?.available ?? 0;
    const after = adjustedBalance(now, direction, days ?? 0);
    const save = async () => {
        if (!view || !b) return setError('Pick a leave type.');
        const problem = adjustmentProblem({ direction, days: days ?? 0, reason }, { first, available: now, label: typeLabel(b.name), room: negativeRoom(view.rules.negative) });
        if (problem) return setError(problem);
        setBusy(true);
        const res = await adjustLeaveBalance(scope, view.employeeId, { type, direction, days: days ?? 0, reason: reason.trim() });
        setBusy(false);
        if (res) onSaved(res.message);
        return undefined;
    };
    return (
        <Modal
            open={employeeId !== null}
            title={view ? `Adjust ${first}’s balance` : 'Adjust balance'}
            width={480}
            destroyOnHidden
            onCancel={onClose}
            onOk={save}
            okText="Save adjustment"
            okButtonProps={{ loading: busy, disabled: !view, ...({ 'data-adjust-save': true } as Record<string, unknown>) }}
        >
            {!view ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : (
                <Flex vertical gap={12} data-adjust-modal>
                    <Flex vertical gap={4}>
                        <Text className="text-[13px] font-medium">Leave type</Text>
                        <Select
                            value={type || undefined}
                            onChange={v => {
                                setType(v);
                                setError('');
                            }}
                            aria-label="Leave type"
                            options={types.map(x => ({ value: x.type, label: `${x.label} · ${daysText(x.available)} available` }))}
                            data-adjust-type
                        />
                    </Flex>
                    <Flex vertical gap={4}>
                        <Text className="text-[13px] font-medium">Adjustment</Text>
                        <Radio.Group
                            optionType="button"
                            value={direction}
                            onChange={e => {
                                setDirection(e.target.value);
                                setError('');
                            }}
                            aria-label="Add or deduct"
                            options={[
                                { value: 'add', label: 'Add days' },
                                { value: 'deduct', label: 'Deduct days' },
                            ]}
                            data-adjust-direction
                        />
                    </Flex>
                    <Flex vertical gap={4}>
                        <Text className="text-[13px] font-medium">Days</Text>
                        <InputNumber
                            min={0}
                            max={365}
                            step={0.5}
                            value={days}
                            onChange={n => {
                                setDays(n === null || n === undefined ? null : Number(n));
                                setError('');
                            }}
                            className="!w-[140px]"
                            aria-label="Days"
                            data-adjust-days
                        />
                    </Flex>
                    <div className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2" data-adjust-preview>
                        <Text className="text-sm">
                            <b className="font-medium tabular-nums">
                                {fmtDays(now)} → {fmtDays(after)} days
                            </b>
                            <span className="text-[var(--peko-muted)]"> available after this</span>
                        </Text>
                    </div>
                    <Flex vertical gap={4}>
                        <Text className="inline-flex items-center text-[13px] font-medium">
                            Reason
                            <InfoTip
                                label="About the reason"
                                title="Shown in the employee’s ledger and in Recent activity, e.g. “Correction for leave taken in March” or “Special leave approved by management”."
                            />
                        </Text>
                        <Input.TextArea
                            rows={2}
                            maxLength={200}
                            value={reason}
                            onChange={e => {
                                setReason(e.target.value);
                                setError('');
                            }}
                            aria-label="Reason"
                            data-adjust-reason
                        />
                    </Flex>
                    {error && <Alert type="error" showIcon message={error} data-adjust-error />}
                </Flex>
            )}
        </Modal>
    );
};

// ---- Import opening balances ----------------------------------------------------------------------------------------

type Ctx = NonNullable<Awaited<ReturnType<typeof getOpeningBalanceContext>>>;

export const OpeningBalancesModal = ({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (message: string) => void }) => {
    const scope = usePayrollScope();
    const [ctx, setCtx] = useState<Ctx | null>(null);
    const [step, setStep] = useState<0 | 1>(0);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<OpeningRow[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setStep(0);
        setRows([]);
        setError('');
        getOpeningBalanceContext(scope).then(c => setCtx(c || null));
    }, [open, scope]);
    const reviewCtx = ctx ? { ...ctx, imported: new Set(ctx.imported) } : null;
    const read = async (file: File) => {
        setError('');
        if (!reviewCtx) return;
        try {
            const review = reviewOpeningRows(await readSheetRows(file, 4), reviewCtx);
            if (!review.length) {
                setError('No rows found in this file. Fill in the template and upload it again.');
                return;
            }
            setFileName(file.name);
            setRows(review);
            setStep(1);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'This file can’t be read.');
        }
    };
    const ready = openingToImport(rows);
    const doImport = async () => {
        setBusy(true);
        const res = await importOpeningBalances(scope, ready);
        setBusy(false);
        if (res) onImported(res.message);
    };
    const footer =
        step === 0
            ? [
                  <Button key="c" onClick={onClose}>
                      Cancel
                  </Button>,
              ]
            : [
                  <Button key="b" onClick={() => setStep(0)} data-opening-back>
                      Back
                  </Button>,
                  <Button key="i" type="primary" disabled={!ready.length} loading={busy} onClick={doImport} data-opening-import>
                      Import {ready.length} row{ready.length === 1 ? '' : 's'}
                  </Button>,
              ];
    return (
        <Modal open={open} title="Import opening balances" onCancel={onClose} footer={footer} width={step === 1 ? 820 : 560} destroyOnHidden>
            <Flex vertical gap={16} data-opening-upload={step === 0 ? 'upload' : 'review'}>
                <Steps size="small" current={step} items={[{ title: 'Upload file' }, { title: 'Review' }]} />
                {step === 0 && (
                    <>
                        <Flex align="center" justify="space-between" gap={8} wrap="wrap" className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2">
                            <Text className="inline-flex items-center text-sm">
                                One row per employee and leave type
                                <InfoTip
                                    label="About the file"
                                    title="Columns: Employee ID, Leave type (yearly types only), Opening balance (days), As of date (YYYY-MM-DD or DD/MM/YYYY; empty = today). For companies moving to Peko mid-year: each balance is added to the employee’s ledger as an opening balance. Your file is checked before anything is added."
                                />
                            </Text>
                            <Button
                                icon={<DownloadOutlined />}
                                disabled={!ctx}
                                onClick={() => ctx && downloadSheet(openingTemplateRows(ctx), 'Opening balances', 'opening-balances-template.xlsx')}
                                data-opening-template
                            >
                                Download template
                            </Button>
                        </Flex>
                        <Upload.Dragger
                            accept=".xlsx,.xls,.csv"
                            multiple={false}
                            showUploadList={false}
                            disabled={!ctx}
                            beforeUpload={file => {
                                read(file);
                                return false;
                            }}
                            data-opening-file
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">Click or drag a file here</p>
                            <p className="ant-upload-hint">.xlsx, .xls or .csv</p>
                        </Upload.Dragger>
                        {error && <Alert type="error" showIcon message={error} data-opening-file-error />}
                    </>
                )}
                {step === 1 && (
                    <>
                        <Text className="inline-flex items-center text-sm" data-opening-summary>
                            {fileName}: {openingReviewSummary(rows)}
                            <InfoTip title="Only Ready rows are imported." label="About the review" />
                        </Text>
                        <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)]">
                            <Table<OpeningRow>
                                rowKey="row"
                                size="small"
                                dataSource={rows}
                                pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false}
                                scroll={{ x: 'max-content' }}
                                data-opening-review
                                columns={[
                                    { title: 'Row', dataIndex: 'row', width: 56 },
                                    { title: 'Employee', key: 'e', render: (_, r) => r.employeeName || r.employeeId || '—' },
                                    { title: 'Leave type', key: 't', render: (_, r) => r.typeName || '—' },
                                    { title: 'Opening balance', key: 'd', render: (_, r) => (r.days === null ? '—' : fmtDays(r.days)) },
                                    { title: 'As of', key: 'a', render: (_, r) => dayjs(r.asOf).format('D MMM YYYY') },
                                    {
                                        title: 'Status',
                                        key: 's',
                                        render: (_, r) => (
                                            <StatusTag tone={r.status === 'ready' ? 'success' : 'error'} className="!m-0" data-opening-status={r.status}>
                                                {OPENING_STATUS[r.status]}
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
