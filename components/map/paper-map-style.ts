import type { MapOptions } from 'maplibre-gl'

/**
 * 펼침 지도 스타일 — OpenStreetMap 벡터 타일(OpenFreeMap, OpenMapTiles 스키마)을 게임 화풍으로 칠한다.
 *
 * 색은 씬에서 가져왔다: 종이(크림), 잔디(민트), 나무(청록), 바다(옥색), 길(밝은 포장 + 모래색 인도).
 * 셰이딩은 두 가지 — 지형 음영(hillshade, AWS Terrain Tiles 높이)을 따뜻한 갈색으로 얕게 깔고, 건물에는 HUD 버튼과 같은
 * 오른쪽 아래 하드 그림자(#716c66)를 붙인다. 숲·물은 손으로 그린 듯한 무늬(`PATTERNS`)로 채운다.
 * 한글은 지도 옵션 localIdeographFontFamily로 Stylish를 쓰고, 숫자·로마자는 text-font(OpenFreeMap 글꼴)로 그린다.
 */

/** 지도 스타일 JSON 형식 — maplibre-gl이 따로 내보내지 않아 지도 옵션에서 꺼낸다 */
type StyleSpecification = Exclude<MapOptions['style'], string | undefined>

export const PAPER = '#f2e6c8'

const INK = '#5d5a57'
const INK_SOFT = '#7a6d60'
const HALO = '#fbf3df'
const NAME = ['coalesce', ['get', 'name:ko'], ['get', 'name']]
const FONT = ['Noto Sans Regular']
/** 땅 밑(지하차도·복개천)은 그리지 않는다 */
const NOT_TUNNEL = ['!=', ['get', 'brunnel'], 'tunnel']
/** 숲 — OpenMapTiles는 덤불(scrub)을 잔디로 묶지만 숲처럼 칠한다 */
const WOOD = ['any', ['==', ['get', 'class'], 'wood'], ['==', ['get', 'subclass'], 'scrub']]

/** 줌에 따른 선 굵기 — [줌, 굵기] 쌍 */
const width = (...stops: number[]) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops]

const CAR_ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']
const MAJOR = ['motorway', 'trunk', 'primary']
const MID = ['secondary', 'tertiary']
/** 마을 이름(시·읍·면·리)과 그 안의 이름(구·동·동네) */
const SETTLEMENTS = ['city', 'town', 'village', 'hamlet']
const SUBDIVISIONS = ['borough', 'suburb', 'quarter', 'neighbourhood']

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
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    // 출처 표기(OpenFreeMap © OpenMapTiles Data from OpenStreetMap)는 TileJSON이 알려 준다
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    // 높이 타일(Terrarium PNG) — 한국은 SRTM·GMTED2010(30m급)이라 z14보다 깊이는 늘려 쓴다
    dem: {
      type: 'raster-dem',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 14,
      attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Terrain Tiles (USGS)</a>',
    },
  },
  layers: [
    { id: 'paper', type: 'background', paint: { 'background-color': PAPER } },
    {
      id: 'landuse-town',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'retail', 'industrial', 'garages', 'railway'], true, false],
      paint: { 'fill-color': '#ecdcbc', 'fill-opacity': 0.7 },
    },
    {
      id: 'landuse-care',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['school', 'kindergarten', 'college', 'university', 'hospital'], true, false],
      paint: { 'fill-color': '#f0d6cc', 'fill-opacity': 0.8 },
    },
    {
      id: 'landcover-sand',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['sand', 'rock'], true, false],
      paint: { 'fill-color': '#ead19f' },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'farmland'], true, false],
      paint: { 'fill-color': '#b7dba8', 'fill-outline-color': '#94c58c' },
    },
    {
      // 운동장·묘지는 landuse에 있다 — 잔디와 같은 색
      id: 'landuse-grass',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['pitch', 'cemetery'], true, false],
      paint: { 'fill-color': '#b7dba8', 'fill-outline-color': '#94c58c' },
    },
    {
      id: 'landcover-grass-tufts',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'grass'],
      paint: { 'fill-pattern': 'pm-tufts', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 0.8] },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: WOOD,
      paint: { 'fill-color': '#8fc39d' },
    },
    {
      id: 'landcover-wood-trees',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: WOOD,
      // 무늬는 화면 크기 그대로라 멀리서 보면 빽빽하다 — 물러날수록 옅게
      paint: { 'fill-pattern': 'pm-trees', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 15, 1] },
    },
    {
      id: 'national-park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      filter: ['match', ['get', 'class'], ['national_park', 'nature_reserve'], true, false],
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
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: NOT_TUNNEL,
      paint: { 'fill-color': '#9fd3d8' },
    },
    {
      id: 'water-waves',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: NOT_TUNNEL,
      paint: { 'fill-pattern': 'pm-waves', 'fill-opacity': 0.9 },
    },
    {
      id: 'water-edge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: NOT_TUNNEL,
      paint: { 'line-color': '#78bcc6', 'line-width': width(12, 0.6, 16, 1.6) },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      filter: NOT_TUNNEL,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#8dcbd2',
        'line-width': widthByClass((i) => [['river', 'canal'], [1.5, 4, 8, 20][i], [0.6, 1.2, 2.4, 5][i]]),
      },
    },
    {
      id: 'building-shadow',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14.5,
      paint: {
        'fill-color': '#716c66',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, 0.32],
        'fill-translate': ['interpolate', ['linear'], ['zoom'], 15, ['literal', [1, 1]], 18, ['literal', [3, 3]]],
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-color': '#ead3c1',
        'fill-outline-color': '#c29f8b',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.8, 1],
      },
    },
    {
      // 승강장·실내 통로는 땅 위 길이 아니고, 광장(면)은 테두리를 두르지 않는다
      id: 'path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 14,
      filter: [
        'all',
        ['match', ['get', 'class'], ['path', 'track'], true, false],
        ['match', ['get', 'subclass'], ['platform', 'corridor'], false, true],
        ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        NOT_TUNNEL,
      ],
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
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['all', ['match', ['get', 'class'], ['rail', 'transit'], true, false], NOT_TUNNEL],
      paint: { 'line-color': '#a99c90', 'line-width': width(12, 1, 16, 2.4), 'line-dasharray': [3, 2] },
    },
    {
      // 차도 가장자리 — 씬의 모래색 인도처럼 두른다
      id: 'road-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['all', ['match', ['get', 'class'], CAR_ROADS, true, false], NOT_TUNNEL],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], MAJOR, '#d7ab6a', '#d8c29a'],
        'line-width': roadWidth(CASING),
      },
    },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['all', ['match', ['get', 'class'], CAR_ROADS, true, false], NOT_TUNNEL],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], MAJOR, '#ffe3a3', MID, '#fff1cc', '#fbf6ea'],
        'line-width': roadWidth(),
      },
    },
    {
      // 차도와 보행자 거리(광장 길)의 이름
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 14,
      filter: ['all', ['has', 'name'], ['any', ['match', ['get', 'class'], CAR_ROADS, true, false], ['==', ['get', 'subclass'], 'pedestrian']]],
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
    // 물 이름 — 호수·연못(water_name 점)은 그 자리에, 강·개천(waterway 선)은 물길을 따라 쓴다. 큰 호수 가운데 선은 쓰지 않는다
    ...(
      [
        ['point', 'water_name', ['==', ['geometry-type'], 'Point']],
        ['line', 'waterway', ['all', ['has', 'name'], NOT_TUNNEL]],
      ] as const
    ).map(([placement, layer, filter]) => ({
      id: `water-label-${placement}`,
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': layer,
      filter,
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
      // rank는 화면 칸(약 100px)마다 매긴 중요도 순서다 — 칸마다 앞쪽 몇 개만 쓴다
      id: 'park-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 14,
      filter: ['all', ['==', ['get', 'class'], 'park'], ['<=', ['get', 'rank'], 3]],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 13, 'text-max-width': 7 },
      paint: { 'text-color': '#4c7b56', 'text-halo-color': HALO, 'text-halo-width': 1.6 },
    },
    {
      id: 'station-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 13,
      filter: ['all', ['==', ['get', 'class'], 'railway'], ['match', ['get', 'subclass'], ['station', 'subway', 'halt'], true, false]],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 13, 'text-max-width': 7 },
      paint: { 'text-color': '#56709a', 'text-halo-color': HALO, 'text-halo-width': 1.8 },
    },
    {
      id: 'poi-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 16,
      filter: [
        'all',
        ['match', ['get', 'class'], ['school', 'college', 'hospital', 'town_hall', 'library', 'police', 'fire_station', 'castle', 'monument', 'museum', 'place_of_worship'], true, false],
        ['<=', ['get', 'rank'], 2],
      ],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 12, 'text-max-width': 7 },
      paint: { 'text-color': INK_SOFT, 'text-halo-color': HALO, 'text-halo-width': 1.5 },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['match', ['get', 'class'], [...SETTLEMENTS, ...SUBDIVISIONS], true, false],
      layout: {
        'text-field': NAME,
        'text-font': FONT,
        'text-size': ['match', ['get', 'class'], SETTLEMENTS, 22, 17],
        'text-letter-spacing': 0.08,
        'text-max-width': 8,
      },
      paint: { 'text-color': INK, 'text-halo-color': HALO, 'text-halo-width': 2.2 },
    },
  ],
} as unknown as StyleSpecification

/** 무늬 한 장 — 캔버스에 그려 지도 이미지로 넣는다(pixelRatio 2) */
function draw(size: number, paint: (ctx: CanvasRenderingContext2D) => void): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  paint(ctx)
  return ctx.getImageData(0, 0, size, size)
}

/** 스타일이 쓰는 무늬 — 처음 필요할 때(setMissingStyleImageResolver) 그 자리에서 그려 넣는다 */
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
