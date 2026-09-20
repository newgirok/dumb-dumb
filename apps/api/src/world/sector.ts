/**
 * 섹터 계산은 shared/world/sector.ts로 단일화했다. 프론트(lib/geo/sector.ts)와
 * 이 파일이 각자 구현을 들고 있다가 어긋난 이력이 있어, 양쪽 모두 shared만 본다.
 * 기존 `./sector` import 경로를 유지하기 위한 배럴이다.
 */
export * from '../../../../shared/world/sector'
