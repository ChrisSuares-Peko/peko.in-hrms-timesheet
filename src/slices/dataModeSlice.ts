// PROTOTYPE-SETUP: which dataset the prototype mock layer (src/prototype/mocks) answers with.
// 'dummy' = realistic demo data, 'empty' = valid empty shapes (empty arrays, zero totals — never null).
// Persisted (see store.ts whitelist) so the choice survives a reload.
import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type DataMode = 'dummy' | 'empty';

interface DataModeState {
    mode: DataMode;
}

const initialState: DataModeState = {
    mode: 'dummy',
};

export const dataModeSlice = createSlice({
    name: 'dataMode',
    initialState,
    reducers: {
        setDataMode: (state, action: PayloadAction<DataMode>) => {
            state.mode = action.payload;
        },
    },
});

export const { setDataMode } = dataModeSlice.actions;

export default dataModeSlice.reducer;
