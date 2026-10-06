import { useEffect } from 'react';

import { Outlet } from 'react-router-dom';

import { useAppDispatch } from '@src/hooks/store';

import { resetSoftwareState } from '../slice/softwareSlice';

const SoftwareLayout = () => {
    const dispatch = useAppDispatch();
    useEffect(
        () => () => {
            dispatch(resetSoftwareState());
        },
        [dispatch]
    );

    return <Outlet />;
};

export default SoftwareLayout;
