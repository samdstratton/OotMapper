// Runs the arrangement search off the main thread so the page stays responsive.
import { arrangeLayout, type ArrangeOptions, type ArrangeResult } from './arrange'
import type { BaseMap, Layout } from './types'

export interface ArrangeRequest {
  baseMap: BaseMap
  layout: Layout
  options: ArrangeOptions
}

export type ArrangeResponse = { ok: true; result: ArrangeResult } | { ok: false; error: string }

self.addEventListener('message', (e: MessageEvent<ArrangeRequest>) => {
  let response: ArrangeResponse
  try {
    const { baseMap, layout, options } = e.data
    response = { ok: true, result: arrangeLayout(baseMap, layout, options) }
  } catch (err) {
    response = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response)
})
