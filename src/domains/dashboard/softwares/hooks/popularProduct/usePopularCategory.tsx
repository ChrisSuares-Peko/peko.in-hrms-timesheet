import { useEffect, useState } from 'react';

import { useAppSelector } from '@src/hooks/store';

import { fetchPopularProducts } from '../../api';
import { IProductCard } from '../../types';

const usePopularCategory = () => {
    const { role, id } = useAppSelector(state => state.reducer.auth);

    const [popularProducts, setPopularProducts] = useState<IProductCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isProducts, setIsProducts] = useState(true);

    const [total, setTotal] = useState(0);

    useEffect(() => {
        const getPopularProducts = async () => {
            setIsLoading(true);

            const data = await fetchPopularProducts({
                userId: id,
                userType: role,
            });

            if (data && data.products) {
                setPopularProducts(data.products);
                setTotal(data.products.length || 0);
                setIsProducts(true);
            } else {
                setIsProducts(false);
            }

            setIsLoading(false);
        };

        if (id && role) {
            getPopularProducts();
        }
    }, [id, role]);

    return {
        popularProducts,
        isLoading,
        isProducts,
        total,
    };
};

export default usePopularCategory;
