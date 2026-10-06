import { useCallback, useState } from 'react';

import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { paths } from '@src/routes/paths';
import { showToast } from '@src/slices/apiSlice';

import { setQueryParams } from '../../slice/softwareSlice';

const useSearch = () => {
    const [searchText, setSearchText] = useState('');
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(e.target.value);
    };

    const getSearchResults = useCallback(async () => {
        if (searchText.trim().length < 3) {
            dispatch(
                showToast({
                    description: 'Please provide a search with atlease 3 letters',
                    variant: 'error',
                })
            );
            return;
        }
        dispatch(setQueryParams({ search: searchText }));
        navigate(`${paths.softwares.searchResults}?query=${searchText}`);
    }, [searchText, navigate, dispatch]);

    return { handleSearch, getSearchResults, searchText };
};

export default useSearch;
