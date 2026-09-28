'use client'

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { PAPER, PAPER_STYLE, PATTERNS } from './paperMapStyle'
import { formatAccuracy, isGpsBlocked, useGpsSnapshot, type GpsSnapshot, type GpsTracker } from '@/lib/geo/gps'
import { detectGpsEnv, gpsNote, type GpsEnv } from '@/lib/geo/gpsMessages'
import { LoaderSpinner } from '@/components/transition/Loader'
import GpsSteps from './GpsSteps'

/** 씬이 매 프레임 채워 주는 캐릭터 위치와 화면 방향(북쪽 기준 시계방향 도) */
export interface MapTrack {
  lng: number
  lat: number
  bearing: number
}

/** 지도를 만들 때 넣는 형식상 중심 — 위치를 받기 전에는 지도를 가려 두므로 보이지 않는다 */
const INITIAL_CENTER: [number, number] = [127.0, 37.55]
const OPEN_ZOOM = 16
const MIN_ZOOM = 11
const MAX_ZOOM = 18.5
/** 종이 여백(px) — 지도는 이만큼 안쪽에 그린다 */
const MARGIN = 10
/**
 * 종이 폭(px)에 따라 접는 횟수를 줄인다 — 넓으면 3단(두 번 접힘), 중간이면 반(한 번 접힘), 좁으면 접지 않고
 * 바로 펼친 모양으로 나타난다. 접는 선은 늘 세로(옆으로 펼침)다.
 */
const TRIFOLD_MIN_PX = 720
const BIFOLD_MIN_PX = 440
/**
 * 펼치는 데 걸리는 시간(ms) — 3단·반·바로 펼침. 종이가 떠오른 뒤 표지가 잠깐 머물고 날개가 천천히 펼쳐져,
 * 표지와 접힌 모양을 볼 수 있다. 접을 때는 FOLD_RATE 배속으로 거꾸로 돈다
 */
const TRIFOLD_MS = 2600
const BIFOLD_MS = 2000
const SPREAD_MS = 700
const FOLD_RATE = 2
/** 접힌 종이가 떠오르는 구간(전체 길이 대비) — 이 뒤로 날개가 펼쳐지기 전까지 표지가 머문다 */
const LIFT_TO = 0.18
/** 3단 — 한 장면 안의 순서(전체 길이 대비). 앞 날개(왼쪽)가 먼저, 뒤 날개(오른쪽)가 조금 겹쳐 펼쳐진다 */
const A_FROM = 0.36
const A_TO = 0.66
const B_FROM = 0.56
const B_TO = 0.86
/** 반 접기 — 오른쪽 반이 펼쳐지는 구간 */
const HALF_FROM = 0.4
const HALF_TO = 0.82
const STEP = 0.0005
const FLIP_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
/** 펼칠 때 대략적인 위치면 원 전체가 보이게 물러난다(짧은 변의 이 비율) */
const COARSE_FIT = 0.8

type Phase = 'closed' | 'opening' | 'open' | 'closing'
/** 펼친 종이의 면 수 — 3단·반·한 장(접지 않음) */
type Panels = 1 | 2 | 3

/** 면 수별 날개 — 종이 가로 구간(0~1)과 겉면에 그릴 것. 맨 위에 접혀 있는 날개가 표지다 */
const FLAPS: Record<Panels, { key: 'a' | 'b'; span: [number, number]; cover: 'title' | 'legend' }[]> = {
  3: [
    { key: 'a', span: [0, 1 / 3], cover: 'title' },
    { key: 'b', span: [2 / 3, 1], cover: 'legend' },
  ],
  2: [{ key: 'b', span: [0.5, 1], cover: 'title' }],
  1: [],
}

const CSS = `
  .pm-root { position: absolute; inset: 0; z-index: 40; visibility: hidden; }
  .pm-root:focus { outline: none; }
  .pm-backdrop { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(52, 40, 28, 0.36), rgba(52, 40, 28, 0.7)); opacity: 0; }
  .pm-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; perspective: 1800px; pointer-events: none; }
  .pm-sheet { position: relative; width: min(92vw, 1100px); height: min(82vh, 720px); transform-style: preserve-3d; }
  @media (orientation: portrait) { .pm-sheet { width: 94vw; height: min(80vh, 780px); } }
  .pm-shadow { position: absolute; inset: 0; transform: translate(5px, 5px); background: rgba(113, 108, 102, 0.9); border-radius: 4px; }
  .pm-live { position: absolute; inset: 0; border-radius: 4px; background: ${PAPER}; overflow: hidden; }
  .pm-mapbox { position: absolute; inset: ${MARGIN}px; border-radius: 2px; overflow: hidden; background: ${PAPER}; }
  .pm-grain { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: 0.5;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.47 0 0 0 0 0.39 0 0 0 0 0.3 0 0 0 0.32 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    box-shadow: inset 0 0 70px rgba(122, 94, 62, 0.3); }
  .pm-creases { position: absolute; inset: 0; pointer-events: none; }
  .pm-creases.p3 { background:
    linear-gradient(90deg, transparent calc(33.333% - 7px), rgba(113, 108, 102, 0.2) calc(33.333% - 1px), rgba(255, 251, 238, 0.55) calc(33.333% + 1px), transparent calc(33.333% + 7px)),
    linear-gradient(90deg, transparent calc(66.667% - 7px), rgba(113, 108, 102, 0.2) calc(66.667% - 1px), rgba(255, 251, 238, 0.55) calc(66.667% + 1px), transparent calc(66.667% + 7px)); }
  .pm-creases.p2 { background:
    linear-gradient(90deg, transparent calc(50% - 7px), rgba(113, 108, 102, 0.2) calc(50% - 1px), rgba(255, 251, 238, 0.55) calc(50% + 1px), transparent calc(50% + 7px)); }
  .pm-flap { position: absolute; top: 0; height: 100%; transform-style: preserve-3d; pointer-events: none; visibility: hidden; }
  .pm-flap.p3.a { left: 0; width: calc(100% / 3); transform-origin: 100% 50%; }
  .pm-flap.p3.b { left: calc(200% / 3); width: calc(100% / 3); transform-origin: 0% 50%; }
  .pm-flap.p2.b { left: 50%; width: 50%; transform-origin: 0% 50%; }
  .pm-face { position: absolute; inset: 0; overflow: hidden; background: ${PAPER}; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .pm-cover { transform: rotateY(180deg); }
  .pm-mirror { position: absolute; }
  .pm-shade { position: absolute; inset: 0; background: #3b2f25; opacity: 0; pointer-events: none; }
  .pm-cover-art { position: absolute; inset: 14px; border: 2px solid rgba(113, 108, 102, 0.55); border-radius: 3px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px; color: #5d5a57; text-align: center; }
  .pm-cover-art b { font-family: Stylish, sans-serif; font-weight: 400; font-size: 30px; line-height: 1.05; word-break: keep-all; }
  .pm-cover-art small { font-family: Stylish, sans-serif; font-size: 15px; color: #8d8981; letter-spacing: 0.3em; }
  .pm-cover-band { position: absolute; left: 0; right: 0; top: 0; height: 22%; background: #a9d4a0; border-bottom: 2px solid rgba(113, 108, 102, 0.45); }
  .pm-flap.p3.b .pm-cover-art { border-style: dashed; }
  .pm-legend { display: grid; grid-template-columns: auto auto; gap: 6px 10px; align-items: center; font-family: Stylish, sans-serif; font-size: 15px; color: #7a6d60; }
  .pm-legend i { display: block; width: 22px; height: 10px; border-radius: 2px; }

  .pm-ui { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
  .pm-root[data-phase='open'] .pm-ui :is(.pm-btn, .pm-note) { pointer-events: auto; }
  .pm-root[data-phase='open'] .pm-live { pointer-events: auto; }
  .pm-live { pointer-events: none; }
  .pm-mapbox .mapboxgl-marker, .pm-mapbox .mapboxgl-control-container { opacity: 0; transition: opacity 0.25s ease-out; }
  .pm-root[data-phase='open'] .pm-mapbox .mapboxgl-marker, .pm-root[data-phase='open'] .pm-mapbox .mapboxgl-control-container { opacity: 1; }
  .pm-mapbox .mapboxgl-ctrl-scale { background: rgba(251, 243, 223, 0.85); border-color: #716c66; color: #5d5a57; font-family: Stylish, sans-serif; font-size: 12px; }
  .pm-mapbox .mapboxgl-ctrl-attrib { background: rgba(251, 243, 223, 0.8); }
  .pm-mapbox .mapboxgl-canvas { transition: filter 0.6s ease-out; }
  .pm-root[data-off='true'] .pm-mapbox .mapboxgl-canvas { filter: grayscale(0.55) sepia(0.25) brightness(1.03); }
  /* 어디를 보여 줄지 모르면(위치 없음) 지도를 가리고 빈 종이만 둔다 — 엉뚱한 동네를 보여 주지 않는다 */
  .pm-mapbox .mapboxgl-canvas-container { transition: opacity 0.5s ease-out; }
  .pm-root[data-nowhere='true'] .pm-mapbox .mapboxgl-canvas-container,
  .pm-root[data-nowhere='true'] .pm-mapbox .mapboxgl-control-container { opacity: 0; }
  .pm-blank { position: absolute; inset: 10px; pointer-events: none; opacity: 0; transition: opacity 0.5s ease-out;
    background-image: linear-gradient(rgba(113, 108, 102, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(113, 108, 102, 0.07) 1px, transparent 1px);
    background-size: 48px 48px; background-position: center; }
  .pm-root[data-nowhere='true'] .pm-blank { opacity: 1; }

  .pm-tag { position: absolute; left: 22px; top: 20px; padding: 6px 14px 5px; background: #f9efdc; border-radius: 4px; box-shadow: 2px 2px 0 0 #716c66;
    transform: rotate(-2deg); font-family: Stylish, sans-serif; font-size: 22px; line-height: 1.1; color: #5d5a57; }
  .pm-btn { position: absolute; width: 34px; height: 34px; border-radius: 5px; background: #f9efdc; box-shadow: 2px 2px 0 0 #716c66; transform: rotate(10deg);
    display: flex; align-items: center; justify-content: center; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s cubic-bezier(0.33, 1, 0.68, 1), box-shadow 0.15s cubic-bezier(0.33, 1, 0.68, 1); }
  .pm-btn > * { transform: rotate(-10deg); pointer-events: none; }
  @media (hover: hover) { .pm-btn:hover { transform: rotate(10deg) scale(1.1); } }
  .pm-btn:active { transform: translate(2px, 2px) rotate(10deg) scale(1.1); box-shadow: 0 0 0 0 transparent; }
  .pm-btn:focus-visible { outline: 3px solid #5d5a57; outline-offset: 4px; }
  .pm-close { right: 22px; top: 20px; }
  /* 손가락으로 누르는 화면은 버튼을 키운다 */
  @media (pointer: coarse) { .pm-btn { width: 40px; height: 40px; } }
  .pm-locate { right: 24px; bottom: 44px; }
  .pm-north { position: absolute; right: 24px; top: 70px; width: 34px; height: 44px; pointer-events: none; }

  /* 가운데 맞춤은 좌우 0 + margin auto — left: 50%로 맞추면 쓸 수 있는 폭이 종이 절반으로 줄어 좁은 화면에서 꺾인다 */
  .pm-note { position: absolute; left: 0; right: 0; top: 18px; margin: 0 auto; width: fit-content; max-width: min(440px, calc(100% - 150px));
    padding: 11px 16px 10px 44px; background: #fbf4e2; border-radius: 4px; box-shadow: 2px 2px 0 0 rgba(113, 108, 102, 0.85); transform: rotate(-1deg); color: #5d5a57; }
  .pm-note::before { content: ''; position: absolute; left: 50%; top: -9px; width: 64px; height: 18px; transform: translateX(-50%) rotate(2deg);
    background: rgba(214, 196, 158, 0.75); box-shadow: 0 1px 0 rgba(113, 108, 102, 0.2); }
  .pm-note-title { font-family: Stylish, sans-serif; font-size: 19px; line-height: 1.2; word-break: keep-all; }
  .pm-note-hint { font-family: Pretendard, sans-serif; font-size: 12.5px; line-height: 1.5; color: #8d8981; margin-top: 3px; word-break: keep-all; }
  .pm-note-steps { font-family: Pretendard, sans-serif; font-size: 12.5px; line-height: 1.5; color: #8d8981; margin-top: 4px; --gps-path: #5d5a57; --gps-num: #b9ad9c; }
  .pm-note-icon { position: absolute; left: 13px; top: 12px; width: 22px; height: 22px; }
  .pm-note-retry { margin-top: 8px; padding: 4px 12px; border-radius: 999px; background: #716c66; color: #f9efdc; font-family: Pretendard, sans-serif;
    font-size: 12px; cursor: pointer; }
  .pm-note-retry:focus-visible { outline: 3px solid #5d5a57; outline-offset: 3px; }
  .pm-note.ok { top: auto; bottom: 16px; padding: 7px 14px 6px 36px; }
  .pm-note.ok .pm-note-icon { left: 12px; top: 9px; width: 16px; height: 16px; }
  .pm-note.ok .pm-note-title { font-size: 16px; }
  @media (orientation: portrait) {
    .pm-note { top: 64px; max-width: calc(100% - 36px); }
    .pm-note.ok { max-width: calc(100% - 150px); }
    .pm-tag { font-size: 19px; }
  }
  /* 낮은 가로 화면(휴대폰 가로) — 여백을 줄여 지도를 넓게 */
  @media (orientation: landscape) and (max-height: 500px) {
    .pm-sheet { width: 94vw; height: 88vh; }
    .pm-tag { top: 12px; left: 14px; font-size: 18px; }
    .pm-close { top: 12px; right: 14px; }
    .pm-north { top: 56px; right: 16px; }
    .pm-note { top: 12px; }
    .pm-note-hint, .pm-note-steps { font-size: 11.5px; }
  }
  .pm-stamp { position: absolute; left: 50%; top: 54%; padding: 6px 18px; border: 4px solid rgba(172, 76, 58, 0.72); border-radius: 8px;
    color: rgba(172, 76, 58, 0.78); font-family: Stylish, sans-serif; font-size: clamp(30px, 6vw, 54px); letter-spacing: 0.08em; white-space: nowrap;
    transform: translate(-50%, -50%) rotate(-12deg); pointer-events: none; animation: pm-stamp 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) 0.1s both;
    mix-blend-mode: multiply; }
  @keyframes pm-stamp { from { opacity: 0; transform: translate(-50%, -50%) rotate(-12deg) scale(1.9); } to { opacity: 1; transform: translate(-50%, -50%) rotate(-12deg) scale(1); } }

  /* 마커 요소는 Mapbox가 position: absolute로 둔다 — position을 덮어쓰지 않는다 */
  .pm-me { width: 26px; height: 26px; pointer-events: none; }
  .pm-me-dot { position: absolute; inset: 0; border-radius: 50%; background: #f9efdc; border: 2.5px solid #716c66; box-shadow: 2px 2px 0 0 rgba(113, 108, 102, 0.9); }
  .pm-me-dot::after { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: var(--pm-accent); }
  .pm-me-arrow { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
  .pm-me-arrow::before { content: ''; position: absolute; left: -9px; top: -27px; border-left: 9px solid transparent; border-right: 9px solid transparent;
    border-bottom: 14px solid #716c66; }
  .pm-me-label { position: absolute; left: 50%; top: 30px; transform: translateX(-50%); font-family: Stylish, sans-serif; font-size: 15px; color: #5d5a57;
    text-shadow: 0 0 3px #fbf3df, 0 0 3px #fbf3df, 0 0 3px #fbf3df; white-space: nowrap; }
  .pm-me.ghost .pm-me-dot { opacity: 0.55; border-style: dashed; }
  .pm-me.ghost .pm-me-dot::after { content: '?'; inset: 0; background: none; color: #716c66; font: 16px/21px Stylish, sans-serif; text-align: center; }
  .pm-me.stale .pm-me-dot { opacity: 0.6; }

  .pm-halo { pointer-events: none; }
  .pm-halo-ring { position: absolute; inset: 0; border-radius: 50%; background: color-mix(in srgb, var(--pm-accent) 16%, transparent);
    border: 2px solid color-mix(in srgb, var(--pm-accent) 60%, transparent); }
  .pm-halo.fair .pm-halo-ring, .pm-halo.weak .pm-halo-ring { animation: pm-breathe 2.4s ease-in-out infinite; }
  .pm-halo.coarse .pm-halo-ring { border-style: dashed; border-width: 3px; background: color-mix(in srgb, var(--pm-accent) 10%, transparent); }
  .pm-halo.stale .pm-halo-ring { border-style: dotted; opacity: 0.6; }
  /* 원 아래 가장자리에 단다 — 위쪽은 상태 쪽지와 겹친다 */
  .pm-halo-label { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 30%); font-family: Stylish, sans-serif; font-size: 16px;
    color: #5d5a57; white-space: nowrap; text-shadow: 0 0 3px #fbf3df, 0 0 3px #fbf3df, 0 0 3px #fbf3df; display: none; }
  .pm-halo.coarse .pm-halo-label { display: block; }
  @keyframes pm-breathe { 0%, 100% { transform: scale(0.94); opacity: 0.75; } 50% { transform: scale(1.04); opacity: 1; } }
  .pm-gps-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--pm-accent); border: 2px solid #fbf3df; box-shadow: 0 0 0 1px rgba(113, 108, 102, 0.6); }

  .pm-ping { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
  .pm-ping i { position: absolute; left: -90px; top: -90px; width: 180px; height: 180px; border-radius: 50%; border: 2.5px solid var(--pm-accent);
    opacity: 0; animation: pm-ping 2.4s cubic-bezier(0.2, 0.6, 0.35, 1) infinite; }
  .pm-ping i:nth-child(2) { animation-delay: 0.8s; }
  .pm-ping i:nth-child(3) { animation-delay: 1.6s; }
  @keyframes pm-ping { 0% { transform: scale(0.08); opacity: 0.9; } 100% { transform: scale(1); opacity: 0; } }
  .pm-found { position: absolute; left: 50%; top: -40px; transform: translateX(-50%); font-family: Stylish, sans-serif; font-size: 18px; color: #4c7b56;
    white-space: nowrap; text-shadow: 0 0 3px #fbf3df, 0 0 3px #fbf3df; animation: pm-found 1.6s ease-out both; }
  @keyframes pm-found { 0% { opacity: 0; transform: translate(-50%, 8px) scale(0.6); } 20% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
    75% { opacity: 1; transform: translate(-50%, -4px) scale(1); } 100% { opacity: 0; transform: translate(-50%, -10px) scale(1); } }
  .pm-bob { animation: pm-bob 1.1s ease-in-out infinite; }
  @keyframes pm-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @media (prefers-reduced-motion: reduce) {
    .pm-ping i, .pm-halo-ring, .pm-bob, .pm-found, .pm-stamp { animation: none !important; }
    .pm-ping i { opacity: 0.35; transform: scale(0.6); }
  }
`

/** 미터를 지금 줌의 화면 픽셀로 — Mapbox는 512px 타일 기준이다 */
function metersToPixels(meters: number, lat: number, zoom: number): number {
  const metersPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)
  return meters / metersPerPixel
}

/** 반경(m) 원이 화면 짧은 변의 일정 비율에 들어오는 줌 */
function zoomToFit(meters: number, lat: number, viewPx: number): number {
  const metersPerPixel = (2 * meters) / (viewPx * COARSE_FIT)
  return Math.log2((40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * metersPerPixel))
}

/**
 * M 키로 지도를 펼치고 접는다(Esc는 접기만). 글자 입력 중이거나 Ctrl·Alt·Cmd와 함께 누르면 무시한다
 * — Ctrl+M은 마을 씬의 음소거다. 한글 입력 상태에서도 되도록 물리 키(code)로 본다.
 */
export function useMapHotkey(enabled: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setOpen((open) => !open)
      } else if (e.code === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, setOpen])
}

/** 지도 버튼 아이콘 — 세 번 접힌 종이 지도와 핀 */
export function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="18" viewBox="0 0 20 18" fill="none" aria-hidden="true">
      <path d="M1.5 3.2 L6.8 1.4 L13.2 3.4 L18.5 1.6 V14.8 L13.2 16.6 L6.8 14.6 L1.5 16.4 Z" fill="#f3dfb8" stroke="#716C66" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6.8 1.4 V14.6 M13.2 3.4 V16.6" stroke="#716C66" strokeWidth="1.4" />
      <path d="M10 11.6 C10 11.6 12.6 8.9 12.6 7 C12.6 5.6 11.4 4.6 10 4.6 C8.6 4.6 7.4 5.6 7.4 7 C7.4 8.9 10 11.6 10 11.6 Z" fill="#8875ad" stroke="#716C66" strokeWidth="1.1" />
    </svg>
  )
}

/** 지도 버튼 구석의 GPS 표시 — 찾는 중(깜빡임)·흐림(노랑)·쓸 수 없음(빨강 느낌표). ±50m 안이면 숨긴다 */
export function GpsBadge({ snapshot }: { snapshot: GpsSnapshot | null }) {
  // 위치를 못 잡았을 때만 '!'를 단다 — 잡았으면 정확도와 상관없이 달지 않는다(자세한 상태는 펼침 지도 쪽지가 알린다).
  // 아직 찾기 전(idle)에도 달지 않는다
  const status = snapshot?.status ?? 'idle'
  if (status === 'idle' || (snapshot?.fix && !isGpsBlocked(status))) return null
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#f9efdc] bg-[#b2553f] text-[9px] font-bold leading-none text-[#f9efdc]"
    >
      !
    </span>
  )
}

/**
 * 게임 지도처럼 펼치는 종이 지도 — 씬과 따로 도는 독립 Mapbox 캔버스(ADR 001).
 *
 * 접힌 종이가 옆으로 펼쳐진다 — 넓은 화면은 3단(두 번), 중간은 반(한 번), 좁은 화면은 접지 않고 바로 펼친
 * 모양으로 나타난다. 날개 안쪽 면에는 살아 있는 지도의 그 부분을
 * 렌더가 끝날 때마다 옮겨 그려(render 이벤트 안에서 drawImage), 다 펴지는 순간 진짜 지도와
 * 이음매 없이 바뀐다. Mapbox는 컨테이너 조상의 CSS 변환을 읽어 크기를 재므로, 접혀 있을 때는
 * 애니메이션을 모두 걷어 변환이 없게 두고, 크기 재기는 애니메이션이 끝난 뒤에만 한다.
 *
 * track을 주면 캐릭터 자리(내 주변)가, 없으면 GPS 위치(마을 씬)가 '나'다. 마을 씬에서 위치를 아직
 * 모르면 엉뚱한 곳을 보여 주지 않도록 지도를 가리고 빈 종이에 상태만 띄운다.
 * GPS 상태(찾는 중·흐림·멈춤·거부 등)는 쪽지·도장·정확도 원·음파 효과로 보여 준다.
 */
export default function PaperMap({
  open,
  onClose,
  gps,
  track,
  title,
  accent = '#8875ad',
}: {
  open: boolean
  onClose: () => void
  gps: GpsTracker
  track?: RefObject<MapTrack | null>
  title: string
  /** '나' 표시·정확도 원 색 */
  accent?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const meRef = useRef<{ marker: mapboxgl.Marker; el: HTMLDivElement; arrow: HTMLDivElement } | null>(null)
  const haloRef = useRef<{ marker: mapboxgl.Marker; el: HTMLDivElement; label: HTMLSpanElement } | null>(null)
  const gpsDotRef = useRef<mapboxgl.Marker | null>(null)
  const animsRef = useRef<Animation[]>([])
  /** 지금 애니메이션이 만들어진 면 수 — 펼친 채 창 크기가 바뀌면 접기 전에 새 면 수로 다시 만든다 */
  const animPanelsRef = useRef<Panels>(3)
  const phaseRef = useRef<Phase>('closed')
  const needsResizeRef = useRef(false)
  const returnFocusRef = useRef<Element | null>(null)
  const [phase, setPhase] = useState<Phase>('closed')
  const [panels, setPanels] = useState<Panels>(3)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'none'>('loading')
  const [env, setEnv] = useState<GpsEnv | null>(null)
  const snapshot = useGpsSnapshot(gps)

  const changePhase = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  useEffect(() => setEnv(detectGpsEnv()), [])

  // 종이 폭이 바뀌면(창 크기·회전) 접는 횟수를 바꾼다 — 레이아웃 크기라 변환과 무관하다
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const measure = () => {
      const width = sheet.offsetWidth
      setPanels(width >= TRIFOLD_MIN_PX ? 3 : width >= BIFOLD_MIN_PX ? 2 : 1)
    }
    measure()
    const ro = new ResizeObserver(() => {
      measure()
      // 펼치거나 접는 중에는 조상에 변환이 걸려 있다 — 끝난 뒤에 잰다
      if (phaseRef.current === 'opening' || phaseRef.current === 'closing') needsResizeRef.current = true
      else mapRef.current?.resize()
    })
    ro.observe(sheet)
    return () => ro.disconnect()
  }, [])

  // 지도 — 한 번 만들어 두고 접힌 동안은 숨겨 둔다. 글씨(Stylish)가 온 뒤에 만들어야 라벨이 그 폰트로 그려진다
  useEffect(() => {
    const container = mapBoxRef.current
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!container) return
    if (!token) {
      setMapState('none')
      return
    }
    let cancelled = false
    let map: mapboxgl.Map | null = null
    const fontReady = document.fonts?.load('24px Stylish').catch(() => null) ?? Promise.resolve(null)
    void fontReady.then(() => {
      if (cancelled) return
      mapboxgl.accessToken = token
      const fix = gps.snapshot.fix
      const t = track?.current
      try {
        map = new mapboxgl.Map({
          container,
          style: PAPER_STYLE,
          center: t ? [t.lng, t.lat] : fix ? [fix.lng, fix.lat] : INITIAL_CENTER,
          zoom: OPEN_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          projection: 'mercator',
          // 종이 지도는 북쪽이 위, 평평하게 — 돌리기·기울이기는 막는다
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: false,
          // 크기 재기는 직접 한다(펼치는 중에는 조상 변환 때문에 틀리게 잰다)
          trackResize: false,
          localFontFamily: 'Stylish',
        })
      } catch {
        setMapState('none') // WebGL 미지원 등 — 쪽지로만 안내한다
        return
      }
      const m = map
      // 핀치·Shift+방향키로도 돌리거나 기울이지 않는다(방향키 이동·± 확대는 남긴다)
      m.touchZoomRotate.disableRotation()
      m.keyboard.disableRotation()
      m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
      m.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left')
      m.on('styleimagemissing', (e: { id: string }) => {
        const make = PATTERNS[e.id]
        if (make && !m.hasImage(e.id)) m.addImage(e.id, make(), { pixelRatio: 2 })
      })
      m.on('load', () => setMapState('ready'))
      // 펼치고 접는 동안 날개 안쪽 면을 살아 있는 지도와 같게 — 렌더 직후라 캔버스 버퍼가 살아 있다
      m.on('render', () => {
        if (phaseRef.current === 'opening' || phaseRef.current === 'closing') copyMirrors(m)
      })
      m.on('zoom', () => placeGps())

      const meEl = document.createElement('div')
      meEl.className = 'pm-me'
      meEl.innerHTML = `<div class="pm-me-arrow"></div><div class="pm-me-dot"></div><span class="pm-me-label">나</span>`
      const arrow = meEl.querySelector('.pm-me-arrow') as HTMLDivElement
      arrow.style.display = track ? '' : 'none'
      meRef.current = { marker: new mapboxgl.Marker({ element: meEl }).setLngLat(m.getCenter()), el: meEl, arrow }

      const haloEl = document.createElement('div')
      haloEl.className = 'pm-halo'
      haloEl.innerHTML = `<div class="pm-halo-ring"></div><span class="pm-halo-label">이 근처 어딘가</span>`
      haloRef.current = {
        marker: new mapboxgl.Marker({ element: haloEl }).setLngLat(m.getCenter()),
        el: haloEl,
        label: haloEl.querySelector('.pm-halo-label') as HTMLSpanElement,
      }
      if (track) {
        const dot = document.createElement('div')
        dot.className = 'pm-gps-dot'
        dot.title = 'GPS가 잡은 자리'
        gpsDotRef.current = new mapboxgl.Marker({ element: dot }).setLngLat(m.getCenter())
      }
      mapRef.current = m
      placeGps()
      placeMe()
    })
    return () => {
      cancelled = true
      meRef.current?.marker.remove()
      haloRef.current?.marker.remove()
      gpsDotRef.current?.remove()
      meRef.current = null
      haloRef.current = null
      gpsDotRef.current = null
      map?.remove()
      mapRef.current = null
    }
    // 지도는 한 번만 만든다(gps·track은 ref처럼 읽는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 펼칠 때 줌 — 흐린 위치면 정확도 원 전체가 보이게 물러난다 */
  function openZoom({ status, fix }: GpsSnapshot): number {
    const map = mapRef.current
    const box = mapBoxRef.current
    const current = map ? Math.max(map.getZoom(), 15) : OPEN_ZOOM
    if (!fix || !box || (status !== 'coarse' && status !== 'approximate')) return current
    return Math.max(MIN_ZOOM, Math.min(OPEN_ZOOM, zoomToFit(fix.accuracy, fix.lat, Math.min(box.clientWidth, box.clientHeight))))
  }

  /** 날개 안쪽 면 캔버스에 살아 있는 지도의 그 부분을 옮겨 그린다 */
  function copyMirrors(map: mapboxgl.Map) {
    const sheet = sheetRef.current
    const box = mapBoxRef.current
    if (!sheet || !box) return
    const source = map.getCanvas()
    const ratio = source.width / Math.max(1, box.clientWidth)
    const width = sheet.offsetWidth
    sheet.querySelectorAll<HTMLCanvasElement>('.pm-mirror').forEach((canvas) => {
      // 날개가 덮는 종이 가로 구간을 지도 안쪽 좌표로(종이 여백만큼 안쪽에 지도가 있다)
      const [from, to] = (canvas.dataset.span ?? '0,1').split(',').map(Number)
      const x0 = Math.max(0, from * width - MARGIN)
      const x1 = Math.min(box.clientWidth, to * width - MARGIN)
      const sx = x0 * ratio
      const sy = 0
      const sw = Math.max(1, (x1 - x0) * ratio)
      const sh = source.height
      const w = Math.max(1, Math.round(sw))
      const h = Math.max(1, Math.round(sh))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h)
    })
  }

  /** '나' — 캐릭터 자리(track) 또는 GPS 위치 */
  function placeMe() {
    const me = meRef.current
    const map = mapRef.current
    if (!me || !map) return
    const t = track?.current
    if (t) {
      me.marker.setLngLat([t.lng, t.lat])
      me.arrow.style.transform = `rotate(${t.bearing}deg)`
      if (!me.marker.getElement().isConnected) me.marker.addTo(map)
      return
    }
    const { status, fix } = gps.snapshot
    if (!fix) {
      me.marker.remove()
      return
    }
    me.marker.setLngLat([fix.lng, fix.lat])
    me.el.classList.toggle('ghost', status === 'coarse' || status === 'approximate')
    me.el.classList.toggle('stale', status === 'stale' || isGpsBlocked(status))
    if (!me.el.isConnected) me.marker.addTo(map)
  }

  /** GPS 정확도 원(95% 반경)과 GPS 점 — 줌이 바뀌면 크기를 다시 잰다 */
  function placeGps() {
    const halo = haloRef.current
    const map = mapRef.current
    if (!halo || !map) return
    const { status, fix } = gps.snapshot
    if (!fix) {
      halo.marker.remove()
      gpsDotRef.current?.remove()
      return
    }
    const diameter = 2 * metersToPixels(fix.accuracy, fix.lat, map.getZoom())
    // 너무 작으면 점과 겹쳐 안 보이고, 너무 크면 화면 밖이라 의미가 없다
    const visible = diameter > 30 && diameter < 6000
    halo.el.style.width = halo.el.style.height = `${Math.round(diameter)}px`
    const look = status === 'coarse' || status === 'approximate' ? 'coarse' : status === 'stale' || status === 'fair' || status === 'weak' ? status : ''
    halo.el.className = `pm-halo ${look}`
    halo.label.textContent = `이 근처 어딘가 · ${formatAccuracy(fix.accuracy)}`
    halo.marker.setLngLat([fix.lng, fix.lat])
    if (visible) {
      if (!halo.el.isConnected) halo.marker.addTo(map)
    } else {
      halo.marker.remove()
    }
    const dot = gpsDotRef.current
    if (dot) {
      dot.setLngLat([fix.lng, fix.lat])
      if (!dot.getElement().isConnected) dot.addTo(map)
    }
  }

  // GPS가 바뀔 때마다 표시를 옮긴다(좌표는 React 상태에 두지 않는다)
  useEffect(() => {
    let last = gps.snapshot.status
    let hadFix = !!gps.snapshot.fix
    return gps.subscribe((s) => {
      // 마을 씬(GPS가 '나')에서 펼쳐 둔 채 첫 위치가 오면 그리로 간다
      const map = mapRef.current
      if (map && s.fix && !hadFix && !track) map.jumpTo({ center: [s.fix.lng, s.fix.lat], zoom: openZoom(s) })
      hadFix = !!s.fix
      placeGps()
      placeMe()
      // 찾는 중이었다가 정확한 위치를 잡으면 '나' 위에 '찾았다!'를 한 번 띄운다
      const me = meRef.current
      if (me && s.status === 'good' && (last === 'searching' || last === 'prompt' || last === 'unavailable' || last === 'stale') && phaseRef.current === 'open') {
        const bubble = document.createElement('span')
        bubble.className = 'pm-found'
        bubble.textContent = '찾았다!'
        bubble.addEventListener('animationend', () => bubble.remove())
        me.el.appendChild(bubble)
      }
      last = s.status
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps])

  // 펼쳐 둔 동안 캐릭터를 따라 '나'를 옮긴다(지도는 다시 그리지 않는다 — 마커만 CSS로 움직인다)
  useEffect(() => {
    if (!track || phase === 'closed') return
    let raf = 0
    const loop = () => {
      placeMe()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, track])

  /**
   * 펼치기 한 장면 — 모든 애니메이션이 같은 길이라 거꾸로 돌려도 서로 맞는다.
   * 면 수(panels)마다 다르다: 3단은 두 날개가 차례로, 반은 한 날개가, 한 장은 접지 않고 바로 펼쳐진다.
   */
  function buildAnimations(): Animation[] {
    const root = rootRef.current
    const sheet = sheetRef.current
    if (!root || !sheet) return []
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const count: Panels = reduced ? 1 : panels
    const duration = reduced ? 220 : count === 3 ? TRIFOLD_MS : count === 2 ? BIFOLD_MS : SPREAD_MS
    const options: KeyframeAnimationOptions = { duration, fill: 'both' }
    const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!
    const landed = count === 3 ? B_TO : HALF_TO
    const anims: Animation[] = [
      q('.pm-backdrop').animate([{ opacity: 0 }, { opacity: 1, offset: count === 1 ? 0.5 : 0.25 }, { opacity: 1 }], options),
      q('.pm-stage').animate(
        count === 1
          ? // 접지 않고 바로 — 가로로 조금 좁게 나타나 탁 펴지며 자리를 잡는다
            [
              { opacity: 0, transform: 'translateY(18px) scale(0.88, 0.95) rotate(-2.5deg)', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
              { opacity: 1, transform: 'none', offset: 0.72 },
              { opacity: 1, transform: 'none' },
            ]
          : [
              { opacity: 0, transform: 'translateY(34px) rotate(-6deg) scale(0.9)', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
              { opacity: 1, transform: 'none', offset: LIFT_TO },
              { opacity: 1, transform: 'none' },
            ],
        options,
      ),
      q('.pm-ui').animate([{ opacity: 0 }, { opacity: 0, offset: count === 1 ? 0.45 : 0.88 }, { opacity: 1 }], options),
    ]
    if (count === 1) return anims

    anims.push(q('.pm-creases').animate([{ opacity: 1 }, { opacity: 1, offset: landed }, { opacity: 0.55 }], options))
    const flat = 'inset(0% 0% 0% 0%)'
    // 날개가 몸 쪽으로 들리며 펼쳐진다(왼쪽 날개는 +180°, 오른쪽 날개는 −180°에서 0°로)
    const flap = (el: Element, fold: number, from: number, to: number, lift: number) =>
      el.animate(
        [
          { transform: `translateZ(${lift}px) rotateY(${fold}deg)`, visibility: 'visible' },
          { transform: `translateZ(${lift}px) rotateY(${fold}deg)`, visibility: 'visible', offset: from, easing: FLIP_EASE },
          { transform: 'translateZ(0.5px) rotateY(0deg)', visibility: 'visible', offset: to },
          { transform: 'translateZ(0.5px) rotateY(0deg)', visibility: 'hidden', offset: to + STEP },
          { transform: 'translateZ(0.5px) rotateY(0deg)', visibility: 'hidden' },
        ],
        options,
      )
    // 면이 옆으로 설수록(90°) 어두워진다 — 겉면은 들리며 어두워지고, 안쪽 면은 내려앉으며 밝아진다
    const shade = (el: Element, face: 'cover' | 'inner', from: number, to: number) => {
      const mid = (from + to) / 2
      return el.animate(
        face === 'cover'
          ? [{ opacity: 0 }, { opacity: 0, offset: from, easing: 'ease-in' }, { opacity: 0.42, offset: mid }, { opacity: 0.42 }]
          : [{ opacity: 0.42 }, { opacity: 0.42, offset: mid, easing: 'ease-out' }, { opacity: 0, offset: to }, { opacity: 0 }],
        options,
      )
    }

    if (count === 3) {
      const folded = 'inset(0% 33.34% 0% 33.34%)'
      const half = 'inset(0% 33.34% 0% 0%)'
      const clip = [
        { clipPath: folded },
        { clipPath: folded, offset: A_TO },
        { clipPath: half, offset: A_TO + STEP },
        { clipPath: half, offset: B_TO },
        { clipPath: flat, offset: B_TO + STEP },
        { clipPath: flat },
      ]
      anims.push(
        q('.pm-live').animate(clip, options),
        q('.pm-shadow').animate(clip, options),
        flap(q('.pm-flap.a'), 180, A_FROM, A_TO, 2),
        flap(q('.pm-flap.b'), -180, B_FROM, B_TO, 1),
        shade(q('.pm-flap.a .pm-cover .pm-shade'), 'cover', A_FROM, A_TO),
        shade(q('.pm-flap.a .pm-inner .pm-shade'), 'inner', A_FROM, A_TO),
        shade(q('.pm-flap.b .pm-cover .pm-shade'), 'cover', B_FROM, B_TO),
        shade(q('.pm-flap.b .pm-inner .pm-shade'), 'inner', B_FROM, B_TO),
      )
      return anims
    }

    // 반 접기 — 오른쪽 반이 왼쪽 반 위에 접혀 있다가 오른쪽으로 펼쳐진다. 접힌 묶음(왼쪽 반)이 화면 가운데 오도록
    // 종이를 반의 반만큼 오른쪽에 두었다가, 날개가 펼쳐지는 만큼 함께 제자리로 옮긴다
    const folded = 'inset(0% 50% 0% 0%)'
    const clip = [{ clipPath: folded }, { clipPath: folded, offset: HALF_TO }, { clipPath: flat, offset: HALF_TO + STEP }, { clipPath: flat }]
    anims.push(
      q('.pm-live').animate(clip, options),
      q('.pm-shadow').animate(clip, options),
      sheet.animate(
        [
          { transform: 'translateX(25%)' },
          { transform: 'translateX(25%)', offset: HALF_FROM, easing: FLIP_EASE },
          { transform: 'translateX(0%)', offset: HALF_TO },
          { transform: 'translateX(0%)' },
        ],
        options,
      ),
      flap(q('.pm-flap.b'), -180, HALF_FROM, HALF_TO, 1),
      shade(q('.pm-flap.b .pm-cover .pm-shade'), 'cover', HALF_FROM, HALF_TO),
      shade(q('.pm-flap.b .pm-inner .pm-shade'), 'inner', HALF_FROM, HALF_TO),
    )
    return anims
  }

  // 펼치기·접기
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const current = phaseRef.current
    if (open === (current === 'opening' || current === 'open')) return

    if (open) gps.start()
    const map = mapRef.current

    if (open && current === 'closed') {
      returnFocusRef.current = document.activeElement
      // 변환이 없는 지금 크기를 맞추고, 펼치기 전에 '나'에게 맞춘다
      if (map) {
        if (needsResizeRef.current) {
          map.resize()
          needsResizeRef.current = false
        }
        const t = track?.current
        const fix = gps.snapshot.fix
        const center: [number, number] | null = t ? [t.lng, t.lat] : fix ? [fix.lng, fix.lat] : null
        if (center) map.jumpTo({ center, zoom: t ? Math.max(map.getZoom(), 15) : openZoom(gps.snapshot) })
        placeMe()
        placeGps()
      }
      startTimeline(false, 1)
      root.style.visibility = 'visible'
      changePhase('opening')
      map?.triggerRepaint()
      return
    }

    // 펼치는 중에 다시 누르면 그 자리에서 거꾸로, 펼친 뒤면 끝에서부터 접는다.
    // 펼친 채 창 크기가 바뀌어 접는 횟수가 달라졌으면 새 면 수로 끝 장면부터 다시 만든다
    map?.triggerRepaint()
    changePhase(open ? 'opening' : 'closing')
    if (!open && current === 'open' && animPanelsRef.current !== panels) {
      startTimeline(true, -FOLD_RATE)
      return
    }
    animsRef.current.forEach((a) => {
      a.playbackRate = open ? 1 : -FOLD_RATE
      a.play()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** 펼치기 장면을 새로 만들어 처음(또는 끝)부터 rate 배속으로 돌린다 */
  function startTimeline(fromEnd: boolean, rate: number) {
    const root = rootRef.current
    if (!root) return
    animsRef.current.forEach((a) => a.cancel())
    const anims = buildAnimations()
    animsRef.current = anims
    animPanelsRef.current = panels
    anims.forEach((a) => {
      a.currentTime = fromEnd ? Number(a.effect?.getComputedTiming().endTime ?? 0) : 0
      a.playbackRate = rate
      a.play()
    })
    const map = mapRef.current
    const master = anims[0]
    if (master) {
      master.onfinish = () => {
        if (master.playbackRate > 0) {
          changePhase('open')
          if (needsResizeRef.current) {
            map?.resize()
            needsResizeRef.current = false
          }
          // 포커스는 대화상자에 둔다 — 닫기 버튼에 주면 키보드로 펼쳤을 때 버튼에 포커스 테두리가 그려진다(Tab으로 버튼에 간다)
          rootRef.current?.focus({ preventScroll: true })
        } else {
          anims.forEach((a) => a.cancel())
          root.style.visibility = 'hidden'
          changePhase('closed')
          if (needsResizeRef.current) {
            mapRef.current?.resize()
            needsResizeRef.current = false
          }
          const back = returnFocusRef.current as HTMLElement | null
          if (back?.isConnected) back.focus?.({ preventScroll: true })
        }
      }
    }
  }

  useEffect(() => () => animsRef.current.forEach((a) => a.cancel()), [])

  const note = snapshot && env ? gpsNote(snapshot, env, { walking: !!track }) : null
  const off = note?.tone === 'off'
  const searching = snapshot?.status === 'searching' || snapshot?.status === 'prompt' || snapshot?.status === 'unavailable'
  const hasFix = !!snapshot?.fix
  // 보여 줄 곳이 없다 — 캐릭터도(내 주변) GPS 위치도(마을 씬) 없으면 지도를 가린다
  const nowhere = !track && !hasFix

  return (
    <div
      ref={rootRef}
      className="pm-root"
      data-phase={phase}
      data-off={off}
      data-nowhere={nowhere}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={title}
      aria-hidden={phase === 'closed'}
      style={{ ['--pm-accent' as string]: accent }}
    >
      <style>{CSS}</style>
      <div className="pm-backdrop" onClick={onClose} />
      <div className="pm-stage">
        <div ref={sheetRef} className="pm-sheet">
          <div className="pm-shadow" />
          <div className="pm-live">
            <div ref={mapBoxRef} className="pm-mapbox" />
            <div className="pm-blank" />
            <div className={`pm-creases p${panels}`} />
            <div className="pm-grain" />
            <div className="pm-ui">
              <div className="pm-tag">{title}</div>
              <button type="button" className="pm-btn pm-close" aria-label="지도 접기 (M)" title="지도 접기 (M)" onClick={onClose}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2 2 L12 12 M12 2 L2 12" stroke="#716C66" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
              {(hasFix || track) && (
                <button
                  type="button"
                  className="pm-btn pm-locate"
                  aria-label="내 자리로"
                  title="내 자리로"
                  onClick={() => {
                    const map = mapRef.current
                    const t = track?.current
                    const fix = gps.snapshot.fix
                    const center: [number, number] | null = t ? [t.lng, t.lat] : fix ? [fix.lng, fix.lat] : null
                    if (map && center) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15.5), duration: 600 })
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <circle cx="9" cy="9" r="5" fill="none" stroke="#716C66" strokeWidth="2" />
                    <circle cx="9" cy="9" r="1.8" fill="#716C66" />
                    <path d="M9 0.8 V3.4 M9 14.6 V17.2 M0.8 9 H3.4 M14.6 9 H17.2" stroke="#716C66" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              <svg className="pm-north" viewBox="0 0 34 44" aria-hidden="true">
                <path d="M17 6 L25 30 L17 25 L9 30 Z" fill="#716c66" />
                <path d="M17 6 L17 25 L9 30 Z" fill="#a39b93" />
                <text x="17" y="42" textAnchor="middle" fontFamily="Stylish, sans-serif" fontSize="13" fill="#5d5a57">
                  N
                </text>
              </svg>
              {mapState === 'none' && (
                <div className="pm-note">
                  <div className="pm-note-title">지도를 그릴 수 없어요</div>
                  <div className="pm-note-hint">지도 키가 없거나 이 기기에서 WebGL을 쓸 수 없어요</div>
                </div>
              )}
              {mapState !== 'none' && note && (
                <div className={`pm-note ${note.tone === 'ok' ? 'ok' : ''}`} role="status" aria-live="polite">
                  <NoteIcon tone={note.tone} />
                  <div className="pm-note-title">{note.title}</div>
                  {note.hint && <div className="pm-note-hint">{note.hint}</div>}
                  {note.steps && <GpsSteps steps={note.steps} className="pm-note-steps" />}
                  {note.action && (
                    <button
                      type="button"
                      className="pm-note-retry"
                      onClick={() => (note.action === 'reload' ? window.location.reload() : gps.retry())}
                    >
                      {note.action === 'reload' ? '새로고침' : '다시 시도'}
                    </button>
                  )}
                </div>
              )}
              {note?.stamp && <div className="pm-stamp">{note.stamp}</div>}
              {searching && !hasFix && (
                <div className="pm-ping" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>
          </div>
          {FLAPS[panels].map(({ key, span, cover }) => (
            <div key={`${panels}${key}`} className={`pm-flap p${panels} ${key}`} aria-hidden="true">
              <div className="pm-face pm-inner">
                <canvas className="pm-mirror" data-span={span.join(',')} style={mirrorBox(span)} />
                <div className="pm-grain" />
                <div className="pm-shade" />
              </div>
              <div className="pm-face pm-cover">
                {cover === 'title' && <div className="pm-cover-band" />}
                <div className="pm-cover-art">
                  {cover === 'title' ? (
                    <>
                      <MapIcon />
                      <b>{title}</b>
                    </>
                  ) : (
                    <div className="pm-legend">
                      <i style={{ background: '#fbf6ea', boxShadow: '0 0 0 2px #d8c29a' }} />길
                      <i style={{ background: '#b7dba8' }} />공원
                      <i style={{ background: '#9fd3d8' }} />물
                      <i style={{ background: '#ead3c1', boxShadow: '2px 2px 0 #716c66' }} />건물
                    </div>
                  )}
                </div>
                <div className="pm-grain" />
                <div className="pm-shade" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 날개 안쪽 면에서 지도가 차지하는 자리 — 종이 가장자리 쪽만 여백이 있고, 접는 선 쪽은 여백 없이 이어진다 */
function mirrorBox([from, to]: [number, number]) {
  const left = from === 0 ? MARGIN : 0
  const right = to === 1 ? MARGIN : 0
  // 캔버스는 대체 요소라 left·right만으로는 늘어나지 않는다 — 폭·높이를 준다
  return { left, top: MARGIN, width: `calc(100% - ${left + right}px)`, height: `calc(100% - ${2 * MARGIN}px)` }
}

function NoteIcon({ tone }: { tone: 'ok' | 'wait' | 'warn' | 'off' }) {
  if (tone === 'ok') {
    return (
      <svg className="pm-note-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="#7fb77e" />
        <path d="M4.6 8.2 L7 10.4 L11.4 5.8" fill="none" stroke="#fbf4e2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  // 찾는 중 — 로더와 같은 스피너를 작게 쓴다
  if (tone === 'wait') return <LoaderSpinner size={20} className="pm-note-icon" />
  if (tone === 'warn') {
    return (
      <svg className="pm-note-icon pm-bob" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M11 20 C11 20 18 13 18 8.4 C18 4.6 14.9 2 11 2 C7.1 2 4 4.6 4 8.4 C4 13 11 20 11 20 Z" fill="#e7b75a" stroke="#716c66" strokeWidth="1.4" />
        <text x="11" y="12.4" textAnchor="middle" fontFamily="Stylish, sans-serif" fontSize="10" fill="#5d5a57">
          ?
        </text>
      </svg>
    )
  }
  return (
    <svg className="pm-note-icon" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 20 C11 20 18 13 18 8.4 C18 4.6 14.9 2 11 2 C7.1 2 4 4.6 4 8.4 C4 13 11 20 11 20 Z" fill="#d9cfc0" stroke="#716c66" strokeWidth="1.4" />
      <path d="M3 3 L19 19" stroke="#b2553f" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
