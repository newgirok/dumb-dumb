// MapLibre 워커를 public/maplibre에 둔다 — 워커는 페이지 번들과 따로 받아야 하고(setWorkerUrl), 옆의 shared 파일을
// 상대 경로로 불러온다. 번들러(Turbopack·webpack)는 shared를 함께 내보내지 않아 두 파일을 그대로 복사한다(npm run dev·build 전에 돈다)
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist')
const dest = path.join(process.cwd(), 'public', 'maplibre')

mkdirSync(dest, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(dest, file))
}
