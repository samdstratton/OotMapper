import type { ArrangeOptions, ArrangeResult } from './arrange'
import type { ArrangeRequest, ArrangeResponse } from './arrange.worker'
import type { BaseMap, Layout } from './types'

export interface ArrangeJob {
  /** Settles when the search finishes. Never settles if the job is cancelled. */
  promise: Promise<ArrangeResult>
  cancel: () => void
}

/** Starts an arrangement search in a Web Worker. */
export function startArrange(baseMap: BaseMap, layout: Layout, options: ArrangeOptions = {}): ArrangeJob {
  const worker = new Worker(new URL('./arrange.worker.ts', import.meta.url), { type: 'module' })
  const promise = new Promise<ArrangeResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ArrangeResponse>) => {
      worker.terminate()
      if (e.data.ok) resolve(e.data.result)
      else reject(new Error(e.data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'The arrange worker failed'))
    }
    const request: ArrangeRequest = { baseMap, layout, options }
    worker.postMessage(request)
  })
  return { promise, cancel: () => worker.terminate() }
}
