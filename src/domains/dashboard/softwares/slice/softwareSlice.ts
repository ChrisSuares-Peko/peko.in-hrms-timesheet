import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { AnswerMap, IProductCard, IQuestion, IsoftwareCategory } from '../types';

export interface SoftwareCategoryState {
    categoryList: IsoftwareCategory[];
    queryParams: { category: string; product: string; search: string; parentCategorySlug?: '' };
    recommendedProducts: IProductCard[];
    lastViewedWeburl: string;
    rfp: {
        generalQuestions: IQuestion[];
        categoryQuestions: IQuestion[];
        generalAnswers: AnswerMap;
        categoryAnswers: AnswerMap;
        lastFetchedCategory: string;
    };
}

const initialState: SoftwareCategoryState = {
    categoryList: [],
    queryParams: {
        category: '',
        product: '',
        search: '',
        parentCategorySlug: '',
    },
    recommendedProducts: [],
    lastViewedWeburl: '',
    rfp: {
        generalQuestions: [],
        categoryQuestions: [],
        generalAnswers: {},
        categoryAnswers: {},
        lastFetchedCategory: '',
    },
};

const softwareSlice = createSlice({
    name: 'software',
    initialState,
    reducers: {
        setCategoryList: (state, action: PayloadAction<IsoftwareCategory[]>) => {
            state.categoryList = action.payload;
        },
        setQueryParams: (state, action: PayloadAction<Record<string, string>>) => {
            state.queryParams = { ...state.queryParams, ...action.payload };
        },
        setRecommendedProducts: (state, action: PayloadAction<IProductCard[]>) => {
            state.recommendedProducts = action.payload;
        },
        resetSoftwareQueryParams: state => {
            state.queryParams = initialState.queryParams;
        },
        resetSoftwareRecommendedProducts: state => {
            state.recommendedProducts = initialState.recommendedProducts;
        },
        setLastViewedWeburl: (state, action: PayloadAction<string>) => {
            state.lastViewedWeburl = action.payload;
        },
        // ── RFP reducers ──────────────────────────────────────────────────
        setRfpGeneralQuestions: (state, action: PayloadAction<IQuestion[]>) => {
            state.rfp.generalQuestions = action.payload;
        },
        setRfpCategoryQuestions: (state, action: PayloadAction<IQuestion[]>) => {
            state.rfp.categoryQuestions = action.payload;
        },
        setRfpGeneralAnswers: (state, action: PayloadAction<AnswerMap>) => {
            state.rfp.generalAnswers = action.payload;
        },
        setRfpCategoryAnswers: (state, action: PayloadAction<AnswerMap>) => {
            state.rfp.categoryAnswers = action.payload;
        },
        setRfpLastFetchedCategory: (state, action: PayloadAction<string>) => {
            state.rfp.lastFetchedCategory = action.payload;
        },
        resetRfp: state => {
            state.rfp = initialState.rfp;
        },
        resetSoftwareState: () => initialState,
    },
});

export const {
    setCategoryList,
    setQueryParams,
    setRecommendedProducts,
    resetSoftwareQueryParams,
    resetSoftwareRecommendedProducts,
    setLastViewedWeburl,
    resetSoftwareState,
    // ── RFP ──────────────────────────────────────────────────────────────
    setRfpGeneralQuestions,
    setRfpCategoryQuestions,
    setRfpGeneralAnswers,
    setRfpCategoryAnswers,
    setRfpLastFetchedCategory,
    resetRfp,
} = softwareSlice.actions;

export default softwareSlice.reducer;
