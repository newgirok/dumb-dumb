/**
 * 섹터 계산은 shared/world/sector.ts로 단일화했다. 예전에는 이 파일이 경도
 * 스케일을 서울 위도(37.5°)로 고정해 둔 탓에 서버(위도별 계산)와 섹터 ID가
 * 어긋났다. 이제 프론트·백엔드 모두 shared만 본다. 기존 `@/lib/geo/sector`
 * import 경로를 유지하기 위한 배럴이다.
 */
export * from '@/shared/world/sector'
