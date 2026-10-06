import { Content } from 'antd/es/layout/layout';

import { Header, ProductCards } from '../components/searchResults';
import Search from '../components/searchResults/sections/Search';
import { SearchPageProvider } from '../contexts/SearchPageContext';

const SearchResults = () => (
    <SearchPageProvider>
        <Content className="my-6">
            <Header />
            <Search />
            <ProductCards />
        </Content>
    </SearchPageProvider>
);

export default SearchResults;
