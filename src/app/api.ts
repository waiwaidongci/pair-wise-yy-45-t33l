import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { Annotation, Conclusion, Sample } from '../api/types'
import type { ConclusionDraft } from '../features/conclusion'
import type { Role } from '../features/conclusion'

export const samplingApi = createApi({
  reducerPath: 'samplingApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/' }),
  tagTypes: ['Sample', 'Samples'],
  endpoints: (builder) => ({
    getSamples: builder.query<Sample[], void>({
      query: () => 'api/samples',
      providesTags: ['Samples'],
    }),
    getSample: builder.query<Sample, string>({
      query: (id) => `api/samples/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Sample', id }],
    }),
    addAnnotation: builder.mutation<Sample, { sampleId: string; annotation: Omit<Annotation, 'id' | 'author' | 'status'> }>({
      query: ({ sampleId, annotation }) => ({
        url: `api/samples/${sampleId}/annotations`,
        method: 'POST',
        body: annotation,
      }),
      invalidatesTags: (_result, _error, { sampleId }) => [{ type: 'Sample', id: sampleId }],
    }),
    addComment: builder.mutation<Sample, { sampleId: string; content: string }>({
      query: ({ sampleId, content }) => ({
        url: `api/samples/${sampleId}/comments`,
        method: 'POST',
        body: { content },
      }),
      invalidatesTags: (_result, _error, { sampleId }) => [{ type: 'Sample', id: sampleId }],
    }),
    commitConclusion: builder.mutation<
      { sample: Sample; conclusion: Conclusion },
      { sampleId: string; baseVersion: number; role: Role; conclusion: ConclusionDraft }
    >({
      query: ({ sampleId, baseVersion, role, conclusion }) => ({
        url: `api/samples/${sampleId}/conclusions`,
        method: 'POST',
        body: { baseVersion, role, conclusion },
      }),
      invalidatesTags: (_result, _error, { sampleId }) => [{ type: 'Sample', id: sampleId }, 'Samples'],
    }),
  }),
})

export const {
  useGetSamplesQuery,
  useGetSampleQuery,
  useAddAnnotationMutation,
  useAddCommentMutation,
  useCommitConclusionMutation,
} = samplingApi
