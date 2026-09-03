import * as THREE from "three";
import type { WebAudioEngine } from "@/lib/audio/WebAudioEngine";
import { instrument } from "@/lib/content";

const fingertipJoints = [
  "thumb-tip",
  "index-finger-tip",
  "middle-finger-tip",
  "ring-finger-tip",
  "pinky-finger-tip",
] as const satisfies readonly XRHandJoint[];

// GLTFLoader removes dots from Object3D.name because they are reserved by
// Three.js animation bindings, but preserves the authored name in userData.
const keyNamePattern = /^M1\.?([0-9]{2,3})$/;
const stopNamePattern = /^REG\.?([1-5])$/;
const questStopIds = ["ged", "princ4", "princ2", "qui223", "reg8"] as const;
const fallbackStopMotionDegrees = [34, -28, -34, -40, 32] as const;
const keyPressRadians = THREE.MathUtils.degToRad(4);
const minimumDownwardVelocity = 0.015;

export interface QuestKeySurface {
  midi: number;
  bounds: THREE.Box3;
}

export interface QuestStopSurface {
  stopId: string;
  index: number;
  bounds: THREE.Box3;
}

interface QuestKeyTarget extends QuestKeySurface {
  node: THREE.Object3D;
  restQuaternion: THREE.Quaternion;
  pressedQuaternion: THREE.Quaternion;
  pressAmount: number;
}

interface QuestStopTarget extends QuestStopSurface {
  node: THREE.Object3D;
  restQuaternion: THREE.Quaternion;
  activeQuaternion: THREE.Quaternion;
  activationAmount: number;
}

interface FingerState {
  sourceId: number;
  position: THREE.Vector3;
  previousPosition?: THREE.Vector3;
  midi?: number;
  stopId?: string;
  cooldownSeconds: number;
}

export interface QuestHandPlayerState {
  trackedHands: number;
  activeNotes: readonly number[];
  activeStopIds: readonly string[];
}

function authoredNodeName(node: Pick<THREE.Object3D, "name" | "userData">) {
  return typeof node.userData.name === "string" ? node.userData.name : node.name;
}

export function questKeyMidiFromNode(node: Pick<THREE.Object3D, "name" | "userData">) {
  const authoredName = authoredNodeName(node);
  const match = keyNamePattern.exec(authoredName) ?? keyNamePattern.exec(node.name);
  return match ? Number(match[1]) : undefined;
}

export function questStopIndexFromNode(node: Pick<THREE.Object3D, "name" | "userData">) {
  const authoredName = authoredNodeName(node);
  const match = stopNamePattern.exec(authoredName) ?? stopNamePattern.exec(node.name);
  return match ? Number(match[1]) : undefined;
}

function horizontalDistanceSquared(point: THREE.Vector3, bounds: THREE.Box3) {
  const closestX = THREE.MathUtils.clamp(point.x, bounds.min.x, bounds.max.x);
  const closestZ = THREE.MathUtils.clamp(point.z, bounds.min.z, bounds.max.z);
  const deltaX = point.x - closestX;
  const deltaZ = point.z - closestZ;
  return deltaX * deltaX + deltaZ * deltaZ;
}

/** Selects one physical key under a fingertip, preferring the raised key when
 * black and white key volumes overlap. Exported for deterministic tests. */
export function selectQuestKeySurface(point: THREE.Vector3, radius: number, keys: readonly QuestKeySurface[]) {
  let selected: QuestKeySurface | undefined;
  let selectedScore = Infinity;
  for (const key of keys) {
    if (point.y < key.bounds.min.y - radius - 0.012 || point.y > key.bounds.max.y + radius + 0.028) continue;
    const horizontalDistance = horizontalDistanceSquared(point, key.bounds);
    if (horizontalDistance > radius * radius) continue;
    const verticalDistance = Math.abs(point.y - key.bounds.max.y);
    const score = horizontalDistance + verticalDistance * verticalDistance * 0.04;
    if (score < selectedScore - 1e-7 || (Math.abs(score - selectedScore) <= 1e-7 && key.bounds.max.y > (selected?.bounds.max.y ?? -Infinity))) {
      selected = key;
      selectedScore = score;
    }
  }
  return selected;
}

export function isQuestKeyContactHeld(point: THREE.Vector3, radius: number, key: QuestKeySurface) {
  if (point.y > key.bounds.max.y + radius + 0.007 || point.y < key.bounds.min.y - radius - 0.012) return false;
  const releaseRadius = radius + 0.004;
  return horizontalDistanceSquared(point, key.bounds) <= releaseRadius * releaseRadius;
}

export function selectQuestStopSurface(point: THREE.Vector3, radius: number, stops: readonly QuestStopSurface[]) {
  let selected: QuestStopSurface | undefined;
  let selectedDistance = Infinity;
  for (const stop of stops) {
    const distance = stop.bounds.distanceToPoint(point);
    if (distance > radius + 0.012 || distance >= selectedDistance) continue;
    selected = stop;
    selectedDistance = distance;
  }
  return selected;
}

export function isQuestStopContactHeld(point: THREE.Vector3, radius: number, stop: QuestStopSurface) {
  return stop.bounds.distanceToPoint(point) <= radius + 0.02;
}

function midiLabel(midi: number) {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export class QuestHandPlayer {
  private readonly keys: QuestKeyTarget[];
  private readonly stops: QuestStopTarget[];
  private readonly keysByMidi = new Map<number, QuestKeyTarget>();
  private readonly stopsById = new Map<string, QuestStopTarget>();
  private readonly keyContacts = new Map<number, Set<string>>();
  private readonly fingers = new Map<string, FingerState>();
  private readonly controllerContacts = new Map<XRInputSource, string>();
  private readonly sourceIds = new WeakMap<XRInputSource, number>();
  private readonly activeStopIds = new Set<string>();
  private nextSourceId = 1;
  private keyboardBounds = new THREE.Box3();
  private stopBounds = new THREE.Box3();
  private fingertipIndicators: THREE.InstancedMesh;
  private lastTrackedHands = -1;
  private lastActiveSignature = "";
  private enabled = false;
  private readonly localPoint = new THREE.Vector3();
  private readonly worldPoint = new THREE.Vector3();
  private readonly worldScale = new THREE.Vector3();
  private readonly indicatorMatrix = new THREE.Matrix4();
  private readonly indicatorQuaternion = new THREE.Quaternion();
  private readonly zeroScale = new THREE.Vector3(0, 0, 0);
  private readonly indicatorScale = new THREE.Vector3(1, 1, 1);
  private readonly ray = new THREE.Ray();
  private readonly rayHit = new THREE.Vector3();
  private readonly inverseModelMatrix = new THREE.Matrix4();
  private readonly rayQuaternion = new THREE.Quaternion();
  private readonly idleColour = new THREE.Color(0xf6d29a);
  private readonly activeColour = new THREE.Color(0x83d3a1);

  constructor(
    private readonly model: THREE.Group,
    scene: THREE.Scene,
    private readonly engine: WebAudioEngine,
    initialStopIds: readonly string[],
    private readonly onState: (state: QuestHandPlayerState) => void,
    performanceAnimation?: THREE.AnimationClip,
  ) {
    this.model.updateWorldMatrix(true, true);
    this.keys = instrumentKeyTargets(model);
    this.stops = instrumentStopTargets(model, performanceAnimation);
    const availableMidi = new Set(this.keys.map((key) => key.midi));
    const missingMidi = instrument.notes.filter((midi) => !availableMidi.has(midi));
    if (missingMidi.length) throw new Error(`The Quest delivery model is missing playable M1 key segments: ${missingMidi.join(", ")}`);
    const availableStops = new Set(this.stops.map((stop) => stop.stopId));
    const missingStops = questStopIds.filter((stopId) => !availableStops.has(stopId));
    if (missingStops.length) throw new Error(`The Quest delivery model is missing physical register controls: ${missingStops.join(", ")}`);

    initialStopIds.filter((stopId) => availableStops.has(stopId)).forEach((stopId) => this.activeStopIds.add(stopId));
    this.keys.forEach((key) => {
      this.keysByMidi.set(key.midi, key);
      this.keyboardBounds.union(key.bounds);
    });
    this.stops.forEach((stop) => {
      this.stopsById.set(stop.stopId, stop);
      this.stopBounds.union(stop.bounds);
      stop.activationAmount = this.activeStopIds.has(stop.stopId) ? 1 : 0;
      stop.node.quaternion.copy(stop.activationAmount ? stop.activeQuaternion : stop.restQuaternion);
    });
    this.keyboardBounds.expandByScalar(0.055);
    this.stopBounds.expandByScalar(0.04);

    const geometry = new THREE.SphereGeometry(0.0075, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthTest: true });
    const indicators = new THREE.InstancedMesh(geometry, material, fingertipJoints.length * 2);
    indicators.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    indicators.frustumCulled = false;
    for (let index = 0; index < fingertipJoints.length * 2; index += 1) {
      indicators.setMatrixAt(index, this.indicatorMatrix.compose(this.worldPoint, this.indicatorQuaternion, this.zeroScale));
      indicators.setColorAt(index, this.idleColour);
    }
    indicators.instanceMatrix.needsUpdate = true;
    if (indicators.instanceColor) indicators.instanceColor.needsUpdate = true;
    this.fingertipIndicators = indicators;
    scene.add(indicators);
  }

  update(frame: XRFrame, referenceSpace: XRReferenceSpace, inputSources: XRInputSourceArray, deltaSeconds: number) {
    if (!this.enabled) return;
    this.model.updateWorldMatrix(true, false);
    const modelScale = Math.max(0.0001, this.model.getWorldScale(this.worldScale).x);
    const seenFingers = new Set<string>();
    let trackedHands = 0;
    let indicatorIndex = 0;

    for (const source of inputSources) {
      if (!source.hand || !frame.getJointPose) continue;
      const sourceId = this.getSourceId(source);
      let sourceTracked = false;
      for (const jointName of fingertipJoints) {
        const joint = source.hand.get(jointName);
        const pose = joint && frame.getJointPose(joint, referenceSpace);
        if (!pose) continue;
        sourceTracked = true;
        const contactId = `${sourceId}:${jointName}`;
        seenFingers.add(contactId);
        this.worldPoint.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
        this.localPoint.copy(this.worldPoint);
        this.model.worldToLocal(this.localPoint);
        const radius = THREE.MathUtils.clamp(pose.radius ?? 0.008, 0.004, 0.014) / modelScale;
        const finger = this.fingers.get(contactId) ?? {
          sourceId,
          position: this.localPoint.clone(),
          cooldownSeconds: 0,
        };
        finger.previousPosition ??= new THREE.Vector3();
        finger.previousPosition.copy(finger.position);
        finger.cooldownSeconds = Math.max(0, finger.cooldownSeconds - deltaSeconds);
        this.updateFinger(contactId, finger, radius, deltaSeconds, minimumDownwardVelocity / modelScale);
        finger.position.copy(this.localPoint);
        this.fingers.set(contactId, finger);

        const scale = (pose.radius ?? 0.008) / 0.0075;
        this.indicatorScale.setScalar(scale);
        this.indicatorMatrix.compose(this.worldPoint, this.indicatorQuaternion, this.indicatorScale);
        this.fingertipIndicators.setMatrixAt(indicatorIndex, this.indicatorMatrix);
        this.fingertipIndicators.setColorAt(indicatorIndex, finger.midi === undefined && finger.stopId === undefined ? this.idleColour : this.activeColour);
        indicatorIndex += 1;
      }
      if (sourceTracked) trackedHands += 1;
    }

    for (const [contactId, finger] of this.fingers) {
      if (seenFingers.has(contactId)) continue;
      this.releaseContact(contactId, finger);
      this.fingers.delete(contactId);
    }
    while (indicatorIndex < fingertipJoints.length * 2) {
      this.indicatorMatrix.compose(this.worldPoint, this.indicatorQuaternion, this.zeroScale);
      this.fingertipIndicators.setMatrixAt(indicatorIndex, this.indicatorMatrix);
      indicatorIndex += 1;
    }
    this.fingertipIndicators.instanceMatrix.needsUpdate = true;
    if (this.fingertipIndicators.instanceColor) this.fingertipIndicators.instanceColor.needsUpdate = true;
    this.updateKeyMotion(deltaSeconds);
    this.updateStopMotion(deltaSeconds);
    this.emitState(trackedHands);
  }

  pressController(frame: XRFrame, referenceSpace: XRReferenceSpace, source: XRInputSource) {
    if (!this.enabled || source.hand || this.controllerContacts.has(source)) return false;
    const pose = frame.getPose(source.targetRaySpace, referenceSpace);
    if (!pose) return false;
    this.rayQuaternion.set(
      pose.transform.orientation.x,
      pose.transform.orientation.y,
      pose.transform.orientation.z,
      pose.transform.orientation.w,
    );
    this.ray.origin.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    this.ray.direction.set(0, 0, -1).applyQuaternion(this.rayQuaternion).normalize();
    this.inverseModelMatrix.copy(this.model.matrixWorld).invert();
    this.ray.applyMatrix4(this.inverseModelMatrix);

    const stop = this.closestRayTarget(this.stops);
    const key = this.closestRayTarget(this.keys);
    if (stop && (!key || stop.distance <= key.distance)) {
      this.toggleStop(stop.target.stopId);
      return true;
    }
    if (!key) return false;
    const contactId = `controller:${this.getSourceId(source)}`;
    this.controllerContacts.set(source, contactId);
    this.pressContact(contactId, key.target.midi);
    return true;
  }

  releaseInputSource(source: XRInputSource) {
    const sourceId = this.sourceIds.get(source);
    const controllerContact = this.controllerContacts.get(source);
    if (controllerContact) {
      this.releaseContact(controllerContact);
      this.controllerContacts.delete(source);
    }
    if (sourceId === undefined) return;
    for (const [contactId, finger] of this.fingers) {
      if (finger.sourceId !== sourceId) continue;
      this.releaseContact(contactId, finger);
      this.fingers.delete(contactId);
    }
  }

  toggleStop(stopId: string) {
    if (!this.stopsById.has(stopId)) return false;
    if (this.activeStopIds.has(stopId)) {
      this.activeStopIds.delete(stopId);
      this.engine.releaseStop(stopId);
      for (const midi of this.keyContacts.keys()) this.engine.rebalanceMidi(midi, this.activeStopIds.size, 0.92);
    } else {
      this.activeStopIds.add(stopId);
      for (const midi of this.keyContacts.keys()) {
        this.engine.rebalanceMidi(midi, this.activeStopIds.size, 0.92);
        this.engine.noteOn(midi, [stopId], 0.92, this.activeStopIds.size);
      }
    }
    this.emitState(this.lastTrackedHands < 0 ? 0 : this.lastTrackedHands, true);
    return true;
  }

  panic() {
    this.engine.panic();
    this.keyContacts.clear();
    this.fingers.forEach((finger) => { finger.midi = undefined; finger.stopId = undefined; });
    this.controllerContacts.clear();
    this.updateKeyMotion(1);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) return;
    this.panic();
    this.hideIndicators();
  }

  private hideIndicators() {
    for (let index = 0; index < fingertipJoints.length * 2; index += 1) {
      this.fingertipIndicators.setMatrixAt(index, this.indicatorMatrix.compose(this.worldPoint, this.indicatorQuaternion, this.zeroScale));
    }
    this.fingertipIndicators.instanceMatrix.needsUpdate = true;
  }

  describeActiveNotes() {
    return [...this.keyContacts.keys()].sort((left, right) => left - right).map(midiLabel).join(" · ");
  }

  describeActiveStops() {
    return questStopIds.filter((stopId) => this.activeStopIds.has(stopId))
      .map((stopId) => instrument.stops.find((stop) => stop.id === stopId)?.label ?? stopId)
      .join(" + ") || "No stops active";
  }

  dispose() {
    this.panic();
    this.keys.forEach((key) => key.node.quaternion.copy(key.restQuaternion));
    this.stops.forEach((stop) => stop.node.quaternion.copy(stop.restQuaternion));
    this.fingertipIndicators.removeFromParent();
    this.fingertipIndicators.geometry.dispose();
    if (Array.isArray(this.fingertipIndicators.material)) this.fingertipIndicators.material.forEach((material) => material.dispose());
    else this.fingertipIndicators.material.dispose();
  }

  private updateFinger(contactId: string, finger: FingerState, radius: number, deltaSeconds: number, downwardVelocityThreshold: number) {
    const currentStop = finger.stopId === undefined ? undefined : this.stopsById.get(finger.stopId);
    if (currentStop && isQuestStopContactHeld(this.localPoint, radius, currentStop)) return;
    if (currentStop) {
      finger.stopId = undefined;
      finger.cooldownSeconds = 0.08;
    }

    const currentKey = finger.midi === undefined ? undefined : this.keysByMidi.get(finger.midi);
    if (currentKey && isQuestKeyContactHeld(this.localPoint, radius, currentKey)) return;
    if (currentKey) {
      this.releaseContact(contactId, finger);
      finger.cooldownSeconds = 0.035;
    }
    if (finger.cooldownSeconds > 0) return;

    if (this.stopBounds.containsPoint(this.localPoint)) {
      const candidate = selectQuestStopSurface(this.localPoint, radius, this.stops) as QuestStopTarget | undefined;
      if (candidate && finger.previousPosition && !isQuestStopContactHeld(finger.previousPosition, radius, candidate)) {
        finger.stopId = candidate.stopId;
        this.toggleStop(candidate.stopId);
        return;
      }
    }

    if (!this.keyboardBounds.containsPoint(this.localPoint)) return;
    const candidate = selectQuestKeySurface(this.localPoint, radius, this.keys) as QuestKeyTarget | undefined;
    if (!candidate || !finger.previousPosition || deltaSeconds <= 0) return;
    const pressPlane = candidate.bounds.max.y + radius * 0.82;
    const crossedPlane = finger.previousPosition.y > pressPlane + 0.0008 && this.localPoint.y <= pressPlane;
    const downwardVelocity = (this.localPoint.y - finger.previousPosition.y) / deltaSeconds;
    const approachedFromAbove = finger.previousPosition.y > candidate.bounds.max.y + radius * 0.35;
    const deepEnough = this.localPoint.y <= pressPlane;
    if (deepEnough && approachedFromAbove && (crossedPlane || downwardVelocity <= -downwardVelocityThreshold)) {
      this.pressContact(contactId, candidate.midi, finger);
    }
  }

  private pressContact(contactId: string, midi: number, finger?: FingerState) {
    const contacts = this.keyContacts.get(midi) ?? new Set<string>();
    const wasIdle = contacts.size === 0;
    contacts.add(contactId);
    this.keyContacts.set(midi, contacts);
    if (finger) finger.midi = midi;
    if (wasIdle && this.activeStopIds.size) this.engine.noteOn(midi, [...this.activeStopIds], 0.92);
  }

  private releaseContact(contactId: string, finger?: FingerState) {
    const midi = finger?.midi ?? [...this.keyContacts].find(([, contacts]) => contacts.has(contactId))?.[0];
    if (midi !== undefined) {
      const contacts = this.keyContacts.get(midi);
      contacts?.delete(contactId);
      if (!contacts?.size) {
        this.keyContacts.delete(midi);
        this.engine.noteOff(midi);
      }
    }
    if (finger) {
      finger.midi = undefined;
      finger.stopId = undefined;
    }
  }

  private updateKeyMotion(deltaSeconds: number) {
    for (const key of this.keys) {
      const pressed = this.keyContacts.has(key.midi);
      const speed = pressed ? 24 : 16;
      const target = pressed ? 1 : 0;
      const step = Math.min(1, Math.max(0, deltaSeconds) * speed);
      key.pressAmount = THREE.MathUtils.lerp(key.pressAmount, target, step);
      if (Math.abs(key.pressAmount - target) < 0.002) key.pressAmount = target;
      key.node.quaternion.slerpQuaternions(key.restQuaternion, key.pressedQuaternion, key.pressAmount);
    }
  }

  private updateStopMotion(deltaSeconds: number) {
    for (const stop of this.stops) {
      const target = this.activeStopIds.has(stop.stopId) ? 1 : 0;
      const step = Math.min(1, Math.max(0, deltaSeconds) * 10);
      stop.activationAmount = THREE.MathUtils.lerp(stop.activationAmount, target, step);
      if (Math.abs(stop.activationAmount - target) < 0.002) stop.activationAmount = target;
      stop.node.quaternion.slerpQuaternions(stop.restQuaternion, stop.activeQuaternion, stop.activationAmount);
    }
  }

  private closestRayTarget<T extends { bounds: THREE.Box3 }>(targets: readonly T[]) {
    let selected: { target: T; distance: number } | undefined;
    for (const target of targets) {
      const hit = this.ray.intersectBox(target.bounds, this.rayHit);
      if (!hit) continue;
      const distance = this.ray.origin.distanceToSquared(hit);
      if (!selected || distance < selected.distance) selected = { target, distance };
    }
    return selected;
  }

  private emitState(trackedHands: number, force = false) {
    const activeNotes = [...this.keyContacts.keys()].sort((left, right) => left - right);
    const activeStops = questStopIds.filter((stopId) => this.activeStopIds.has(stopId));
    const activeSignature = `${activeNotes.join(",")}|${activeStops.join(",")}`;
    if (!force && trackedHands === this.lastTrackedHands && activeSignature === this.lastActiveSignature) return;
    this.lastTrackedHands = trackedHands;
    this.lastActiveSignature = activeSignature;
    this.onState({ trackedHands, activeNotes, activeStopIds: activeStops });
  }

  private getSourceId(source: XRInputSource) {
    const existing = this.sourceIds.get(source);
    if (existing !== undefined) return existing;
    const sourceId = this.nextSourceId;
    this.nextSourceId += 1;
    this.sourceIds.set(source, sourceId);
    return sourceId;
  }
}

function objectBoundsInModelSpace(model: THREE.Group, node: THREE.Object3D) {
  const bounds = new THREE.Box3().makeEmpty();
  const inverseModelMatrix = model.matrixWorld.clone().invert();
  const relativeMatrix = new THREE.Matrix4();
  const corner = new THREE.Vector3();
  node.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    child.geometry.computeBoundingBox();
    const geometryBounds = child.geometry.boundingBox;
    if (!geometryBounds) return;
    relativeMatrix.multiplyMatrices(inverseModelMatrix, child.matrixWorld);
    for (const x of [geometryBounds.min.x, geometryBounds.max.x]) {
      for (const y of [geometryBounds.min.y, geometryBounds.max.y]) {
        for (const z of [geometryBounds.min.z, geometryBounds.max.z]) {
          bounds.expandByPoint(corner.set(x, y, z).applyMatrix4(relativeMatrix));
        }
      }
    }
  });
  return bounds;
}

function instrumentKeyTargets(model: THREE.Group): QuestKeyTarget[] {
  const targets: QuestKeyTarget[] = [];
  model.updateWorldMatrix(true, true);
  model.traverse((node) => {
    const midi = questKeyMidiFromNode(node);
    if (midi === undefined) return;
    const bounds = objectBoundsInModelSpace(model, node);
    if (bounds.isEmpty()) return;
    const restQuaternion = node.quaternion.clone();
    const restEuler = new THREE.Euler().setFromQuaternion(restQuaternion, "XYZ");
    const pressedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      restEuler.x + keyPressRadians,
      restEuler.y,
      restEuler.z,
      "XYZ",
    ));
    targets.push({ midi, bounds, node, restQuaternion, pressedQuaternion, pressAmount: 0 });
  });
  return targets.sort((left, right) => left.midi - right.midi);
}

function instrumentStopTargets(model: THREE.Group, animation?: THREE.AnimationClip): QuestStopTarget[] {
  const targets: QuestStopTarget[] = [];
  model.updateWorldMatrix(true, true);
  model.traverse((node) => {
    const index = questStopIndexFromNode(node);
    if (index === undefined) return;
    const bounds = objectBoundsInModelSpace(model, node);
    if (bounds.isEmpty()) return;
    // Cover the knob's small recorded swing while retaining one stable target
    // volume for both fingertip and controller-ray interaction states.
    bounds.expandByScalar(0.015);
    const restQuaternion = node.quaternion.clone();
    const recordedQuaternion = recordedActiveStopQuaternion(animation, node, restQuaternion);
    const restEuler = new THREE.Euler().setFromQuaternion(restQuaternion, "XYZ");
    const fallbackQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      restEuler.x,
      restEuler.y,
      restEuler.z + THREE.MathUtils.degToRad(fallbackStopMotionDegrees[index - 1]),
      "XYZ",
    ));
    targets.push({
      stopId: questStopIds[index - 1],
      index,
      bounds,
      node,
      restQuaternion,
      activeQuaternion: recordedQuaternion ?? fallbackQuaternion,
      activationAmount: 0,
    });
  });
  return targets.sort((left, right) => left.index - right.index);
}

function recordedActiveStopQuaternion(animation: THREE.AnimationClip | undefined, node: THREE.Object3D, rest: THREE.Quaternion) {
  if (!animation) return undefined;
  const normalizedNodeName = node.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const track = animation.tracks.find((candidate) => {
    if (!(candidate instanceof THREE.QuaternionKeyframeTrack) || !candidate.name.endsWith(".quaternion")) return false;
    const targetName = candidate.name.slice(0, -".quaternion".length).replace(/[^a-z0-9]/gi, "").toLowerCase();
    return targetName === normalizedNodeName;
  });
  if (!track) return undefined;
  for (let offset = 0; offset + 3 < track.values.length; offset += 4) {
    const candidate = new THREE.Quaternion(
      track.values[offset],
      track.values[offset + 1],
      track.values[offset + 2],
      track.values[offset + 3],
    ).normalize();
    if (rest.angleTo(candidate) > THREE.MathUtils.degToRad(5)) return candidate;
  }
  return undefined;
}
