import { ConfigService } from '@nestjs/config'
import { Client } from 'pg'
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { AvatarsService } from '../src/avatars/avatars.service'
import { BillingService, PRODUCTS, type ProductType } from '../src/billing/billing.service'
import { FulfillmentService } from '../src/billing/fulfillment.service'
import { UsersService } from '../src/users/users.service'
import type { AuthUser } from '../src/auth/auth.types'
import { openDb, signUp } from './helpers'

const t = openDb()
const users = new UsersService(t.db)
const billing = new BillingService(t.db, new ConfigService({}))
const avatars = new AvatarsService(t.db)
const fulfillment = new FulfillmentService(t.db, avatars)

beforeEach(() => t.reset())
afterAll(() => t.close())

/** 결제까지 마친 주문 */
async function paidOrder(user: AuthUser, productType: ProductType) {
  const order = await billing.createOrder(user, productType)
  await billing.applyPayment({ orderId: order.id, approvalNumber: `AP-${order.id}`, amountKrw: PRODUCTS[productType].amountKrw })
  return order
}

const fulfilledAt = async (orderId: string) =>
  (await t.admin<{ fulfilled_at: Date | null }>('SELECT fulfilled_at FROM orders WHERE id = $1', [orderId]))[0].fulfilled_at

describe('FulfillmentService', () => {
  it('결제된 주문만 오래된 순으로 집고, 지급됐거나 8번 실패한 주문은 건너뛴다', async () => {
    const user = await signUp(users, 'a@x.com')
    await billing.createOrder(user, 'character')
    const first = await paidOrder(user, 'character')
    const second = await paidOrder(user, 'license_100m')
    const done = await paidOrder(user, 'character')
    const failing = await paidOrder(user, 'character')
    await t.admin('UPDATE orders SET fulfilled_at = now() WHERE id = $1', [done.id])
    await t.admin('UPDATE orders SET fulfill_attempts = 8 WHERE id = $1', [failing.id])

    expect(await fulfillment.claimPendingOrders()).toEqual([
      { orderId: first.id, userId: user.id, productType: 'character' },
      { orderId: second.id, userId: user.id, productType: 'license_100m' },
    ])
    expect(await fulfillment.claimPendingOrders(1)).toHaveLength(1)
  })

  it('다른 워커가 잠근 주문은 건너뛴다', async () => {
    const user = await signUp(users, 'a@x.com')
    const locked = await paidOrder(user, 'character')
    const free = await paidOrder(user, 'character')
    const other = new Client({ connectionString: inject('adminUrl') })
    await other.connect()
    await other.query('BEGIN')
    await other.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [locked.id])

    try {
      expect((await fulfillment.claimPendingOrders()).map((order) => order.orderId)).toEqual([free.id])
    } finally {
      await other.query('ROLLBACK')
      await other.end()
    }
  })

  it('아바타는 시리얼을 붙여 발급하고, 워커가 다시 돌아도 더 발급하지 않는다', async () => {
    const user = await signUp(users, 'a@x.com')
    const order = await paidOrder(user, 'character')
    const [claimed] = await fulfillment.claimPendingOrders()

    await fulfillment.fulfill(claimed)
    await fulfillment.fulfill(claimed)

    expect(await t.admin('SELECT serial_number, owner_id, order_seq FROM characters WHERE order_id = $1', [order.id])).toEqual([
      { serial_number: 'OW-00000001', owner_id: user.id, order_seq: 1 },
    ])
    expect(await fulfilledAt(order.id)).toBeInstanceOf(Date)
    expect(await fulfillment.claimPendingOrders()).toEqual([])
  })

  it('묶음은 10개를 차례 번호로 발급한다', async () => {
    const user = await signUp(users, 'a@x.com')
    const order = await paidOrder(user, 'bundle_10')

    await fulfillment.fulfill({ orderId: order.id, userId: user.id, productType: 'bundle_10' })

    const rows = await t.admin<{ serial_number: string; order_seq: number }>(
      'SELECT serial_number, order_seq FROM characters WHERE order_id = $1 ORDER BY order_seq',
      [order.id],
    )
    expect(rows.map((row) => row.order_seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(new Set(rows.map((row) => row.serial_number)).size).toBe(10)
    for (const row of rows) expect(row.serial_number).toMatch(/^OW-\d{8}$/)
  })

  it('가시거리는 넓은 쪽이 남는다', async () => {
    const user = await signUp(users, 'a@x.com')
    const wide = await paidOrder(user, 'license_300m')
    const narrow = await paidOrder(user, 'license_100m')

    for (const order of await fulfillment.claimPendingOrders()) await fulfillment.fulfill(order)

    expect(await t.admin('SELECT visibility_radius_m FROM user_licenses WHERE user_id = $1', [user.id])).toEqual([
      { visibility_radius_m: 300 },
    ])
    expect(await fulfilledAt(wide.id)).toBeInstanceOf(Date)
    expect(await fulfilledAt(narrow.id)).toBeInstanceOf(Date)
  })
})

describe('AvatarsService', () => {
  it('외형이 겹치면 다시 뽑고 실패 횟수를 남긴다', async () => {
    const user = await signUp(users, 'a@x.com')
    const first = await paidOrder(user, 'character')
    await avatars.issueForOrder(first.id, user.id)
    const [{ appearance_hash }] = await t.admin<{ appearance_hash: string }>('SELECT appearance_hash FROM characters')
    const second = await paidOrder(user, 'character')
    // 첫 추첨이 이미 있는 외형을 내놓게 한다
    const roll = vi
      .spyOn(avatars as unknown as { rollAppearance(): unknown }, 'rollAppearance')
      .mockReturnValueOnce({ data: { seed: 1 }, hash: appearance_hash })

    try {
      const issued = await avatars.issueForOrder(second.id, user.id)
      expect(issued).toEqual({ id: expect.anything(), serialNumber: 'OW-00000003', appearanceHash: expect.any(String) })
      expect(issued?.appearanceHash).not.toBe(appearance_hash)
      expect(roll).toHaveBeenCalledTimes(2)
    } finally {
      roll.mockRestore()
    }
    expect(await t.admin('SELECT fulfill_attempts FROM orders WHERE id = $1', [second.id])).toEqual([{ fulfill_attempts: 1 }])
  })

  it('이미 발급한 항목이면 null을 돌려준다', async () => {
    const user = await signUp(users, 'a@x.com')
    const order = await paidOrder(user, 'character')

    expect(await avatars.issueForOrder(order.id, user.id)).not.toBeNull()
    expect(await avatars.issueForOrder(order.id, user.id)).toBeNull()
  })
})
