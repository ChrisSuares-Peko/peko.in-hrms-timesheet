import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PaymentTimelineAndDetails from '../../../components/invoiceDetails/PaymentTimelineAndDetails';

describe('PaymentTimelineAndDetails', () => {
    it('renders placeholder rows (not the real data) when isLoading is true', () => {
        render(<PaymentTimelineAndDetails invoiceData={null} isLoading />);

        expect(screen.queryByText('Invoice Number')).not.toBeInTheDocument();
        expect(screen.queryByText('Customer Name')).not.toBeInTheDocument();
    });

    it('renders invoice details when invoiceData is provided', () => {
        render(
            <PaymentTimelineAndDetails
                invoiceData={
                    {
                        id: 1,
                        invoiceNumber: 'INV-1',
                        name: 'Arshid',
                        status: 'PENDING',
                        currency: 'INR',
                        totalAmount: '100',
                        amountDue: '50',
                        invoiceDate: '2024-01-01',
                        dueDate: '2024-01-10',
                        notes: '',
                    } as any
                }
                isLoading={false}
            />
        );

        expect(screen.getByText('Invoice Number')).toBeInTheDocument();
        expect(screen.getByText('INV-1')).toBeInTheDocument();
        expect(screen.getByText('Customer Name')).toBeInTheDocument();
        expect(screen.getByText('Arshid')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('shows "Quotation Number" instead of "Invoice Number" for quotations', () => {
        render(
            <PaymentTimelineAndDetails
                invoiceData={{ id: 2, documentType: 'QUOTATION', invoiceNumber: 'QUO-1' } as any}
                isLoading={false}
            />
        );

        expect(screen.getByText('Quotation Number')).toBeInTheDocument();
        expect(screen.getByText('QUO-1')).toBeInTheDocument();
        expect(screen.queryByText('Invoice Number')).not.toBeInTheDocument();
    });
});
