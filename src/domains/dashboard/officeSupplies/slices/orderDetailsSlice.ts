import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { OrderDetailsSlice } from '../types/orderHistory';

const initialState: OrderDetailsSlice = {
    orderDetails: null,
    orderedProducts: [],
    trackingDetails: null,
    refresh: false,
};

export const orderDetailsSlice = createSlice({
    name: 'orderDetails',
    initialState,
    reducers: {
        setOrderDetails: (state, action: PayloadAction<Partial<OrderDetailsSlice>>) => {
            state = { ...state, ...action.payload };
            return state;
        },
    },
});

export const { setOrderDetails } = orderDetailsSlice.actions;

export default orderDetailsSlice.reducer;
