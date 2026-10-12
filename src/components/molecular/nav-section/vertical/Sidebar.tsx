import { memo, useMemo } from 'react';

import { Flex, Image, Menu, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import logo from '@assets/mainLogo/standard';
import { PekoPackages } from '@customtypes/general';
import { useAppSelector } from '@src/hooks/store';
import { activeNavKey, navOpenKeys, withGroupTitleClick } from '@src/prototype/persona/essNav';
import { paths } from '@src/routes/paths';

import { useNavData } from './SidebarData';

const transformNavData = (navData: any[]) =>
    navData?.map((item: { key: string }) => ({
        ...item,
        key: item.key || Math.random().toString(36).substring(2, 11), // Assign a random key if key is empty
        disabled: item.key === '',
    }));
const Sidebar = () => {
    const location = useLocation();
    const navData = useNavData();
    const navigate = useNavigate();
    // PROTOTYPE-SETUP (Overview, Slice 3): clicking the ESS - Employee group title opens its Overview.
    const transformedNavData = useMemo(
        () => withGroupTitleClick(transformNavData(navData || []), to => navigate(to)),
        [navData, navigate]
    );
    const { packageName, role } = useAppSelector(state => state.reducer.auth);

    // PROTOTYPE-SETUP (Overview, Slice 3): the longest matching key, sub-items included.
    const activeKey = useMemo(
        () => activeNavKey(transformedNavData ?? [], location.pathname),
        [transformedNavData, location.pathname]
    );
    return (
        <div className="px-1 pb-4 overflow-x-hidden bg-white border-r border-gray-200 border-solid min-h-svh">
            <Flex className="w-full pt-2 pb-4 pl-6 ">
                <Image
                    src={
                        packageName === PekoPackages.Basic || role !== 'corporate' ? logo : logo // PekoOne
                    }
                    alt="logo"
                    onClick={() =>
                        navigate(
                            location.pathname.startsWith(paths.employee.home)
                                ? paths.employee.home
                                : '/dashboard'
                        )
                    }
                    className="bg-transparent cursor-pointer"
                    preview={false}
                    width={120}
                />
            </Flex>
            <Menu
                className="app-sidebar-menu"
                mode="inline"
                items={transformedNavData}
                selectedKeys={[activeKey, location.pathname]}
                openKeys={navOpenKeys(location.pathname)}
                onClick={({ key }) => {
                    if (key !== '') {
                        navigate(key, { state: { initialActiveTab: '1' } });
                    } else {
                        message.error('non clickable');
                    }
                }}
            />
        </div>
    );
};

export default memo(Sidebar);
