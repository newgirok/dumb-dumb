import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // 마이그레이션까지 마친 PostgreSQL 컨테이너 하나를 모든 테스트가 나눠 쓴다
    globalSetup: ['test/global-setup.ts'],
    // 지급 큐처럼 테이블 전체를 보는 테스트가 있어 파일을 하나씩 돌린다
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
