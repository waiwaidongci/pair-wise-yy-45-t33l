import { http, HttpResponse } from 'msw'
import { seedSamples } from './seed'
import type { Conclusion, Role } from './types'
import { applyConclusionToSample, type ConclusionDraft } from '../features/conclusion'

let serverSamples = structuredClone(seedSamples)

export const handlers = [
  http.get('/api/samples', () => HttpResponse.json(serverSamples)),
  http.get('/api/samples/:id', ({ params }) => {
    const sample = serverSamples.find((item) => item.id === params.id)
    return sample ? HttpResponse.json(sample) : new HttpResponse(null, { status: 404 })
  }),
  http.post('/api/samples/:id/annotations', async ({ params, request }) => {
    const body = (await request.json()) as { x: number; y: number; part: string; content: string }
    const sample = serverSamples.find((item) => item.id === params.id)
    if (!sample) return new HttpResponse(null, { status: 404 })
    sample.annotations.push({ id: `AN-${Date.now()}`, author: '当前用户', status: '待处理', ...body })
    return HttpResponse.json(sample, { status: 201 })
  }),
  http.post('/api/samples/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { content: string }
    const sample = serverSamples.find((item) => item.id === params.id)
    if (!sample) return new HttpResponse(null, { status: 404 })
    sample.comments.push({ id: `CM-${Date.now()}`, author: '当前用户', content: body.content, date: '刚刚' })
    return HttpResponse.json(sample, { status: 201 })
  }),
  http.post('/api/samples/:id/conclusions', async ({ params, request }) => {
    const body = (await request.json()) as { baseVersion?: number; role?: Role; conclusion?: ConclusionDraft }
    const sample = serverSamples.find((item) => item.id === params.id)
    if (!sample) return new HttpResponse(null, { status: 404 })

    // 读不到版本：保住原记录，让人重试，绝不覆盖。
    if (typeof body.baseVersion !== 'number' || !Number.isFinite(body.baseVersion) || !body.conclusion) {
      return HttpResponse.json(
        { error: 'version_unreadable', message: '保存缺少版本号，原记录未改动，请重试。' },
        { status: 409 },
      )
    }

    // 乐观锁：先到的成立，后到的返回冲突与当前服务器版本，由界面比对两次保存差异。
    if (sample.version !== body.baseVersion) {
      return HttpResponse.json(
        {
          conflict: true,
          serverVersion: sample.version,
          yourBaseVersion: body.baseVersion,
          current: sample,
          your: body.conclusion,
        },
        { status: 409 },
      )
    }

    const committed: Conclusion = {
      ...body.conclusion,
      id: `CC-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
      version: sample.version + 1,
      committedAt: new Date().toISOString(),
    }
    const updated = applyConclusionToSample(sample, committed)
    const index = serverSamples.findIndex((item) => item.id === sample.id)
    serverSamples[index] = updated
    return HttpResponse.json({ sample: updated, conclusion: committed }, { status: 201 })
  }),
]
