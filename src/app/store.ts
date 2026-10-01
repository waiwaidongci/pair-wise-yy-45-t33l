import { configureStore } from '@reduxjs/toolkit'
import { samplingApi } from './api'
import { developmentReducer } from '../features/developmentSlice'
import { SCHEMA_VERSION, V2_KEY } from '../features/migration'

export const store = configureStore({
  reducer: {
    development: developmentReducer,
    [samplingApi.reducerPath]: samplingApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(samplingApi.middleware),
})

store.subscribe(() => {
  const state = store.getState().development
  try {
    localStorage.setItem(
      V2_KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        samples: state.samples,
        selectedId: state.selectedId,
        roundA: state.roundA,
        roundB: state.roundB,
        decisions: state.decisions,
        draftNotes: state.draftNotes,
        locked: state.locked,
        activeRole: state.activeRole,
        drafts: state.drafts,
        committedFingerprints: state.committedFingerprints,
      }),
    )
  } catch {
    // 持久化失败不阻断操作，下次重试。
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
