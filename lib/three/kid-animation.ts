import * as THREE from 'three'
import type { RelayMotion } from '@/shared/relay/contract'

export interface KidClips {
  idle: THREE.AnimationClip
  run: THREE.AnimationClip
  air: THREE.AnimationClip
  bored: THREE.AnimationClip
}

/** 원본 animationWeights — [idle, run] + air + bored. run은 1 − idle이다 */
export interface KidAnimation {
  actions: THREE.AnimationAction[]
  idle: number
  air: number
  bored: number
}

/**
 * 네 클립을 함께 돌리고 가중치만 바꾼다 — 원본처럼 전환해도 클립이 처음부터
 * 다시 돌지 않는다. run은 원본 animationsOptions대로 1.1배속.
 */
export function createKidAnimation(mixer: THREE.AnimationMixer, clips: KidClips): KidAnimation {
  const actions = [clips.idle, clips.run, clips.air, clips.bored].map((clip, i) => {
    const action = mixer.clipAction(clip)
    if (i === 1) action.setEffectiveTimeScale(1.1)
    action.setEffectiveWeight(i === 0 ? 1 : 0)
    action.play()
    return action
  })
  return { actions, idle: 1, air: 0, bored: 0 }
}

const settle = (v: number) => (v > 0.9999 ? 1 : v < 1e-4 ? 0 : v)

/**
 * 원본 _updateAnimations — idle↔run은 수평 속도(0.001~0.045m/프레임)로 섞고,
 * 공중이면 air가, 심심하면 bored가 덮는다. 가중치는 60fps 프레임당 0.1 비율로 따라간다.
 */
export function blendKidAnimation(
  anim: KidAnimation,
  velocityHorizontal: number,
  motion: RelayMotion,
  ratio: number,
) {
  const k = 1 - Math.pow(0.9, ratio)
  const idleGoal = THREE.MathUtils.clamp(
    THREE.MathUtils.mapLinear(velocityHorizontal, 0.001, 0.045, 1, 0),
    0,
    1,
  )
  anim.idle = settle(anim.idle + (idleGoal - anim.idle) * k)
  anim.air = settle(anim.air + ((motion === 1 ? 1 : 0) - anim.air) * k)
  anim.bored = settle(anim.bored + ((motion === 2 ? 1 : 0) - anim.bored) * k)
  const base = 1 - THREE.MathUtils.clamp(anim.air + anim.bored, 0, 1)
  const [idle, run, air, bored] = anim.actions
  idle.setEffectiveWeight(anim.idle * base)
  run.setEffectiveWeight((1 - anim.idle) * base)
  air.setEffectiveWeight(anim.air * (1 - anim.bored))
  bored.setEffectiveWeight(anim.bored)
}
