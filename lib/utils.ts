import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// app/globals.css의 @theme에 정의된 커스텀 토큰들. tailwind-merge는 기본 Tailwind
// 스케일만 알기 때문에, 커스텀 토큰(예: p-md, rounded-card)끼리의 충돌 해결(같은
// 속성의 후순위 클래스가 이기는 것)이 되려면 이렇게 classGroups를 확장해줘야 한다.
// @theme에 토큰을 추가/변경하면 이 목록도 같이 갱신할 것.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      p:  [{ p:  ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'sidebar', 'nav', 'gutter'] }],
      px: [{ px: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'gutter'] }],
      py: [{ py: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      pt: [{ pt: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      pr: [{ pr: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      pb: [{ pb: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'nav'] }],
      pl: [{ pl: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      m:  [{ m:  ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      gap: [{ gap: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      w: [{ w: ['sidebar'] }],
      h: [{ h: ['sidebar', 'nav'] }],
      'font-size': [{ text: ['md', 'display', 'hero'] }],
      'text-color': [{ text: ['paper', 'paper-2', 'grass', 'grass-2', 'grass-light', 'sky', 'sky-dark', 'sand', 'accent', 'accent-2', 'bark', 'bark-2', 'bark-3'] }],
      'bg-color': [{ bg: ['paper', 'paper-2', 'grass', 'grass-2', 'grass-light', 'sky', 'sky-dark', 'sand', 'accent', 'accent-2', 'bark', 'bark-2', 'bark-3'] }],
      'border-color': [{ border: ['paper', 'paper-2', 'grass', 'grass-2', 'grass-light', 'sky', 'sky-dark', 'sand', 'accent', 'accent-2', 'bark', 'bark-2', 'bark-3'] }],
      rounded: [{ rounded: ['card', 'btn'] }],
      shadow: [{ shadow: ['card', 'btn'] }],
      'max-w': [{ 'max-w': ['page'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
