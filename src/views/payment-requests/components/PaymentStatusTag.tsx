import { Tag } from 'primereact/tag';
import React from 'react';
import { Center } from '../../../components/LayoutHelpers';

export const paymentStatusEnumToText = (status: string): string => {
    switch (status) {
        case 'CANCELLED': return 'Cancelled';
        case 'PAID': return 'Paid';
        case 'ERROR': return 'Error';
        case 'DECLINED': return 'Declined';
        case 'PRE_FLIGHT_CHECK': return 'Preflight Check';
        case 'INITIALIZING': return 'Initializing';
        case 'WAITING_FOR_PAYMENT': return 'Waiting';
        case 'WAITING_FOR_PROMOTION': return 'Promoting';
        case 'CANCELLING': return 'Cancelling';
        case 'FLOW_COMPLETED': return 'Flow Completed';
        case 'AUTHORIZED': return 'Authorized';
        case 'PARTIALLY_CAPTURED': return 'Partially Captured';
        case 'CAPTURE_DECLINED': return 'Capture Declined';
        case 'RELEASED': return 'Payment Released';
        default: return status;
    }
};

export type PaymentStatusSeverity = 'success' | 'warning' | 'danger' | 'secondary' | 'info' | 'contrast' | undefined | null;

export const badgeForPaymentStatus = (status: string): PaymentStatusSeverity | 'primary' => {
    switch (status) {
        case 'PAID':
        case 'FLOW_COMPLETED':
        case 'AUTHORIZED':
        case 'PARTIALLY_CAPTURED':
            return 'success';
        case 'CANCELLED':
        case 'CANCELLING':
        case 'RELEASED':
            return 'warning';
        case 'ERROR':
        case 'DECLINED':
        case 'CAPTURE_DECLINED':
            return 'danger';
        case 'PRE_FLIGHT_CHECK':
        case 'INITIALIZING':
        case 'WAITING_FOR_PAYMENT':
        case 'WAITING_FOR_PROMOTION':
            return 'primary';
        default:
            return 'secondary';
    }
};

export const PaymentStatusTag: React.FC<{ status: string }> = ({ status }) => {
    const severity = badgeForPaymentStatus(status);
    // 'primary' is not a valid severity for Tag, fallback to 'info'
    const validSeverity: PaymentStatusSeverity = severity === 'primary' ? 'info' : severity;
    return (
        <Center>
            <Tag value={paymentStatusEnumToText(status)} severity={validSeverity} style={{ fontSize: '.8rem', padding: '0.3em 1em' }} />
        </Center>
    )
};
