'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Product { type: string; amountKrw: number; label: string }
interface Order { id: string; productType: string; amountKrw: number; status: string; fulfilledAt: string | null }
interface Character { id: number; serialNumber: string; appearance: Record<string, number>; createdAt: string }

const STATUS_LABEL: Record<string, string> = {
  PENDING: '결제 대기',
  PAID: '결제 완료',
  FAILED: '결제 실패',
  REFUNDED: '환불됨',
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

const CARD = 'rounded-xl border border-white/10 bg-white/5 p-4'

export default function StorePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [radius, setRadius] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [p, o, c, l] = await Promise.all([
        apiFetch<Product[]>('/api/billing/products'),
        apiFetch<Order[]>('/api/billing/orders'),
        apiFetch<Character[]>('/api/me/characters'),
        apiFetch<{ visibilityRadiusM: number }>('/api/me/license'),
      ])
      setProducts(p); setOrders(o); setCharacters(c); setRadius(l.visibilityRadiusM)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const buy = async (type: string) => {
    setError(''); setBusy(type)
    try {
      await apiFetch<Order>('/api/billing/orders', {
        method: 'POST',
        body: JSON.stringify({ productType: type }),
      })
      // 아직 PG 연동 전이라 주문서만 발행된다. 결제 승인은 웹훅이 들어와야
      // 처리되고, 지급은 그 뒤 워커가 집어간다
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '주문에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-black px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">

        <header>
          <h1 className="m-0 text-xl font-bold">상점</h1>
          <p className="mt-1 text-sm text-white/50">
            아바타는 결제 건마다 전 세계에 하나뿐인 외형으로 발급됩니다.
          </p>
        </header>

        {error && <p className="m-0 text-sm text-red-400">{error}</p>}

        <section className="grid gap-3 sm:grid-cols-2">
          {products.map((p) => (
            <div key={p.type} className={`${CARD} flex items-center justify-between gap-3`}>
              <div>
                <p className="m-0 text-sm font-semibold">{p.label}</p>
                <p className="m-0 text-xs text-white/50">{won(p.amountKrw)}</p>
              </div>
              <button
                onClick={() => buy(p.type)}
                disabled={busy !== null}
                className="h-9 shrink-0 rounded-lg bg-grass px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === p.type ? '처리 중' : '구매'}
              </button>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-white/70">
            내 아바타 {characters.length > 0 && `(${characters.length})`}
          </h2>
          {characters.length === 0 ? (
            <p className={`${CARD} m-0 text-sm text-white/40`}>아직 발급된 아바타가 없습니다.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {characters.map((c) => (
                <li key={c.id} className={CARD}>
                  <p className="m-0 font-mono text-sm">{c.serialNumber}</p>
                  <p className="m-0 mt-1 text-xs text-white/40">
                    {Object.entries(c.appearance)
                      .filter(([k]) => k !== 'seed')
                      .map(([k, v]) => `${k}:${v}`)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-white/70">가시거리</h2>
          <p className={`${CARD} m-0 text-sm`}>
            {radius === null ? '불러오는 중…' : `현재 ${radius}m`}
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-white/70">주문 내역</h2>
          {orders.length === 0 ? (
            <p className={`${CARD} m-0 text-sm text-white/40`}>주문 내역이 없습니다.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {orders.map((o) => (
                <li key={o.id} className={`${CARD} flex items-center justify-between gap-3`}>
                  <div>
                    <p className="m-0 text-sm">{o.productType}</p>
                    <p className="m-0 text-xs text-white/40">{won(o.amountKrw)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-white/60">
                    {STATUS_LABEL[o.status] ?? o.status}
                    {o.status === 'PAID' && (o.fulfilledAt ? ' · 지급 완료' : ' · 지급 대기')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  )
}
