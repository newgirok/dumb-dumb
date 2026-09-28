// 내 주변 바닥 워커 — 타일 받기·해석과 구역 마스크 그리기를 메인 스레드 밖에서 한다.
// 메인 스레드는 돌려받은 픽셀로 텍스처만 만든다(멈칫하지 않게).

import { createLocalFrame } from '@/lib/geo/localFrame'
import { createGroundSource, type GroundSource } from './groundSource'

export type GroundWorkerRequest = { type: 'init'; lng0: number; lat0: number } | { type: 'build'; id: number; cx: number; cz: number }

export type GroundWorkerResponse =
  | { id: number; masks: Uint8Array<ArrayBuffer>; marks: Uint8Array<ArrayBuffer> }
  | { id: number; error: string }

let source: GroundSource | null = null

self.onmessage = async (event: MessageEvent<GroundWorkerRequest>) => {
  const message = event.data
  if (message.type === 'init') {
    const canvas = new OffscreenCanvas(1, 1)
    source = createGroundSource(createLocalFrame(message.lng0, message.lat0), canvas.getContext('2d', { willReadFrequently: true })!)
    return
  }
  try {
    const { masks, marks } = await source!.build(message.cx, message.cz)
    const response: GroundWorkerResponse = { id: message.id, masks, marks }
    self.postMessage(response, { transfer: [masks.buffer, marks.buffer] })
  } catch (error) {
    const response: GroundWorkerResponse = { id: message.id, error: String(error) }
    self.postMessage(response)
  }
}
