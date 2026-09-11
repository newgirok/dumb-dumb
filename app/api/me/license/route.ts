import { proxy } from '@/lib/api/proxy'

export async function GET(request: Request) {
  return proxy(request, '/me/license')
}
