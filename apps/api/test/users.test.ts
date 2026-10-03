import { ConflictException } from '@nestjs/common'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { UsersService } from '../src/users/users.service'
import { openDb } from './helpers'

const t = openDb()
const users = new UsersService(t.db)

beforeEach(() => t.reset())
afterAll(() => t.close())

describe('UsersService', () => {
  it('가입하면 기본 라이선스(25m)도 함께 생긴다', async () => {
    const user = await users.create({ email: 'a@x.com', passwordHash: 'hash', nickname: '에이' })

    expect(user).toMatchObject({ email: 'a@x.com', nickname: '에이', role: 'user', tokenVersion: 0 })
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(await t.admin('SELECT visibility_radius_m FROM user_licenses WHERE user_id = $1', [user.id])).toEqual([
      { visibility_radius_m: 25 },
    ])
  })

  it('이메일 대소문자만 다른 중복 가입을 막는다', async () => {
    await users.create({ email: 'Foo@x.com', passwordHash: 'hash', nickname: 'foo' })

    await expect(users.create({ email: 'foo@X.com', passwordHash: 'hash', nickname: 'bar' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('인증 경로만 비밀번호 해시를 함께 받는다', async () => {
    const user = await users.create({ email: 'b@x.com', passwordHash: 'secret', nickname: '비' })

    expect(await users.findByEmailWithSecret('B@x.com')).toEqual({ ...user, passwordHash: 'secret' })
    expect(await users.findByEmail('b@x.com')).toEqual(user)
    expect(await users.findById(user.id)).toEqual(user)
    expect(await users.findByEmailWithSecret('none@x.com')).toBeNull()
    expect(await users.findByEmail('none@x.com')).toBeNull()
    expect(await users.findById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('소셜 가입은 비밀번호 없이 만들고 로그인 수단을 붙인다', async () => {
    const user = await users.createFromSocial({
      email: 'k@x.com',
      nickname: '카',
      provider: 'kakao',
      providerUserId: 'k-1',
      providerEmail: null,
    })

    expect(await users.findByEmailWithSecret('k@x.com')).toEqual({ ...user, passwordHash: null })
    expect(await users.findBySocial('kakao', 'k-1')).toEqual(user)
    expect(await users.findBySocial('google', 'k-1')).toBeNull()
    expect(await t.admin('SELECT visibility_radius_m FROM user_licenses WHERE user_id = $1', [user.id])).toEqual([
      { visibility_radius_m: 25 },
    ])
  })

  it('소셜 가입 중 하나라도 실패하면 유저도 남지 않는다', async () => {
    await users.createFromSocial({ email: 'k@x.com', nickname: '카', provider: 'kakao', providerUserId: 'k-1', providerEmail: null })

    // 이미 다른 유저에 붙은 카카오 계정 — 로그인 수단을 넣다가 실패한다
    await expect(
      users.createFromSocial({ email: 'z@x.com', nickname: '지', provider: 'kakao', providerUserId: 'k-1', providerEmail: null }),
    ).rejects.toThrow()
    expect(await users.findByEmail('z@x.com')).toBeNull()
  })

  it('같은 소셜 계정을 다시 붙여도 오류 없이 하나만 남는다', async () => {
    const user = await users.create({ email: 'c@x.com', passwordHash: 'hash', nickname: '씨' })
    const identity = { userId: user.id, provider: 'google', providerUserId: 'g-1', email: 'c@x.com' }

    await users.linkIdentity(identity)
    await users.linkIdentity(identity)

    expect(await users.findBySocial('google', 'g-1')).toEqual(user)
    expect(await t.admin('SELECT provider, provider_user_id, email FROM user_identities')).toEqual([
      { provider: 'google', provider_user_id: 'g-1', email: 'c@x.com' },
    ])
  })

  it('토큰 버전을 올릴 때마다 1씩 는다', async () => {
    const user = await users.create({ email: 'd@x.com', passwordHash: 'hash', nickname: '디' })

    await users.bumpTokenVersion(user.id)
    await users.bumpTokenVersion(user.id)

    expect((await users.findById(user.id))?.tokenVersion).toBe(2)
  })
})
