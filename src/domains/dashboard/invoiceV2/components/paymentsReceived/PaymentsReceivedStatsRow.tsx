import { Flex, Skeleton } from 'antd';

import emptyWalletImg from '../../assets/icons/empty-wallet.svg';
import moneySendImg from '../../assets/icons/money-send2.svg';
import statusUpImg from '../../assets/icons/status-up.svg';
import { formatAmount } from '../../utils/helperFunctions';
import StatCard from '../shared/StatCard';

interface Props {
    totalReceived: number;
    totalRefunded: number;
    netCashPosition: number;
    loading: boolean;
}

const PaymentsReceivedStatsRow = ({
    totalReceived,
    totalRefunded,
    netCashPosition,
    loading,
}: Props) => {
    if (loading) {
        return (
            <Flex gap={16} wrap="wrap" className="mb-6">
                {[1, 2, 3].map(i => (
                    <Skeleton.Button key={i} active block className="h-24 rounded-xl flex-1" />
                ))}
            </Flex>
        );
    }

    return (
        <Flex gap={16} wrap="wrap" className="mb-6">
            <StatCard
                value={formatAmount(totalReceived)}
                label="Total Received"
                bgColor="#FDF6F0"
                icon={moneySendImg}
            />
            <StatCard
                value={formatAmount(totalRefunded)}
                label="Total Refunded"
                bgColor="#ECF0FC"
                icon={statusUpImg}
            />
            <StatCard
                value={formatAmount(netCashPosition)}
                label="Net Cash Position"
                bgColor="#EBF6F1"
                icon={emptyWalletImg}
            />
        </Flex>
    );
};

export default PaymentsReceivedStatsRow;
