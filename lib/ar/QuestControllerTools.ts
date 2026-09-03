import * as THREE from "three";

const handleHitRadiusMetres = 0.085;
const baseSpotIntensity = 16;

export const questScaleRange = { min: 0.5, max: 3.5 } as const;

type QuestLightHandleKind = "source" | "target";
type QuestControllerToolGesture = "idle" | "moving-light" | "aiming-light";

export interface QuestControllerToolsState {
  gesture: QuestControllerToolGesture;
  hoveredHandle?: QuestLightHandleKind;
}

interface LightGrab {
  source: XRInputSource;
  kind: QuestLightHandleKind;
  distance: number;
}

interface QuestControllerToolsOptions {
  onState: (state: QuestControllerToolsState) => void;
}

interface QuestLightHandlePositions {
  source: THREE.Vector3;
  target: THREE.Vector3;
}

/** Selects the closest controller-ray light handle inside a deliberately
 * larger invisible hit radius. The visible handles can therefore stay subtle. */
export function selectQuestLightHandle(
  ray: THREE.Ray,
  handles: QuestLightHandlePositions,
  radius = handleHitRadiusMetres,
) {
  let selected: { kind: QuestLightHandleKind; distance: number } | undefined;
  for (const kind of ["source", "target"] as const) {
    const centre = handles[kind];
    const deltaX = centre.x - ray.origin.x;
    const deltaY = centre.y - ray.origin.y;
    const deltaZ = centre.z - ray.origin.z;
    const distance = deltaX * ray.direction.x + deltaY * ray.direction.y + deltaZ * ray.direction.z;
    const rayDistanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ - distance * distance;
    if (distance <= 0 || rayDistanceSquared > radius * radius) continue;
    if (!selected || distance < selected.distance) selected = { kind, distance };
  }
  return selected;
}

/** Controller-only scene editing for Quest.
 *
 * Tracked hands are intentionally absent here: they remain dedicated to the
 * organ's musical controls. A trigger ray grabs either the warm source or the
 * cool aim point. The source always illuminates the aim point; moving the aim
 * point rotates the light without introducing a separate rotation gesture. */
export class QuestControllerTools {
  private readonly sourceHandle = new THREE.Group();
  private readonly targetHandle = new THREE.Group();
  private readonly sourceMaterial = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.2, depthTest: true });
  private readonly sourceRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.14, depthTest: true });
  private readonly targetMaterial = new THREE.MeshBasicMaterial({ color: 0x79ddff, transparent: true, opacity: 0.17, depthTest: true });
  private readonly beamMaterial = new THREE.LineBasicMaterial({ color: 0xffd695, transparent: true, opacity: 0.045, depthTest: true });
  private readonly beamGeometry = new THREE.BufferGeometry();
  private readonly beam: THREE.Line;
  private readonly light = new THREE.SpotLight(0xffead0, baseSpotIntensity, 10, THREE.MathUtils.degToRad(36), 0.72, 1.7);
  private readonly worldBounds = new THREE.Box3();
  private readonly worldSize = new THREE.Vector3();
  private readonly worldCenter = new THREE.Vector3();
  private readonly modelLocalTarget = new THREE.Vector3();
  private readonly modelLocalSize = new THREE.Vector3();
  private readonly modelWorldScale = new THREE.Vector3();
  private readonly modelRight = new THREE.Vector3();
  private readonly modelFront = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private readonly sourcePosition = new THREE.Vector3();
  private readonly linePositions = new Float32Array(6);
  private readonly ray = new THREE.Ray();
  private readonly rayQuaternion = new THREE.Quaternion();
  private lightGrab?: LightGrab;
  private hoveredHandle?: QuestLightHandleKind;
  private lastGesture: QuestControllerToolGesture = "idle";
  private lastHoveredHandle?: QuestLightHandleKind;
  private placed = false;
  private defaultAim = true;
  private intensity = 0.65;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly model: THREE.Group,
    private readonly options: QuestControllerToolsOptions,
  ) {
    const sourceOrb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), this.sourceMaterial);
    const sourceRing = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0035, 7, 24), this.sourceRingMaterial);
    sourceRing.rotation.x = Math.PI / 2;
    this.sourceHandle.add(sourceOrb, sourceRing);

    const targetOrb = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), this.targetMaterial);
    const targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.003, 7, 22), this.targetMaterial);
    this.targetHandle.add(targetOrb, targetRing);

    this.beamGeometry.setAttribute("position", new THREE.BufferAttribute(this.linePositions, 3));
    this.beam = new THREE.Line(this.beamGeometry, this.beamMaterial);
    this.beam.frustumCulled = false;

    this.light.target = this.targetHandle;
    this.light.castShadow = false;
    this.scene.add(this.sourceHandle, this.targetHandle, this.beam, this.light);
    this.model.updateWorldMatrix(true, true);
    this.worldBounds.setFromObject(this.model, true);
    this.worldBounds.getCenter(this.worldCenter);
    this.modelLocalTarget.copy(this.worldCenter);
    this.model.worldToLocal(this.modelLocalTarget);
    this.worldBounds.getSize(this.modelLocalSize);
    this.model.getWorldScale(this.modelWorldScale);
    this.modelLocalSize.divide(this.modelWorldScale);
    this.setPlaced(false);
    this.setIntensity(this.intensity);
  }

  update(frame: XRFrame, referenceSpace: XRReferenceSpace, inputSources: XRInputSourceArray) {
    if (!this.placed) return;
    this.updateDefaultTarget();
    if (this.lightGrab) {
      const pose = frame.getPose(this.lightGrab.source.targetRaySpace, referenceSpace);
      if (!pose || ![...inputSources].includes(this.lightGrab.source)) this.finishGrab();
      else {
        this.setRayFromPose(pose);
        const handle = this.lightGrab.kind === "source" ? this.sourceHandle : this.targetHandle;
        handle.position.copy(this.ray.at(this.lightGrab.distance, this.worldCenter));
        if (this.lightGrab.kind === "target") this.defaultAim = false;
      }
    } else {
      this.hoveredHandle = undefined;
      let nearestDistance = Infinity;
      for (const source of inputSources) {
        if (source.hand) continue;
        const pose = frame.getPose(source.targetRaySpace, referenceSpace);
        if (!pose) continue;
        this.setRayFromPose(pose);
        const selected = selectQuestLightHandle(this.ray, this.handlePositions());
        if (selected && selected.distance < nearestDistance) {
          this.hoveredHandle = selected.kind;
          nearestDistance = selected.distance;
        }
      }
    }
    this.updateVisualState();
    this.updateBeam();
    this.emitState();
  }

  pressController(frame: XRFrame, referenceSpace: XRReferenceSpace, source: XRInputSource) {
    if (!this.placed || source.hand || this.lightGrab) return false;
    const pose = frame.getPose(source.targetRaySpace, referenceSpace);
    if (!pose) return false;
    this.setRayFromPose(pose);
    const selected = selectQuestLightHandle(this.ray, this.handlePositions());
    if (!selected) return false;
    this.lightGrab = {
      source,
      kind: selected.kind,
      distance: THREE.MathUtils.clamp(selected.distance, 0.2, 6),
    };
    this.hoveredHandle = selected.kind;
    this.updateVisualState();
    this.emitState();
    return true;
  }

  releaseInputSource(source: XRInputSource) {
    if (this.lightGrab?.source === source) this.finishGrab();
  }

  setPlaced(placed: boolean) {
    this.placed = placed;
    this.sourceHandle.visible = placed;
    this.targetHandle.visible = placed;
    this.beam.visible = placed;
    this.light.visible = placed && this.intensity > 0;
    if (placed) this.resetLightPose();
    else this.finishGrab();
  }

  setIntensity(intensity: number) {
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1.5);
    this.light.intensity = baseSpotIntensity * this.intensity;
    this.light.visible = this.placed && this.intensity > 0;
    this.sourceMaterial.color.setHex(this.intensity > 0 ? 0xffc46b : 0x777777);
  }

  resetLightPose() {
    this.model.updateWorldMatrix(true, true);
    this.model.getWorldScale(this.modelWorldScale);
    this.worldSize.copy(this.modelLocalSize).multiply(this.modelWorldScale);
    this.worldCenter.copy(this.modelLocalTarget);
    this.model.localToWorld(this.worldCenter);
    this.model.getWorldQuaternion(this.rayQuaternion);
    this.modelRight.set(1, 0, 0).applyQuaternion(this.rayQuaternion).normalize();
    this.modelFront.set(0, 0, 1).applyQuaternion(this.rayQuaternion).normalize();
    this.targetHandle.position.copy(this.worldCenter).addScaledVector(THREE.Object3D.DEFAULT_UP, this.worldSize.y * 0.08);
    this.sourceHandle.position.copy(this.targetHandle.position)
      .addScaledVector(this.modelRight, Math.max(0.55, this.worldSize.x * 0.48))
      .addScaledVector(THREE.Object3D.DEFAULT_UP, Math.max(0.5, this.worldSize.y * 0.27))
      .addScaledVector(this.modelFront, Math.max(0.6, this.worldSize.z * 0.78));
    this.defaultAim = true;
    this.updateVisualState();
    this.updateBeam();
  }

  dispose() {
    this.finishGrab();
    this.sourceHandle.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.targetHandle.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.sourceMaterial.dispose();
    this.sourceRingMaterial.dispose();
    this.targetMaterial.dispose();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.sourceHandle.removeFromParent();
    this.targetHandle.removeFromParent();
    this.beam.removeFromParent();
    this.light.removeFromParent();
  }

  private handlePositions(): QuestLightHandlePositions {
    return { source: this.sourceHandle.position, target: this.targetHandle.position };
  }

  private setRayFromPose(pose: XRPose) {
    this.ray.origin.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    this.rayQuaternion.set(
      pose.transform.orientation.x,
      pose.transform.orientation.y,
      pose.transform.orientation.z,
      pose.transform.orientation.w,
    );
    this.ray.direction.set(0, 0, -1).applyQuaternion(this.rayQuaternion).normalize();
  }

  private updateDefaultTarget() {
    if (!this.defaultAim) return;
    this.model.updateWorldMatrix(true, true);
    this.targetHandle.position.copy(this.modelLocalTarget);
    this.model.localToWorld(this.targetHandle.position);
    this.model.getWorldScale(this.modelWorldScale);
    this.targetHandle.position.addScaledVector(THREE.Object3D.DEFAULT_UP, this.modelLocalSize.y * this.modelWorldScale.y * 0.08);
  }

  private updateVisualState() {
    const active = this.lightGrab?.kind;
    const sourceAttention = active === "source" || this.hoveredHandle === "source";
    const targetAttention = active === "target" || this.hoveredHandle === "target";
    this.sourceMaterial.opacity = sourceAttention ? (active ? 0.88 : 0.58) : 0.2;
    this.sourceRingMaterial.opacity = sourceAttention ? (active ? 0.7 : 0.42) : 0.14;
    this.targetMaterial.opacity = targetAttention ? (active ? 0.84 : 0.56) : 0.17;
    this.beamMaterial.opacity = active ? 0.22 : this.hoveredHandle ? 0.13 : 0.045;
  }

  private updateBeam() {
    this.sourcePosition.copy(this.sourceHandle.position);
    this.targetPosition.copy(this.targetHandle.position);
    this.light.position.copy(this.sourcePosition);
    this.linePositions[0] = this.sourcePosition.x;
    this.linePositions[1] = this.sourcePosition.y;
    this.linePositions[2] = this.sourcePosition.z;
    this.linePositions[3] = this.targetPosition.x;
    this.linePositions[4] = this.targetPosition.y;
    this.linePositions[5] = this.targetPosition.z;
    (this.beamGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.beamGeometry.computeBoundingSphere();
  }

  private finishGrab() {
    this.lightGrab = undefined;
    this.hoveredHandle = undefined;
    this.updateVisualState();
    this.emitState();
  }

  private emitState() {
    const gesture: QuestControllerToolGesture = this.lightGrab?.kind === "source"
      ? "moving-light"
      : this.lightGrab?.kind === "target" ? "aiming-light" : "idle";
    if (gesture === this.lastGesture && this.hoveredHandle === this.lastHoveredHandle) return;
    this.lastGesture = gesture;
    this.lastHoveredHandle = this.hoveredHandle;
    this.options.onState({ gesture, hoveredHandle: this.hoveredHandle });
  }
}
