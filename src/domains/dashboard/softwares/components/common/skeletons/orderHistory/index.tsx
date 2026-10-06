import { Flex, Skeleton } from 'antd';

const ROW_COUNT = 7;
const COLUMNS = [180, 150, 120, 160, 160, 120, 100, 80];

const OrderHistorySkeleton = () => (
    <Flex vertical gap={20} className="mt-3 pt-24">
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
            {/* Column headers */}
            <Flex
                style={{
                    padding: '12px 16px',
                    background: '#fafafa',
                    borderBottom: '1px solid #f0f0f0',
                }}
                gap={16}
            >
                {COLUMNS.map((w, i) => (
                    <Skeleton.Input key={i} active style={{ width: w, height: 16 }} />
                ))}
            </Flex>
            {/* Rows */}
            {Array.from({ length: ROW_COUNT }).map((_, rowIdx) => (
                <Flex
                    key={rowIdx}
                    style={{
                        padding: '16px',
                        borderBottom: rowIdx < ROW_COUNT - 1 ? '1px solid #f0f0f0' : undefined,
                    }}
                    gap={16}
                    align="center"
                >
                    {COLUMNS.map((w, i) => (
                        <Skeleton.Input key={i} active style={{ width: w, height: 16 }} />
                    ))}
                </Flex>
            ))}
        </div>
    </Flex>
);
export default OrderHistorySkeleton;
