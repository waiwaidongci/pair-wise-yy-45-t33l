import { configureStore } from '@reduxjs/toolkit'
import { samplingApi } from './api'
import { developmentReducer } from '../features/developmentSlice'
import { patternReducer, PATTERN_STORAGE_KEY } from '../features/patternSlice'

const persistedKey = 'garment-sampling-draft-v1'

export const store = configureStore({
  reducer: {
    development: developmentReducer,
    pattern: patternReducer,
    [samplingApi.reducerPath]: samplingApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(samplingApi.middleware),
})

store.subscribe(() => {
  localStorage.setItem(persistedKey, JSON.stringify(store.getState().development))
  localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(store.getState().pattern))
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
