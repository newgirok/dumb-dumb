/**
 * GPS 상태별 안내 문구 — 지도 쪽지·내 주변 대기 화면·알림이 같은 문구를 쓴다.
 *
 * 설정 경로는 기기마다 달라 기기별로 고른다(애플·구글·삼성·마이크로소프트 한국어 도움말 기준).
 * 기기·OS 위치가 꺼져도 브라우저는 대개 '권한 거부'로 알려 주므로, 거부 안내에는 둘 다 적는다.
 */

import { formatAccuracy, isWalkableFix, type GpsSnapshot } from './gps'

export type Platform = 'ios' | 'android' | 'windows' | 'mac' | 'other'

export interface GpsEnv {
  platform: Platform
  /** 삼성 인터넷 — 사이트 권한 메뉴가 크롬과 다르다 */
  samsung: boolean
  /** 카카오톡 같은 앱 속 브라우저(카카오톡만 확인된 표시, 나머지는 흔한 표시로 어림한다) */
  inApp: boolean
}

export interface GpsNote {
  /** ok 찾음 · wait 찾는 중 · warn 부정확 · off 쓸 수 없음 */
  tone: 'ok' | 'wait' | 'warn' | 'off'
  title: string
  hint?: string
  /**
   * 설정 순서 — 한 단계에 한 가지씩(두 단계 이상이면 번호를 붙여 보인다). 메뉴 경로는
   * [설정 › 개인정보 보호 및 보안 › 위치 서비스]처럼 대괄호로 묶는다 — `GpsSteps`가 경로를 강조하고 조각마다 줄이 끊기지 않게 한다
   */
  steps?: string[]
  /** 지도에 찍는 도장 글씨(쓸 수 없을 때) */
  stamp?: string
  /** 다시 시도 버튼 — iOS 사파리는 거부한 뒤로 새로고침해야 권한이 바뀐다 */
  action?: 'retry' | 'reload'
}

export function detectGpsEnv(): GpsEnv {
  const ua = navigator.userAgent
  // iPadOS는 데스크톱 사파리로 보고한다 — 터치가 되는 Mac이면 iPad다
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const platform: Platform = ios
    ? 'ios'
    : /Android/.test(ua)
      ? 'android'
      : /Windows/.test(ua)
        ? 'windows'
        : /Macintosh/.test(ua)
          ? 'mac'
          : 'other'
  return {
    platform,
    samsung: /SamsungBrowser/.test(ua),
    inApp: /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua),
  }
}

const isMobile = (env: GpsEnv) => env.platform === 'ios' || env.platform === 'android'

type Guide = Pick<GpsNote, 'hint' | 'steps'>

function deniedGuide(env: GpsEnv): Guide {
  if (env.inApp) return { hint: '앱 속 브라우저에선 위치가 잘 안 잡혀요', steps: ['메뉴에서 ‘다른 브라우저로 열기’를 눌러 주세요'] }
  if (env.samsung) return { steps: ['[메뉴 › 설정 › 사이트 및 다운로드 › 사이트 권한 › 위치]에서 허용해 주세요', '휴대폰 ‘위치’도 켜 주세요'] }
  switch (env.platform) {
    case 'ios':
      return {
        steps: [
          '[설정 › 개인정보 보호 및 보안 › 위치 서비스]를 켜 주세요',
          '같은 화면의 [Safari 웹사이트]를 ‘앱을 사용하는 동안’으로 바꿔 주세요',
          '아래 ‘새로고침’을 눌러 주세요',
        ],
      }
    case 'android':
      return { steps: ['[주소창 왼쪽 아이콘 › 권한]에서 위치를 허용해 주세요', '휴대폰 ‘위치’도 켜 주세요'] }
    case 'windows':
      return { steps: ['[주소창 왼쪽 아이콘]에서 위치를 허용해 주세요', '[Windows 설정 › 개인 정보 및 보안 › 위치]에서 ‘위치 서비스’를 켜 주세요'] }
    case 'mac':
      return { steps: ['[주소창 왼쪽 아이콘]에서 위치를 허용해 주세요', '[시스템 설정 › 개인정보 보호 및 보안 › 위치 서비스]에서 브라우저를 켜 주세요'] }
    default:
      return { steps: ['브라우저 사이트 설정에서 위치를 허용해 주세요'] }
  }
}

function approximateGuide(env: GpsEnv): Guide {
  if (env.inApp) return { hint: '앱 속 브라우저에선 위치가 흐릴 수 있어요', steps: ['메뉴에서 ‘다른 브라우저로 열기’를 눌러 보세요'] }
  switch (env.platform) {
    case 'ios':
      return { steps: ['[설정 › 개인정보 보호 및 보안 › 위치 서비스 › Safari 웹사이트]에서 ‘정확한 위치’를 켜 주세요'] }
    case 'android':
      return { steps: ['[브라우저 앱 정보 › 권한 › 위치]에서 ‘정확한 위치 사용’을 켜 주세요'] }
    default:
      return { hint: 'PC는 GPS가 없어 위치가 크게 어긋날 수 있어요. 휴대폰으로 열면 정확해요' }
  }
}

/**
 * 지금 GPS 상태의 안내. walking이면 GPS가 캐릭터를 걷게 하는 화면(내 주변)이라 걸음 이야기를 한다.
 */
export function gpsNote(snapshot: GpsSnapshot, env: GpsEnv, { walking = false } = {}): GpsNote | null {
  const { status, fix, slow } = snapshot
  const accuracy = fix ? formatAccuracy(fix.accuracy) : ''
  const mobile = isMobile(env)
  switch (status) {
    case 'idle':
      return null
    case 'insecure':
      return {
        tone: 'off',
        stamp: 'https 필요',
        title: '보안 연결에서만 위치를 쓸 수 있어요',
        hint: 'https 주소로 다시 열어 주세요. http에서는 브라우저가 위치를 막아요',
      }
    case 'unsupported':
      return { tone: 'off', stamp: '위치 미지원', title: '이 브라우저는 위치를 못 써요', hint: '최신 Chrome이나 Safari로 열어 주세요' }
    case 'prompt':
      return {
        tone: 'wait',
        title: '위치 권한을 허용해 주세요',
        hint: `${mobile ? '화면에 뜬 창' : '주소창 아래 창'}에서 ‘허용’을 누르면 ${walking ? '내 주변 길이 깔려요' : '지도에 내 자리가 떠요'}`,
      }
    case 'searching':
    case 'unavailable':
      // 위치 없음(code 2)도 watch가 계속 찾는 중이라 기다림으로 보인다
      return slow || status === 'unavailable'
        ? {
            tone: 'wait',
            title: '신호가 조금 늦네요',
            hint: mobile
              ? '하늘이 보이는 곳이나 창가로 가 볼까요? 계속 찾고 있어요'
              : 'PC는 와이파이로 위치를 잡아요. 와이파이를 켜 두면 더 빨라요. 계속 찾고 있어요',
          }
        : { tone: 'wait', title: '위치를 찾고 있어요…', hint: mobile ? '잠깐만요, GPS 신호를 잡는 중이에요' : '잠깐만요, 위치를 잡는 중이에요' }
    case 'denied':
      return {
        tone: 'off',
        stamp: '위치 꺼짐',
        title: '위치 권한이 꺼져 있어요',
        ...deniedGuide(env),
        action: env.platform === 'ios' && !env.inApp ? 'reload' : 'retry',
      }
    case 'good':
      return { tone: 'ok', title: `위치를 찾았어요 · ${accuracy}`, hint: walking && mobile ? '이제 걸으면 캐릭터도 따라 걸어요' : undefined }
    case 'fair':
      return { tone: 'ok', title: `신호가 살짝 흔들려요 · ${accuracy}`, hint: walking ? '조금 걸으면 금방 또렷해져요' : undefined }
    case 'weak':
      return {
        tone: 'warn',
        title: `GPS 신호가 약해요 · ${accuracy}`,
        hint: !mobile
          ? 'PC는 와이파이로 위치를 어림해서 조금 어긋날 수 있어요'
          : walking
            ? '건물 사이에선 위치가 튈 수 있어서 캐릭터는 잠깐 멈춰 둘게요'
            : '건물 사이나 실내에선 위치가 튈 수 있어요',
      }
    case 'coarse':
      return { tone: 'warn', title: `위치가 아직 흐릿해요 · ${accuracy}`, hint: '밖으로 나가거나 와이파이를 켜면 더 정확해져요' }
    case 'approximate':
      return { tone: 'warn', title: `대략적인 위치만 받고 있어요 · ${accuracy}`, ...approximateGuide(env) }
    case 'stale':
      return { tone: 'warn', title: '걸음 신호가 잠시 멈췄어요', hint: '가만히 있으면 그럴 수 있어요. 걸으면 다시 따라가요' }
  }
}

/**
 * 내 주변 시작 전 대기 화면 — 위치를 기다리는 동안은 로딩 첫 줄("내 위치 찾는 중이에요")만 두고(null), 해야 할 일이
 * 있을 때만 안내한다: 권한을 묻거나 꺼져 있을 때, 보안 연결이 아니거나 위치를 못 쓰는 브라우저일 때, 신호가 한참 늦을 때.
 * 흐린 위치를 받았으면 잠시 뒤 알아서 이 근처에서 시작하므로(waitForStartFix) 따로 알리지 않는다 —
 * 위치를 또렷하게 하는 방법은 시작한 뒤 위쪽 알림과 지도가 보여 준다.
 */
export function startWaitNote(snapshot: GpsSnapshot, env: GpsEnv): GpsNote | null {
  switch (snapshot.status) {
    case 'insecure':
    case 'unsupported':
    case 'prompt':
    case 'denied':
    case 'unavailable':
      return gpsNote(snapshot, env, { walking: true })
    case 'searching':
      return snapshot.slow ? gpsNote(snapshot, env, { walking: true }) : null
    default:
      return null
  }
}

/**
 * 내 주변에서 걷는 중 위쪽 알림 — 위치를 받을 수 없게 됐거나 휴대폰에서 GPS가 걸음을 따라가지 못할 때만
 * 한 줄로 알린다. 자세한 안내는 지도(M)에 있다.
 */
export function walkNote(snapshot: GpsSnapshot, { mobile }: { mobile: boolean }): string | null {
  const { status, fix } = snapshot
  if (status === 'denied' || status === 'insecure' || status === 'unsupported') return '위치를 받을 수 없어 캐릭터가 GPS를 따라가지 않아요'
  if (!mobile) return null
  if (status === 'stale') return '걸음 신호가 잠시 멈췄어요 · 걸으면 다시 따라가요'
  if (fix && !isWalkableFix(fix)) return `GPS 신호가 약해(${formatAccuracy(fix.accuracy)}) 캐릭터를 잠깐 멈춰 뒀어요`
  return null
}
