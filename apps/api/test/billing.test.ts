import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { BillingService, type ProductType } from '../src/billing/billing.service'
import { UsersService } from '../src/users/users.service'
import { openDb, signUp } from './helpers'

const t = openDb()
const users = new UsersService(t.db)
const billing = new BillingService(t.db, new ConfigService({}))

beforeEach(() => t.reset())
afterAll(() => t.close())

const status = async (orderId: string) =>
  (await t.admin<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]))[0].status

describe('BillingService', () => {
  it('주문 금액은 서버가 정하고 결제 대기로 시작한다', async () => {
    const user = await signUp(users, 'a@x.com')

    const order = await billing.createOrder(user, 'license_100m')

    expect(order).toEqual({ id: expect.any(String), productType: 'license_100m', amountKrw: 4900, status: 'PENDING' })
  })

  it('알 수 없는 상품은 거절한다', async () => {
    const user = await signUp(users, 'a@x.com')

    await expect(billing.createOrder(user, 'gift' as ProductType)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('주문 내역은 내 것만 최근 순으로 보여 준다', async () => {
    const a = await signUp(users, 'a@x.com')
    const b = await signUp(users, 'b@x.com')
    const first = await billing.createOrder(a, 'character')
    const second = await billing.createOrder(a, 'bundle_10')
    await billing.createOrder(b, 'character')

    expect(await billing.listOrders(a)).toEqual([
      { id: second.id, productType: 'bundle_10', amountKrw: 19800, status: 'PENDING', fulfilledAt: null },
      { id: first.id, productType: 'character', amountKrw: 2200, status: 'PENDING', fulfilledAt: null },
    ])
  })

  it('승인을 반영하고, 같은 웹훅이 다시 와도 한 번만 반영한다', async () => {
    const user = await signUp(users, 'a@x.com')
    const order = await billing.createOrder(user, 'character')
    const payment = { orderId: order.id, approvalNumber: 'AP-1', amountKrw: 2200 }

    expect(await billing.applyPayment(payment)).toEqual({ applied: true })
    expect(await billing.applyPayment(payment)).toEqual({ applied: false })

    const [row] = await t.admin('SELECT status, pg_approval_number, completed_at FROM orders WHERE id = $1', [order.id])
    expect(row).toEqual({ status: 'PAID', pg_approval_number: 'AP-1', completed_at: expect.any(Date) })
  })

  it('금액이 다르면 반영하지 않는다', async () => {
    const user = await signUp(users, 'a@x.com')
    const order = await billing.createOrder(user, 'character')

    await expect(billing.applyPayment({ orderId: order.id, approvalNumber: 'AP-1', amountKrw: 100 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(await status(order.id)).toBe('PENDING')
  })

  it('없는 주문은 거절한다', async () => {
    await expect(
      billing.applyPayment({ orderId: '00000000-0000-0000-0000-000000000000', approvalNumber: 'AP-1', amountKrw: 2200 }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('다른 주문에 이미 쓴 승인번호는 반영하지 않는다', async () => {
    const user = await signUp(users, 'a@x.com')
    const a = await billing.createOrder(user, 'character')
    const b = await billing.createOrder(user, 'character')

    expect(await billing.applyPayment({ orderId: a.id, approvalNumber: 'AP-9', amountKrw: 2200 })).toEqual({ applied: true })
    expect(await billing.applyPayment({ orderId: b.id, approvalNumber: 'AP-9', amountKrw: 2200 })).toEqual({ applied: false })
    expect(await status(b.id)).toBe('PENDING')
  })
})
