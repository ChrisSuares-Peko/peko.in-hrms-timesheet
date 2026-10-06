import { useCallback, useEffect, useState } from 'react';

import dayjs, { Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import { useAppSelector } from '@src/hooks/store';

import { fetchOrderDetails } from '../../api';
import { IPurchaseItem } from '../../types/product';
import scrollTotop from '../../utils/scrollTotop';

export type IOrderDetailsFilter = {
    from: Dayjs | null;
    to: Dayjs | null;
    search: string;
    page: number;
    limit: number;
};

const getFilterFromParams = (searchParams: URLSearchParams): IOrderDetailsFilter => {
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 10;
    const search = searchParams.get('search') || '';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    return {
        page,
        limit,
        search,
        from: from ? dayjs(from) : dayjs().subtract(1, 'month'),
        to: to ? dayjs(to) : dayjs(),
    };
};

const useOrderHistory = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const [isLoading, setIsLoading] = useState(true);
    const [orderDetails, setOrderDetails] = useState<IPurchaseItem[]>([]);
    const [total, setTotal] = useState(0);
    const { role, id } = useAppSelector(state => state.reducer.auth);

    const [filter, setFilter] = useState<IOrderDetailsFilter>(() => {
        if (!searchParams.toString()) {
            return {
                from: dayjs().subtract(1, 'month'),
                to: dayjs(),
                search: '',
                page: 1,
                limit: 10,
            };
        }
        return getFilterFromParams(searchParams);
    });

    useEffect(() => {
        const params = new URLSearchParams({
            page: String(filter.page),
            limit: String(filter.limit),
            search: filter.search || '',
            from: filter.from ? filter.from.toISOString() : '',
            to: filter.to ? filter.to.toISOString() : '',
        });

        if (params.toString() !== searchParams.toString()) {
            setSearchParams(params, { replace: true });
        }
    }, [filter, searchParams, setSearchParams]);

    const getOrderDetails = useCallback(async () => {
        setIsLoading(true);
        const data = await fetchOrderDetails({
            userId: id,
            userType: role,
            from: filter.from ? filter.from.toISOString() : null,
            to: filter.to ? filter.to.toISOString() : null,
            searchText: filter.search,
            page: filter.page,
            limit: filter.limit,
        });
        if (data && data.data.orderDetails) {
            setOrderDetails(data.data.orderDetails);
            if (data.data?.totalData) {
                setTotal(data.data.totalData);
            }
        }
        setIsLoading(false);
    }, [id, role, filter]);

    useEffect(() => {
        getOrderDetails();
    }, [getOrderDetails]);

    const handleFilterChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
        if (!dates) {
            setFilter(prev => ({ ...prev, from: null, to: dayjs(), page: 1 }));
            return;
        }
        const [from, to] = dates;
        setFilter(prev => ({ ...prev, from, to, page: 1 }));
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilter(prev => ({ ...prev, search: e.target.value, page: 1 }));
    };

    const handlePagination = (page: number, pageSize: number) => {
        scrollTotop();
        setFilter(prev => ({ ...prev, page, limit: pageSize }));
    };

    return {
        orderDetails,
        isLoading,
        handleFilterChange,
        handleSearchChange,
        handlePagination,
        filter,
        total,
    };
};

export default useOrderHistory;
