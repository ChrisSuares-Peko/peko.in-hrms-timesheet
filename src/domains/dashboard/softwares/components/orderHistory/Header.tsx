import { SearchOutlined } from '@ant-design/icons';
import { DatePicker, Flex, Input, Typography } from 'antd';
import dayjs from 'dayjs';

import { IOrderDetailsFilter } from '../../hooks/order/useOrderHistory';

type Props = {
    handleFilterChange: (dates: any) => void;
    handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    filter: IOrderDetailsFilter;
};
const Header = ({ handleFilterChange, handleSearchChange, filter }: Props) => {
    const dateFormat = 'YYYY-MM-DD';

    return (
        <Flex className="mt-3 justify-center items-center flex-col sm:flex-row gap-2 ">
            <Typography.Text className=" text-center text-lg  sm:text-base xl:text-xl lg:text-lg md:w-[50%] md:text-start font-medium ">
                Order History
            </Typography.Text>
            <Flex className="gap-1 flex-1 flex-col sm:flex-row">
                <DatePicker.RangePicker
                    onChange={handleFilterChange}
                    format={dateFormat}
                    value={[filter.from ? dayjs(filter.from) : null, dayjs(filter.to)]}
                    className="w-full"
                    disabledDate={current => current && current > dayjs().endOf('day')}
                />
                <Input
                    placeholder="Search for orders"
                    suffix={<SearchOutlined />}
                    allowClear
                    type="text"
                    maxLength={100}
                    value={filter.search}
                    onChange={handleSearchChange}
                />
            </Flex>
        </Flex>
    );
};

export default Header;
