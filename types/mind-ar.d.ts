declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import type { Camera, Group, Scene, WebGLRenderer } from "three";
  export type MindARAnchor = { group: Group; visible: boolean; onTargetFound: (() => void) | null; onTargetLost: (() => void) | null; onTargetUpdate: (() => void) | null };
  export class MindARThree {
    constructor(options: { container: HTMLElement; imageTargetSrc: string; maxTrack?: number; uiLoading?: "yes" | "no"; uiScanning?: "yes" | "no"; uiError?: "yes" | "no"; missTolerance?: number; warmupTolerance?: number });
    scene: Scene; camera: Camera; renderer: WebGLRenderer;
    start(): Promise<void>; stop(): void; addAnchor(index: number): MindARAnchor;
  }
}
