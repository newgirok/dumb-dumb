import { defineConfig } from 'drizzle-kit'

/**
 * 스키마(src/database/schema.ts)를 바꾼 만큼의 마이그레이션 SQL을 migrations/에 만든다
 * (`npm run db:generate -- --name 설명` → 다음 번호 `0011_설명.sql`). 적용은 지금처럼 psql로 번호 순서대로 한다(ADR 010).
 * migrations/meta/는 drizzle-kit이 마지막 스키마를 기억하는 곳이다 — 0010까지 적용한 스키마가 기준점(idx 10)이다
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './migrations',
  breakpoints: false,
})
