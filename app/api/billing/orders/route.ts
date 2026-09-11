import { proxy } from '@/lib/api/proxy'

export async function GET(request: Request) {
  return proxy(request, '/billing/orders')
}

export async function POST(request: Request) {
  return proxy(request, '/billing/orders', {
    method: 'POST',
    body: JSON.stringify(await request.json()),
  })
}
