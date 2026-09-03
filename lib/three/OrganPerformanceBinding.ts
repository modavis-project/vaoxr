import * as THREE from "three";
import type { InstrumentManifest, PerformanceTimeline } from "@/lib/content";

type PerformanceSync = InstrumentManifest["performance"]["sync"];

export class OrganPerformanceBinding {
  private readonly nodes = new Map<string, { object: THREE.Object3D; base: THREE.Euler }>();
  constructor(private readonly model: THREE.Object3D, readonly timeline: PerformanceTimeline, private readonly sync: PerformanceSync) {
    for (const track of timeline.tracks) {
      const object = model.getObjectByName(track.node);
      if (object) this.nodes.set(track.node, { object, base: object.rotation.clone() });
    }
  }

  setTime(audioTime: number) {
    const animationTime = mapAudioToAnimationTime(audioTime, this.timeline.sourceDurationSeconds, this.sync.audioTimeAtAnimationStartSeconds);
    for (const track of this.timeline.tracks) {
      const target = this.nodes.get(track.node); if (!target) continue;
      let lower = track.keys[0]; let upper = track.keys[track.keys.length - 1];
      for (let index = 1; index < track.keys.length; index += 1) {
        if (track.keys[index][0] >= animationTime) { upper = track.keys[index]; lower = track.keys[index - 1]; break; }
      }
      const span = upper[0] - lower[0]; const amount = span > 0 ? Math.max(0, Math.min(1, (animationTime - lower[0]) / span)) : 0;
      target.object.rotation.set(
        target.base.x + THREE.MathUtils.degToRad(THREE.MathUtils.lerp(lower[1], upper[1], amount)),
        target.base.y + THREE.MathUtils.degToRad(THREE.MathUtils.lerp(lower[2], upper[2], amount)),
        target.base.z + THREE.MathUtils.degToRad(THREE.MathUtils.lerp(lower[3], upper[3], amount)),
        target.base.order,
      );
    }
  }
}

export function mapAudioToAnimationTime(audioTime: number, animationDuration: number, audioTimeAtAnimationStart = 0) {
  return Math.max(0, Math.min(animationDuration, audioTime - audioTimeAtAnimationStart));
}
