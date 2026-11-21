import { useEffect, useState } from 'react';

import { SearchOutlined } from '@ant-design/icons';
import { Button, Col, Input, Pagination, Row, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import StatusTag, { type StatusTone } from '@src/components/peko/StatusTag';
import useScreenSize from '@src/hooks/useScreenSize';

import { useGetDocumentRequestsApi } from '../../hooks/employeeHooks/useGetDocumentRequestsApi';
import ShareDocumentModal from '../modals/ShareDocumentModal';

const stripEmoji = (value: string) =>
    value.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');

export type DocumentRequestRecord = {
    key: string;
    requestId: string;
    employeeName: string;
    employeeId: string;
    documentType: string;
    purpose?: string;
    date: string;
    status: 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
};

// PROTOTYPE-SETUP (Design update, rule 9): the shared Peko status tag.
const STATUS_TONE: Record<DocumentRequestRecord['status'], StatusTone> = {
    Pending: 'warning',
    'In Progress': 'info',
    Completed: 'success',
    Rejected: 'error',
};

const renderStatus = (status: DocumentRequestRecord['status']) => <StatusTag tone={STATUS_TONE[status]}>{status}</StatusTag>;

const PAGE_SIZE = 10;

interface DocumentRequestsTabProps {
    onPendingCountChange?: (count: number) => void;
}

const DocumentRequestsTab = ({ onPendingCountChange }: DocumentRequestsTabProps) => {
    const { xs } = useScreenSize();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<DocumentRequestRecord | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    const { requestData, requestLoading, requestTotal, pendingCount } = useGetDocumentRequestsApi(
        page,
        PAGE_SIZE,
        search,
        refresh
    );

    useEffect(() => {
        onPendingCountChange?.(pendingCount);
    }, [pendingCount, onPendingCountChange]);

    const handleView = (record: DocumentRequestRecord) => {
        setSelectedRecord(record);
        setModalOpen(true);
    };

    const columns: ColumnsType<DocumentRequestRecord> = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (date: string) => dayjs(date).format('MMM D, YYYY'),
        },
        {
            title: 'Employee Name',
            dataIndex: 'employeeName',
            key: 'employeeName',
        },
        {
            title: 'Document Requested',
            dataIndex: 'documentType',
            key: 'documentType',
            render: (documentType: string, record) => (
                <div>
                    <div>{documentType}</div>
                    {record.purpose && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {record.purpose}
                        </Typography.Text>
                    )}
                </div>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: renderStatus,
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Button size="small" onClick={() => handleView(record)}>
                    View
                </Button>
            ),
        },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <Input
                    placeholder="Search by name or document"
                    prefix={<SearchOutlined />}
                    allowClear
                    value={search}
                    onChange={e => {
                        setSearch(stripEmoji(e.target.value));
                        setPage(1);
                    }}
                    style={{ maxWidth: xs ? '100%' : 320 }}
                />
            </div>

            <Table
                columns={columns}
                dataSource={requestData}
                loading={requestLoading}
                rowKey="key"
                pagination={false}
                tableLayout={xs ? 'fixed' : 'auto'}
                scroll={xs ? undefined : { x: 'max-content' }}
                size="middle"
            />
            <Row>
                <Col span={24}>
                    {requestData.length > 0 && (
                        <Pagination
                            current={page}
                            size="default"
                            className="md:text-end pt-7 xs:text-center"
                            total={requestTotal}
                            onChange={p => setPage(p)}
                            defaultPageSize={PAGE_SIZE}
                        />
                    )}
                </Col>
            </Row>

            <ShareDocumentModal
                open={modalOpen}
                record={selectedRecord}
                onCancel={() => {
                    setModalOpen(false);
                    setSelectedRecord(null);
                }}
                onSuccess={() => {
                    setModalOpen(false);
                    setSelectedRecord(null);
                    setRefresh(prev => !prev);
                }}
            />
        </>
    );
};

export default DocumentRequestsTab;
