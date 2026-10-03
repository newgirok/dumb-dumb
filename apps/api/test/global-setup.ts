import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { GenericContainer } from 'testcontainers'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

const IMAGE = 'dumb-dumb-api-test-db'
const APP_PASSWORD = 'app_api'

declare module 'vitest' {
  export interface ProvidedContext {
    /** 테이블 소유자(관리 롤) — 테스트 데이터를 지우고 확인한다. RLS를 받지 않는다 */
    adminUrl: string
    /** API가 쓰는 롤(app_api) — RLS가 걸린다 */
    appUrl: string
  }
}

/**
 * 테스트 DB를 띄운다 — 마이그레이션을 번호 순서대로 적용하고(ADR 010) API 롤의 로그인을 켠다.
 * Docker가 떠 있어야 한다
 */
export default async function setup(project: TestProject) {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  await GenericContainer.fromDockerfile(dir, 'db.Dockerfile').build(IMAGE, { deleteOnExit: false })
  const db = await new PostgreSqlContainer(IMAGE)
    .withDatabase('postgres')
    .withUsername('postgres')
    .withPassword('postgres')
    .start()

  const adminUrl = db.getConnectionUri()
  const client = new Client({ connectionString: adminUrl })
  await client.connect()
  const migrations = path.join(dir, '..', 'migrations')
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await readFile(path.join(migrations, file), 'utf8'))
  }
  await client.query(`ALTER ROLE app_api WITH LOGIN PASSWORD '${APP_PASSWORD}'`)
  await client.end()

  const appUrl = new URL(adminUrl)
  appUrl.username = 'app_api'
  appUrl.password = APP_PASSWORD
  project.provide('adminUrl', adminUrl)
  project.provide('appUrl', appUrl.toString())

  return async () => {
    await db.stop()
  }
}
