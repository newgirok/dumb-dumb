import type { StyleSpecification } from 'mapbox-gl'

/**
 * 펼침 지도 스타일 — Mapbox Streets v8 벡터 타일을 게임 화풍으로 칠한다.
 *
 * 색은 씬에서 가져왔다: 종이(크림), 잔디(민트), 나무(청록), 바다(옥색), 길(밝은 포장 + 모래색 인도).
 * 셰이딩은 두 가지 — 지형 음영(hillshade)을 따뜻한 갈색으로 얕게 깔고, 건물에는 HUD 버튼과 같은
 * 오른쪽 아래 하드 그림자(#716c66)를 붙인다. 숲·물은 손으로 그린 듯한 무늬(`PATTERNS`)로 채운다.
 * 글씨는 지도 옵션 localFontFamily로 Stylish를 쓴다(text-font는 형식상 값).
 */

export const PAPER = '#f2e6c8'

const INK = '#5d5a57'
const INK_SOFT = '#7a6d60'
const HALO = '#fbf3df'
const NAME = ['coalesce', ['get', 'name_ko'], ['get', 'name']]
const FONT = ['Open Sans Regular', 'Arial Unicode MS Regular']

/** 줌에 따른 선 굵기 — [줌, 굵기] 쌍 */
const width = (...stops: number[]) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops]

const CAR_ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'street_limited', 'service']
const MAJOR = ['motorway', 'trunk', 'primary']
const MID = ['secondary', 'tertiary']

/** 등급별 굵기 표의 줌 */
const ZOOMS = [12, 14, 16, 18]

/**
 * 줌마다 등급별 굵기 — 스타일 규칙상 줌 보간이 맨 바깥에 와야 해서, 줌 단계마다 등급 match를 둔다.
 * pick은 줌 단계 번호를 받아 [등급 목록, 굵기] 쌍들과 나머지 굵기를 돌려준다.
 */
function widthByClass(pick: (i: number) => [...(string | string[] | number)[]]) {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...ZOOMS.flatMap((zoom, i) => [zoom, ['match', ['get', 'class'], ...pick(i)]])]
}

const ROAD = { major: [2.4, 5, 12, 30], mid: [1.6, 3.4, 9, 24], service: [0.3, 0.6, 2.2, 7], street: [0.6, 1.6, 5.5, 16] }
/** 차도 가장자리(모래색 인도)가 차도보다 두꺼운 만큼 */
const CASING = [1, 1.8, 2.6, 4]
const roadWidth = (extra = [0, 0, 0, 0]) =>
  widthByClass((i) => [MAJOR, ROAD.major[i] + extra[i], MID, ROAD.mid[i] + extra[i], 'service', ROAD.service[i] + extra[i], ROAD.street[i] + extra[i]])

export const PAPER_STYLE = {
  version: 8,
  name: 'dumb-dumb-paper',
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  sources: {
    streets: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' },
    dem: { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 },
  },
  layers: [
    { id: 'paper', type: 'background', paint: { 'background-color': PAPER } },
    {
      id: 'landuse-town',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'commercial_area', 'industrial', 'facility', 'parking'], true, false],
      paint: { 'fill-color': '#ecdcbc', 'fill-opacity': 0.7 },
    },
    {
      id: 'landuse-care',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['school', 'hospital'], true, false],
      paint: { 'fill-color': '#f0d6cc', 'fill-opacity': 0.8 },
    },
    {
      id: 'landuse-sand',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['sand', 'rock'], true, false],
      paint: { 'fill-color': '#ead19f' },
    },
    {
      id: 'landuse-grass',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['park', 'grass', 'pitch', 'cemetery', 'agriculture'], true, false],
      paint: { 'fill-color': '#b7dba8', 'fill-outline-color': '#94c58c' },
    },
    {
      id: 'landuse-grass-tufts',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['park', 'grass', 'cemetery'], true, false],
      paint: { 'fill-pattern': 'pm-tufts', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 0.8] },
    },
    {
      id: 'landuse-wood',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['wood', 'scrub'], true, false],
      paint: { 'fill-color': '#8fc39d' },
    },
    {
      id: 'landuse-wood-trees',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['wood', 'scrub'], true, false],
      // 무늬는 화면 크기 그대로라 멀리서 보면 빽빽하다 — 물러날수록 옅게
      paint: { 'fill-pattern': 'pm-trees', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 15, 1] },
    },
    {
      id: 'national-park',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse_overlay',
      filter: ['==', ['get', 'class'], 'national_park'],
      paint: { 'fill-color': '#9fcb9f', 'fill-opacity': 0.35 },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.32,
        'hillshade-shadow-color': '#8b7462',
        'hillshade-highlight-color': '#fff7e2',
        'hillshade-accent-color': '#a58d78',
        'hillshade-illumination-direction': 315,
      },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'streets',
      'source-layer': 'water',
      paint: { 'fill-color': '#9fd3d8' },
    },
    {
      id: 'water-waves',
      type: 'fill',
      source: 'streets',
      'source-layer': 'water',
      paint: { 'fill-pattern': 'pm-waves', 'fill-opacity': 0.9 },
    },
    {
      id: 'water-edge',
      type: 'line',
      source: 'streets',
      'source-layer': 'water',
      paint: { 'line-color': '#78bcc6', 'line-width': width(12, 0.6, 16, 1.6) },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'streets',
      'source-layer': 'waterway',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#8dcbd2',
        'line-width': widthByClass((i) => [['river', 'canal'], [1.5, 4, 8, 20][i], [0.6, 1.2, 2.4, 5][i]]),
      },
    },
    {
      id: 'building-shadow',
      type: 'fill',
      source: 'streets',
      'source-layer': 'building',
      minzoom: 14.5,
      filter: ['!=', ['get', 'underground'], 'true'],
      paint: {
        'fill-color': '#716c66',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, 0.32],
        'fill-translate': ['interpolate', ['linear'], ['zoom'], 15, ['literal', [1, 1]], 18, ['literal', [3, 3]]],
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'streets',
      'source-layer': 'building',
      minzoom: 14,
      filter: ['!=', ['get', 'underground'], 'true'],
      paint: {
        'fill-color': '#ead3c1',
        'fill-outline-color': '#c29f8b',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.8, 1],
      },
    },
    {
      id: 'path',
      type: 'line',
      source: 'streets',
      'source-layer': 'road',
      minzoom: 14,
      filter: ['all', ['match', ['get', 'class'], ['path', 'pedestrian', 'track'], true, false], ['!=', ['get', 'structure'], 'tunnel']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#b99870',
        'line-width': width(14, 0.8, 16, 1.6, 18, 3),
        'line-dasharray': [1.4, 1.6],
      },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'streets',
      'source-layer': 'road',
      filter: ['all', ['match', ['get', 'class'], ['major_rail', 'minor_rail'], true, false], ['!=', ['get', 'structure'], 'tunnel']],
      paint: { 'line-color': '#a99c90', 'line-width': width(12, 1, 16, 2.4), 'line-dasharray': [3, 2] },
    },
    {
      // 차도 가장자리 — 씬의 모래색 인도처럼 두른다
      id: 'road-casing',
      type: 'line',
      source: 'streets',
      'source-layer': 'road',
      filter: ['all', ['match', ['get', 'class'], CAR_ROADS, true, false], ['!=', ['get', 'structure'], 'tunnel']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], MAJOR, '#d7ab6a', '#d8c29a'],
        'line-width': roadWidth(CASING),
      },
    },
    {
      id: 'road',
      type: 'line',
      source: 'streets',
      'source-layer': 'road',
      filter: ['all', ['match', ['get', 'class'], CAR_ROADS, true, false], ['!=', ['get', 'structure'], 'tunnel']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], MAJOR, '#ffe3a3', MID, '#fff1cc', '#fbf6ea'],
        'line-width': roadWidth(),
      },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'streets',
      'source-layer': 'road',
      minzoom: 14,
      filter: ['all', ['has', 'name'], ['match', ['get', 'class'], [...CAR_ROADS, 'pedestrian'], true, false]],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11, 18, 15],
        'text-max-angle': 30,
        'symbol-spacing': 320,
      },
      paint: { 'text-color': INK_SOFT, 'text-halo-color': HALO, 'text-halo-width': 1.6 },
    },
    // 물 이름 — 강은 선을 따라, 호수·바다는 점에 쓴다(symbol-placement는 피처마다 못 바꿔 둘로 나눈다)
    ...(['point', 'line'] as const).map((placement) => ({
      id: `water-label-${placement}`,
      type: 'symbol',
      source: 'streets',
      'source-layer': 'natural_label',
      filter: [
        'all',
        ['match', ['get', 'class'], ['water', 'river', 'stream', 'canal', 'reservoir', 'bay', 'sea', 'ocean', 'water_feature'], true, false],
        ['match', ['geometry-type'], ['LineString', 'MultiLineString'], placement === 'line', placement === 'point'],
      ],
      layout: {
        'symbol-placement': placement,
        'text-field': NAME,
        'text-font': FONT,
        'text-size': 14,
        'text-letter-spacing': 0.15,
      },
      paint: { 'text-color': '#3f8791', 'text-halo-color': 'rgba(251, 243, 223, 0.7)', 'text-halo-width': 1.2 },
    })),
    {
      id: 'park-label',
      type: 'symbol',
      source: 'streets',
      'source-layer': 'poi_label',
      minzoom: 14,
      filter: ['all', ['==', ['get', 'class'], 'park_like'], ['<=', ['get', 'filterrank'], 3]],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 13, 'text-max-width': 7 },
      paint: { 'text-color': '#4c7b56', 'text-halo-color': HALO, 'text-halo-width': 1.6 },
    },
    {
      id: 'station-label',
      type: 'symbol',
      source: 'streets',
      'source-layer': 'transit_stop_label',
      minzoom: 13,
      filter: ['all', ['match', ['get', 'mode'], ['metro_rail', 'rail', 'light_rail'], true, false], ['==', ['get', 'stop_type'], 'station']],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 13, 'text-max-width': 7 },
      paint: { 'text-color': '#56709a', 'text-halo-color': HALO, 'text-halo-width': 1.8 },
    },
    {
      id: 'poi-label',
      type: 'symbol',
      source: 'streets',
      'source-layer': 'poi_label',
      minzoom: 16,
      filter: ['all', ['match', ['get', 'class'], ['education', 'medical', 'public_facilities', 'landmark', 'historic', 'religion'], true, false], ['<=', ['get', 'filterrank'], 2]],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 12, 'text-max-width': 7 },
      paint: { 'text-color': INK_SOFT, 'text-halo-color': HALO, 'text-halo-width': 1.5 },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'streets',
      'source-layer': 'place_label',
      filter: ['match', ['get', 'class'], ['settlement', 'settlement_subdivision'], true, false],
      layout: {
        'text-field': NAME,
        'text-font': FONT,
        'text-size': ['match', ['get', 'class'], 'settlement', 22, 17],
        'text-letter-spacing': 0.08,
        'text-max-width': 8,
      },
      paint: { 'text-color': INK, 'text-halo-color': HALO, 'text-halo-width': 2.2 },
    },
  ],
} as unknown as StyleSpecification

/** 무늬 한 장 — 캔버스에 그려 Mapbox 이미지로 넣는다(pixelRatio 2) */
function draw(size: number, paint: (ctx: CanvasRenderingContext2D) => void): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  paint(ctx)
  return ctx.getImageData(0, 0, size, size)
}

/** 스타일이 쓰는 무늬 — 없을 때(styleimagemissing) 그 자리에서 그려 넣는다 */
export const PATTERNS: Record<string, () => ImageData> = {
  // 숲 — 동그란 나무 머리. 오른쪽 아래가 어둡고 왼쪽 위가 밝은 두 톤(씬 나무의 램프 셰이딩)
  'pm-trees': () =>
    draw(64, (ctx) => {
      const tree = (x: number, y: number, r: number) => {
        ctx.fillStyle = 'rgba(46, 90, 80, 0.45)'
        ctx.beginPath()
        ctx.arc(x + r * 0.35, y + r * 0.35, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#3f8479'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#5aa08f'
        ctx.beginPath()
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2)
        ctx.fill()
      }
      tree(14, 16, 8)
      tree(44, 12, 6)
      tree(34, 42, 9)
      tree(8, 50, 5)
      tree(58, 56, 5)
    }),
  // 잔디 — 작은 풀포기
  'pm-tufts': () =>
    draw(48, (ctx) => {
      ctx.strokeStyle = '#86bb7d'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      const tuft = (x: number, y: number) => {
        ctx.beginPath()
        ctx.moveTo(x - 4, y - 5)
        ctx.lineTo(x - 1, y)
        ctx.lineTo(x, y - 7)
        ctx.lineTo(x + 1, y)
        ctx.lineTo(x + 4, y - 5)
        ctx.stroke()
      }
      tuft(10, 14)
      tuft(34, 26)
      tuft(18, 42)
    }),
  // 물 — 짧은 물결
  'pm-waves': () =>
    draw(64, (ctx) => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      const wave = (x: number, y: number) => {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + 4, y - 4, x + 8, y)
        ctx.quadraticCurveTo(x + 12, y + 4, x + 16, y)
        ctx.stroke()
      }
      wave(6, 16)
      wave(38, 30)
      wave(14, 50)
    }),
}
