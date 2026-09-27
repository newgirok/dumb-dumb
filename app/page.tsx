import Link from 'next/link'
import { SCENE_ROUTES } from '@/lib/routes'

// 진입점 — 3D 씬으로 가는 링크만 둔다
export default function Home() {
  return (
    <main className="p-6">
      <ul className="space-y-2">
        {SCENE_ROUTES.map((href) => (
          <li key={href}>
            <Link href={href} className="underline">
              {href}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
