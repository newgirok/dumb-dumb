import { ConfigService } from '@nestjs/config'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AvatarsService } from '../src/avatars/avatars.service'
import { BillingService } from '../src/billing/billing.service'
import { orders } from '../src/database/schema'
import { MeController } from '../src/users/me.controller'
import { UsersService } from '../src/users/users.service'
import { openDb, signUp } from './helpers'

const t = openDb()
const users = new UsersService(t.db)
const billing = new BillingService(t.db, new ConfigService({}))
const avatars = new AvatarsService(t.db)
const me = new MeController(t.db)

beforeEach(() => t.reset())
afterAll(() => t.close())

describe('본인 데이터만 보인다', () => {
  it('내 아바타·라이선스만 내려준다', async () => {
    const a = await signUp(users, 'a@x.com')
    const b = await signUp(users, 'b@x.com')
    const order = await billing.createOrder(a, 'character')
    const issued = await avatars.issueForOrder(order.id, a.id)
    const other = await billing.createOrder(b, 'character')
    await avatars.issueForOrder(other.id, b.id)

    expect(await me.characters(a)).toEqual([
      {
        id: Number(issued!.id),
        serialNumber: issued!.serialNumber,
        appearance: expect.objectContaining({ seed: expect.any(Number) }),
        isEquipped: false,
        createdAt: expect.any(Date),
      },
    ])
    expect(await me.license(a)).toEqual({ visibilityRadiusM: 25 })
  })

  it('라이선스 행이 없으면 기본값(25m)으로 답한다', async () => {
    const a = await signUp(users, 'a@x.com')
    await t.admin('DELETE FROM user_licenses WHERE user_id = $1', [a.id])

    expect(await me.license(a)).toEqual({ visibilityRadiusM: 25 })
  })

  it('조건 없이 읽어도 RLS가 남의 주문을 걸러 낸다', async () => {
    const a = await signUp(users, 'a@x.com')
    const b = await signUp(users, 'b@x.com')
    await billing.createOrder(a, 'character')
    await billing.createOrder(b, 'character')

    const mine = await t.db.withUser({ userId: a.id, role: 'user' }, (tx) => tx.select({ userId: orders.userId }).from(orders))
    const all = await t.db.withAdmin((tx) => tx.select({ userId: orders.userId }).from(orders))

    expect(mine).toEqual([{ userId: a.id }])
    expect(all).toHaveLength(2)
  })
})
