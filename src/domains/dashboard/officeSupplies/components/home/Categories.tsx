import { FC } from 'react';

// Import categoryIcons and specify its type
import { Empty, Flex, Image, Typography } from 'antd';

import CategoriesSkeleton from './skeltons/CategoriesSkelton';
import AllCategoryIcon from '../../assets/icons/sell.svg';
import { Category } from '../../types/category';

interface CategoriesProps {
    categories: Category[];
    selectedCategory: number | null;
    isLoading: boolean;
    setSelectedCategory: (name: number | null) => void;
    setSelectedCategoryName: (name: string) => void;
}

const Categories: FC<CategoriesProps> = ({
    categories,
    selectedCategory,
    isLoading,
    setSelectedCategory,
    setSelectedCategoryName,
}) => (
    <Flex
        gap={25}
        justify="start"
        align="center"
        className="Flex gap-30 xl:justify-start category_center md:w-full px-2 py-2 mt-12 mb-8 overflow-x-scroll overflow-y-clip"
    >
        <CategoriesSkeleton loading={isLoading} />
        {categories.length === 0 && !isLoading && (
            <Empty className="mx-auto" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {categories.length !== 0 && !isLoading && (
            <Flex
                align="center"
                vertical
                className="text-center text-textBlack cursor-pointer hover:scale-105 mt-1 xs:mb-5 md:mb-0"
                onClick={() => {
                    setSelectedCategory(null);
                    setSelectedCategoryName('All Category');
                }}
            >
                <Flex
                    justify="center"
                    align="center"
                    className={`border ${selectedCategory === null ? 'border-bgOrange' : 'border-whitesmoke'} 
            rounded-full w-14 h-14 xl:w-[4.5rem] xl:h-[4.5rem]`}
                >
                    <Image preview={false} src={AllCategoryIcon} alt="Stationary Icon" />
                </Flex>
                <Typography.Text
                    className={`text-center text-xs md:text-base mt-2 line-clamp-1 ${selectedCategory === 1 ? 'text-bgOrange' : 'text-black'} `}
                >
                    All
                </Typography.Text>
            </Flex>
        )}
        {categories.map((value, index) => (
            <Flex
                align="center"
                vertical
                className="text-center text-textBlack cursor-pointer hover:scale-105 xs:mb-5 md:mb-0"
                onClick={() => {
                    setSelectedCategory(value.id);
                    setSelectedCategoryName(value.categoryName);
                }}
                key={index}
            >
                <Flex
                    justify="center"
                    align="center"
                    className={`border ${selectedCategory === value.id ? 'border-bgOrange' : 'border-whitesmoke'} 
                              rounded-full w-14 h-14 xl:w-[4.5rem] xl:h-[4.5rem]`}
                >
                    <Image
                        width={30}
                        height={30}
                        preview={false}
                        src={value.categoryImage}
                        alt="Stationary Icon"
                    />
                </Flex>
                <Typography.Text
                    className={`text-center text-xs md:text-base mt-2 line-clamp-1
                            ${selectedCategory === value.id ? 'text-bgOrange' : 'text-black'} `}
                >
                    {value.categoryName}
                </Typography.Text>
            </Flex>
        ))}
    </Flex>
);
export default Categories;
