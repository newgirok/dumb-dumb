import { Fragment, type ReactNode } from 'react'

// 구글·애플 도움말처럼 한 단계에 한 줄씩 번호를 붙이고, 메뉴 경로는 진하게 › 로 잇는다.
// 경로 조각("개인 정보 및 보안")과 따옴표로 묶은 화면 이름(‘위치 서비스’)은 줄이 바뀌어도 쪼개지지 않는다
const CSS = `
  .gps-steps { word-break: keep-all; }
  .gps-steps ol { list-style: none; margin: 0; padding: 0; counter-reset: gps-step; display: flex; flex-direction: column; gap: 4px; text-align: left; }
  .gps-steps li { counter-increment: gps-step; position: relative; padding-left: 22px; }
  .gps-steps li::before { content: counter(gps-step); position: absolute; left: 0; top: 0.18em; width: 16px; height: 16px; border-radius: 50%;
    background: var(--gps-num, #cfc8bb); color: #fffdf8; font-size: 10.5px; line-height: 16px; text-align: center; }
  .gps-steps p { margin: 0; }
  .gps-path { color: var(--gps-path, inherit); }
  .gps-seg { white-space: nowrap; }
`

/** 따옴표로 묶은 화면 이름(‘위치 서비스’)은 한 줄에 둔다 */
function keepQuoted(text: string, key: number): ReactNode[] {
  return text.split(/(‘[^’]+’)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={`${key}-${i}`} className="gps-seg">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/** "[설정 › 개인 정보 및 보안 › 위치]에서 …" — 대괄호 안은 경로로 보인다 */
function renderStep(step: string): ReactNode[] {
  return step.split(/\[([^\]]+)\]/).map((part, i) =>
    i % 2 === 0 ? (
      keepQuoted(part, i)
    ) : (
      <span key={i} className="gps-path">
        {part.split('›').map((segment, j) => (
          <Fragment key={j}>
            {j > 0 && <span aria-hidden="true"> › </span>}
            <span className="gps-seg">{segment.trim()}</span>
          </Fragment>
        ))}
      </span>
    ),
  )
}

/** 설정 순서(`GpsNote.steps`) — 한 단계면 번호 없이 한 줄, 두 단계 이상이면 번호 목록 */
export default function GpsSteps({ steps, className = '' }: { steps: string[]; className?: string }) {
  return (
    <div className={`gps-steps ${className}`}>
      <style>{CSS}</style>
      {steps.length === 1 ? (
        <p>{renderStep(steps[0])}</p>
      ) : (
        <ol>
          {steps.map((step, i) => (
            <li key={i}>{renderStep(step)}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
