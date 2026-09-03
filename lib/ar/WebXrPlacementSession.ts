import * as THREE from "three";
import { loadArDeliveryAsset } from "@/lib/ar/loadArDeliveryModel";
import { instrument } from "@/lib/content";
import { beginAppActivity } from "@/lib/pwa/activity";
import { applyAxisDeadzone, immersiveFoveation, immersiveFramebufferScale, selectSustainableFrameRate } from "@/lib/ar/webXrPolicy";
import { fetchVerifiedVaoBytes } from "@/lib/vao/integrity";
import { mapAudioToAnimationTime } from "@/lib/three/OrganPerformanceBinding";
import { WebAudioEngine } from "@/lib/audio/WebAudioEngine";
import { fetchStopManifest } from "@/lib/audio/manifest";
import { QuestHandPlayer, type QuestHandPlayerState } from "@/lib/ar/QuestHandPlayer";
import { QuestControllerTools, questScaleRange, type QuestControllerToolsState } from "@/lib/ar/QuestControllerTools";

export type WebXrSessionState = "starting" | "loading" | "scanning" | "stabilizing" | "placed";
export type WebXrExperienceMode = "play" | "performance";
export interface WebXrTransform { scale: number; rotation: number; volume: number; lightIntensity: number; animationPlaying: boolean; mode: WebXrExperienceMode; }
interface WebXrSessionOptions { mode?: WebXrExperienceMode; stopId?: string; }
type HapticGamepad = Gamepad & { hapticActuators?: Array<{ pulse: (intensity: number, duration: number) => Promise<boolean> }>; };
interface PlacementCandidate { hit: XRHitTestResult; pose: XRPose; position: THREE.Vector3; inputSource?: XRInputSource; }
type XrLightProbeLike = EventTarget;
interface XrLightEstimateLike {
  sphericalHarmonicsCoefficients: Float32Array;
  primaryLightDirection: DOMPointReadOnly;
  primaryLightIntensity: DOMPointReadOnly;
}
type LightEstimatingSession = XRSession & { requestLightProbe?: () => Promise<XrLightProbeLike>; };
type LightEstimatingFrame = XRFrame & { getLightEstimate?: (probe: XrLightProbeLike) => XrLightEstimateLike | null; };

const worldUp = new THREE.Vector3(0, 1, 0);
const floorNormalThreshold = Math.cos(THREE.MathUtils.degToRad(28));
const stableSampleCount = 7;
const stableRadiusMetres = 0.055;

export class WebXrPlacementSession {
  private renderer?: THREE.WebGLRenderer;
  private session?: XRSession;
  private scene?: THREE.Scene;
  private model?: THREE.Group;
  private reticle?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private viewerHitSource?: XRHitTestSource;
  private readonly inputHitSources = new Map<XRInputSource, XRHitTestSource>();
  private readonly inputCandidates = new Map<XRInputSource, PlacementCandidate>();
  private referenceSpace?: XRReferenceSpace;
  private latestCandidate?: PlacementCandidate;
  private stableCandidate?: PlacementCandidate;
  private stableSamples: THREE.Vector3[] = [];
  private anchor?: XRAnchor;
  private placed = false;
  private scale = 1;
  private rotation = 0;
  private viewerPosition = new THREE.Vector3();
  private previousFrameTime?: number;
  private controllerVisuals: THREE.Group[] = [];
  private readonly buttonStates = new Map<string, boolean>();
  private mixer?: THREE.AnimationMixer;
  private animationAction?: THREE.AnimationAction;
  private animationPlaying = true;
  private audioListener?: THREE.AudioListener;
  private performanceAudio?: THREE.PositionalAudio;
  private performanceDuration = instrument.performance.durationSeconds;
  private performanceOffset = 0;
  private performanceStartedAt?: number;
  private volume = 0.85;
  private lightIntensity = 0.65;
  private liveAudioBus?: THREE.PositionalAudio;
  private liveAudioEngine?: WebAudioEngine;
  private handPlayer?: QuestHandPlayer;
  private controllerTools?: QuestControllerTools;
  private readonly assetAbortController = new AbortController();
  private ambientLight?: THREE.HemisphereLight;
  private keyLight?: THREE.DirectionalLight;
  private fillLight?: THREE.DirectionalLight;
  private rimLight?: THREE.DirectionalLight;
  private estimatedLightProbe?: THREE.LightProbe;
  private estimatedKeyLight?: THREE.DirectionalLight;
  private xrLightProbe?: XrLightProbeLike;
  private lightEstimateActive = false;
  private currentState: WebXrSessionState = "starting";
  private hud?: THREE.Sprite;
  private hudCanvas?: HTMLCanvasElement;
  private hudHideAt = Infinity;
  private selectHandler = (event: XRInputSourceEvent) => { if (!this.placed) this.place(); this.pulse(event.inputSource); };
  private selectStartHandler = (event: XRInputSourceEvent) => {
    if (!this.placed || !this.referenceSpace) return;
    if (this.controllerTools?.pressController(event.frame, this.referenceSpace, event.inputSource)) {
      this.pulse(event.inputSource);
      return;
    }
    if (this.mode === "play" && this.handPlayer?.pressController(event.frame, this.referenceSpace, event.inputSource)) this.pulse(event.inputSource);
  };
  private selectEndHandler = (event: XRInputSourceEvent) => {
    this.controllerTools?.releaseInputSource(event.inputSource);
    this.handPlayer?.releaseInputSource(event.inputSource);
  };
  private squeezeHandler = (event: XRInputSourceEvent) => { if (this.placed) this.move(); this.pulse(event.inputSource); };
  private inputSourcesHandler = (event: XRInputSourcesChangeEvent) => {
    event.removed.forEach((source) => {
      this.controllerTools?.releaseInputSource(source);
      this.handPlayer?.releaseInputSource(source);
      this.removeInputSource(source);
    });
    event.added.forEach((source) => void this.addInputSource(source));
  };
  private visibilityHandler = () => {
    if (this.mode !== "play" || !this.session) return;
    if (this.session.visibilityState === "visible" && this.placed) this.handPlayer?.setEnabled(true);
    else this.handPlayer?.setEnabled(false);
  };
  private endHandler = () => { this.disposeRuntime(); this.onEnded(); };
  private endActivity?: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (state: WebXrSessionState) => void,
    private readonly onTransform: (transform: WebXrTransform) => void,
    private readonly onEnded: () => void,
    private readonly options: WebXrSessionOptions = {},
  ) {
    this.animationPlaying = this.mode === "performance";
  }

  private get mode(): WebXrExperienceMode { return this.options.mode ?? "performance"; }
  private get stopId() { return this.options.stopId ?? instrument.stops.find((stop) => stop.defaultSelected)?.id ?? instrument.stops[0].id; }

  async start() {
    if (!navigator.xr) throw new Error("webxr-unavailable");
    // Resume Web Audio from the same user gesture used to enter XR. Do not
    // await it before requestSession(), because Quest requires that request to
    // retain the entry button's transient user activation too.
    // @types/three currently types the returned native context as the manager
    // class itself; the runtime value is the browser's Web Audio context.
    const audioContext = this.getAudioContext();
    const audioResume = audioContext.resume().catch(() => undefined);
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test", "local-floor"],
      optionalFeatures: ["anchors", "plane-detection", "hand-tracking", "light-estimation", "high-fixed-foveation-level", "layers"],
    });

    this.session = session;
    this.endActivity = beginAppActivity();
    session.addEventListener("end", this.endHandler, { once: true });
    session.addEventListener("select", this.selectHandler);
    session.addEventListener("selectstart", this.selectStartHandler);
    session.addEventListener("selectend", this.selectEndHandler);
    session.addEventListener("squeeze", this.squeezeHandler);
    session.addEventListener("inputsourceschange", this.inputSourcesHandler);
    session.addEventListener("visibilitychange", this.visibilityHandler);
    this.setState("loading");

    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    renderer.xr.setFramebufferScaleFactor(immersiveFramebufferScale);
    renderer.setPixelRatio(1);
    renderer.setSize(innerWidth, innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping retains the photographed wood/metal colours in
    // passthrough, while the exposure leaves enough headroom for estimated
    // real-world key lights without crushing the cabinet's dark materials.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.22;
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation(immersiveFoveation);

    const targetFrameRate = selectSustainableFrameRate(session.supportedFrameRates);
    if (targetFrameRate && session.updateTargetFrameRate && session.frameRate !== targetFrameRate) {
      await session.updateTargetFrameRate(targetFrameRate).catch(() => undefined);
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    this.scene = scene;
    const listener = new THREE.AudioListener();
    this.audioListener = listener;
    camera.add(listener);
    this.createAdaptiveLighting(scene, session);
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd9ae77, transparent: true, opacity: 0.92 }),
    );
    reticle.visible = false; reticle.renderOrder = 20; this.reticle = reticle; scene.add(reticle);
    this.createHud(scene);

    for (let index = 0; index < 2; index += 1) {
      const controller = renderer.xr.getController(index);
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }));
      line.scale.z = 2.5; controller.add(line); scene.add(controller); this.controllerVisuals.push(controller);
    }

    try { this.referenceSpace = await session.requestReferenceSpace("local-floor"); }
    catch { this.referenceSpace = await session.requestReferenceSpace("local"); }
    const viewerSpace = await session.requestReferenceSpace("viewer");
    if (!session.requestHitTestSource) throw new Error("hit-test-unavailable");
    this.viewerHitSource = await session.requestHitTestSource({ space: viewerSpace, entityTypes: ["plane"] });
    session.inputSources.forEach((source) => void this.addInputSource(source));

    renderer.setAnimationLoop((time, frame) => {
      const deltaSeconds = this.previousFrameTime === undefined ? 0 : Math.min((time - this.previousFrameTime) / 1000, 0.05);
      this.previousFrameTime = time;
      this.updateViewerPose(frame); this.updateHitTest(frame); this.updateAnchor(frame); this.updateControllerInput(deltaSeconds);
      if (frame && this.referenceSpace && this.placed) {
        this.controllerTools?.update(frame, this.referenceSpace, session.inputSources);
        this.handPlayer?.update(frame, this.referenceSpace, session.inputSources, deltaSeconds);
      }
      this.updateAdaptiveLighting(frame, deltaSeconds);
      this.updatePerformance(deltaSeconds);
      this.updateHud(time); renderer.render(scene, camera);
    });

    await audioResume;
    const selectedStop = instrument.stops.find((stop) => stop.id === this.stopId);
    if (this.mode === "play" && !selectedStop) throw new Error(`Unknown Quest organ stop: ${this.stopId}`);
    const [asset, audioBuffer, stopManifests] = await Promise.all([
      loadArDeliveryAsset(),
      this.mode === "performance" ? fetchVerifiedVaoBytes(instrument.performance.audioRealizationId, this.assetAbortController.signal)
        .then((bytes) => audioContext.decodeAudioData(bytes.slice(0)))
        .catch((error) => {
          console.warn("[vaoXR WebXR] Verified performance audio could not be decoded", error);
          return undefined;
        }) : Promise.resolve(undefined),
      this.mode === "play"
        ? Promise.all(instrument.stops.map((stop) => fetchStopManifest(stop.manifestRealizationId, this.assetAbortController.signal)))
        : Promise.resolve([]),
    ]);
    const organ = asset.scene;
    const box = new THREE.Box3().setFromObject(organ);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    organ.position.sub(center); organ.position.y += size.y / 2;
    const model = new THREE.Group();
    // The Quest/iOS derivative is already baked into metres. Applying the
    // manifest width a second time made the experience dependent on an
    // unverified bounding-box measurement and broke physical calibration.
    model.userData.baseScale = 1;
    model.visible = false; model.add(organ); scene.add(model); this.model = model; this.applyTransform();
    this.controllerTools = new QuestControllerTools(scene, model, {
      onState: (state) => this.onControllerToolsState(state),
    });
    this.controllerTools.setIntensity(this.lightIntensity);
    if (audioBuffer) {
      const audio = new THREE.PositionalAudio(listener);
      audio.setBuffer(audioBuffer);
      audio.setLoop(false);
      audio.setVolume(this.volume);
      audio.setDistanceModel("inverse");
      audio.setRefDistance(3);
      audio.setRolloffFactor(0.5);
      audio.setMaxDistance(20);
      audio.position.set(0, size.y * 0.35, size.z * 0.2);
      model.add(audio);
      this.performanceAudio = audio;
      this.performanceDuration = audioBuffer.duration;
    }
    if (this.mode === "performance" && asset.animations[0]) {
      this.mixer = new THREE.AnimationMixer(organ);
      this.animationAction = this.mixer.clipAction(asset.animations[0]);
      this.animationAction.setLoop(THREE.LoopOnce, 1);
      this.animationAction.clampWhenFinished = true;
      this.animationAction.play();
      this.animationAction.paused = true;
    }
    if (this.mode === "play" && stopManifests.length) {
      const liveBus = new THREE.PositionalAudio(listener);
      liveBus.setDistanceModel("inverse");
      liveBus.setRefDistance(2.4);
      liveBus.setRolloffFactor(0.45);
      liveBus.setMaxDistance(18);
      liveBus.position.set(0, size.y * 0.38, size.z * 0.2);
      model.add(liveBus);
      // Prewarm every note of the chosen initial rank while loading one centre
      // note for the other ranks. The bounded cache keeps first-play latency
      // low without decoding all five complete ranks into Quest memory.
      const engine = new WebAudioEngine(audioContext, liveBus.getOutput(), 116 * 1024 * 1024);
      this.liveAudioBus = liveBus;
      this.liveAudioEngine = engine;
      await engine.unlock();
      engine.setMasterGain(this.volume);
      await Promise.all(stopManifests.map((manifest) => engine.loadStop(manifest, this.assetAbortController.signal)));
      const initialManifest = stopManifests.find((manifest) => manifest.stopId === this.stopId) ?? stopManifests[0];
      await engine.preloadNotes(initialManifest.stopId, instrument.notes, this.assetAbortController.signal, 6);
      this.handPlayer = new QuestHandPlayer(
        model,
        scene,
        engine,
        [initialManifest.stopId],
        (state) => this.onHandPlayerState(state),
        asset.animations[0],
      );
    }
    this.emitTransform(); this.setState("scanning");
  }

  place() {
    if (this.placed || !this.model) return;
    // Anchor exactly the stabilized point shown by the green reticle. A
    // different controller may emit select, but must not cause a late jump to
    // its latest (unstabilized) hit result.
    const candidate = this.stableCandidate;
    if (!candidate || this.stableSamples.length < stableSampleCount) return;
    this.model.position.copy(this.averageStablePosition()); this.model.visible = true; this.placed = true;
    if (this.reticle) this.reticle.visible = false;
    this.faceViewer(); this.controllerTools?.setPlaced(true); this.setState("placed"); this.hudHideAt = performance.now() + 12_000;
    if (this.mode === "performance") this.restartPerformance();
    else {
      this.handPlayer?.setEnabled(true);
      this.drawHud("Hands play keys and stops · left stick scales · point + trigger edits the light");
    }
    if (candidate.hit.createAnchor) {
      void candidate.hit.createAnchor().then((anchor) => {
        if (!this.placed) { anchor.delete(); return; }
        this.anchor?.delete(); this.anchor = anchor;
      }).catch(() => undefined);
    }
  }

  move() {
    this.handPlayer?.setEnabled(false);
    this.controllerTools?.setPlaced(false);
    this.stopPerformance();
    this.performanceOffset = 0;
    this.anchor?.delete(); this.anchor = undefined; this.placed = false; this.stableSamples = []; this.stableCandidate = undefined;
    if (this.model) this.model.visible = false;
    this.hudHideAt = Infinity; this.setState(this.model ? "scanning" : "loading");
  }

  reset() {
    this.scale = 1; this.rotation = 0; this.animationPlaying = this.mode === "performance"; this.performanceOffset = 0; this.emitTransform(); this.move();
  }

  setScale(scale: number, showHud = true) {
    this.scale = THREE.MathUtils.clamp(scale, questScaleRange.min, questScaleRange.max);
    this.applyTransform(); this.emitTransform();
    if (showHud) this.showPlacedHud();
  }
  setRotation(degrees: number) { this.rotation = this.normalizeDegrees(degrees); this.applyTransform(); this.emitTransform(); }
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.performanceAudio?.setVolume(this.volume);
    this.liveAudioEngine?.setMasterGain(this.volume);
    this.emitTransform(); this.showPlacedHud();
  }
  setLightIntensity(intensity: number) {
    this.lightIntensity = THREE.MathUtils.clamp(intensity, 0, 1.5);
    this.controllerTools?.setIntensity(this.lightIntensity);
    this.emitTransform(); this.showPlacedHud();
  }
  resetArtificialLight() { this.controllerTools?.resetLightPose(); this.showPlacedHud(); }

  faceViewer() {
    if (!this.model) return;
    const direction = this.viewerPosition.clone().sub(this.model.position); direction.y = 0;
    if (direction.lengthSq() < 0.0001) return;
    // glTF and Scene Viewer define the asset front as +Z.
    this.rotation = this.normalizeDegrees(THREE.MathUtils.radToDeg(Math.atan2(direction.x, direction.z)));
    this.applyTransform(); this.emitTransform(); this.showPlacedHud();
  }

  toggleAnimation() {
    if (this.mode !== "performance") return;
    if (!this.animationAction) return;
    if (this.animationPlaying) {
      this.performanceOffset = this.currentPerformanceTime();
      this.animationPlaying = false;
      this.stopPerformance();
      this.animationAction.paused = true;
      this.mixer?.setTime(mapAudioToAnimationTime(
        this.performanceOffset,
        instrument.performance.animationDurationSeconds,
        instrument.performance.sync.audioTimeAtAnimationStartSeconds,
      ));
    } else {
      this.animationPlaying = true;
      this.startPerformance();
    }
    this.emitTransform(); this.showPlacedHud();
  }

  restartAnimation() { if (this.mode === "performance") this.restartPerformance(); this.emitTransform(); this.showPlacedHud(); }

  async end() { if (this.session) await this.session.end().catch(() => this.disposeRuntime()); else this.disposeRuntime(); }

  private async addInputSource(source: XRInputSource) {
    if (!this.session?.requestHitTestSource || this.inputHitSources.has(source)) return;
    try {
      const hitSource = await this.session.requestHitTestSource({ space: source.targetRaySpace, entityTypes: ["plane"] });
      if (hitSource) this.inputHitSources.set(source, hitSource);
    } catch { /* Viewer-space placement remains available. */ }
  }

  private removeInputSource(source: XRInputSource) {
    this.inputHitSources.get(source)?.cancel(); this.inputHitSources.delete(source); this.inputCandidates.delete(source);
  }

  private updateViewerPose(frame?: XRFrame) {
    if (!frame || !this.referenceSpace) return;
    const pose = frame.getViewerPose(this.referenceSpace); if (!pose) return;
    this.viewerPosition.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    if (!this.hud) return;
    const q = new THREE.Quaternion(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
    this.hud.position.copy(this.viewerPosition).add(new THREE.Vector3(0, -0.34, -1.15).applyQuaternion(q)); this.hud.quaternion.copy(q);
  }

  private updateHitTest(frame?: XRFrame) {
    if (!frame || !this.referenceSpace || !this.reticle || this.placed) return;
    this.inputCandidates.clear();
    const preferredSources = [...this.inputHitSources.keys()].sort((left, right) => left.handedness === "right" ? -1 : right.handedness === "right" ? 1 : 0);
    let candidate: PlacementCandidate | undefined;
    for (const source of preferredSources) {
      const hitSource = this.inputHitSources.get(source);
      const hit = hitSource && frame.getHitTestResults(hitSource)[0];
      const pose = hit?.getPose(this.referenceSpace);
      const inputCandidate = hit && pose ? this.toFloorCandidate(hit, pose, source) : undefined;
      if (inputCandidate) { this.inputCandidates.set(source, inputCandidate); candidate ??= inputCandidate; }
    }
    if (!candidate && this.viewerHitSource) {
      const hit = frame.getHitTestResults(this.viewerHitSource)[0]; const pose = hit?.getPose(this.referenceSpace);
      if (hit && pose) candidate = this.toFloorCandidate(hit, pose);
    }
    this.latestCandidate = candidate;
    if (!candidate) {
      this.reticle.visible = false; this.stableSamples = []; this.stableCandidate = undefined; this.setState("scanning"); return;
    }
    const previous = this.stableSamples.at(-1);
    if (previous && previous.distanceTo(candidate.position) > stableRadiusMetres) this.stableSamples = [];
    this.stableSamples.push(candidate.position.clone()); if (this.stableSamples.length > stableSampleCount) this.stableSamples.shift();
    const stable = this.stableSamples.length >= stableSampleCount; if (stable) this.stableCandidate = candidate;
    this.reticle.position.copy(this.averageStablePosition()); this.reticle.quaternion.identity(); this.reticle.visible = true;
    this.reticle.material.color.setHex(stable ? 0x83d3a1 : 0xd9ae77); this.setState(stable ? "scanning" : "stabilizing");
  }

  private toFloorCandidate(hit: XRHitTestResult, pose: XRPose, inputSource?: XRInputSource) {
    const quaternion = new THREE.Quaternion(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
    if (worldUp.clone().applyQuaternion(quaternion).normalize().dot(worldUp) < floorNormalThreshold) return undefined;
    return { hit, pose, position: new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z), inputSource };
  }

  private averageStablePosition() {
    const result = new THREE.Vector3();
    if (!this.stableSamples.length) return this.latestCandidate?.position.clone() ?? result;
    this.stableSamples.forEach((sample) => result.add(sample)); return result.multiplyScalar(1 / this.stableSamples.length);
  }

  private updateAnchor(frame?: XRFrame) {
    if (!this.placed || !this.anchor || !frame || !this.referenceSpace || !this.model) return;
    const pose = frame.getPose(this.anchor.anchorSpace, this.referenceSpace);
    if (pose) this.model.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
  }

  private updateControllerInput(deltaSeconds: number) {
    if (!this.session || deltaSeconds === 0) return;
    for (const source of this.session.inputSources) {
      const gamepad = source.gamepad; if (!gamepad) continue;
      this.handleButton(source, 3, () => this.setScale(1));
      this.handleButton(source, 4, () => this.toggleAnimation());
      this.handleButton(source, 5, () => this.faceViewer());
      if (!this.placed || gamepad.axes.length < 2) continue;
      const horizontal = applyAxisDeadzone(gamepad.axes.at(-2) ?? 0); const vertical = applyAxisDeadzone(gamepad.axes.at(-1) ?? 0);
      if (source.handedness !== "left") this.rotation += horizontal * 55 * deltaSeconds;
      if (source.handedness !== "right") this.scale *= Math.exp(-vertical * deltaSeconds);
      if (source.handedness === "right" && vertical !== 0) this.setVolume(this.volume - vertical * 0.65 * deltaSeconds);
      this.scale = THREE.MathUtils.clamp(this.scale, questScaleRange.min, questScaleRange.max); this.rotation = this.normalizeDegrees(this.rotation);
      if (horizontal !== 0 || vertical !== 0) { this.applyTransform(); this.emitTransform(); }
    }
  }

  private handleButton(source: XRInputSource, index: number, action: () => void) {
    const pressed = Boolean(source.gamepad?.buttons[index]?.pressed); const key = `${source.handedness}:${index}`;
    const previous = this.buttonStates.get(key) ?? false;
    if (pressed && !previous) { action(); this.pulse(source); }
    this.buttonStates.set(key, pressed);
  }

  private applyTransform() {
    if (!this.model) return;
    const base = (this.model.userData.baseScale as number | undefined) ?? 1;
    this.model.scale.setScalar(base * this.scale); this.model.quaternion.setFromAxisAngle(worldUp, THREE.MathUtils.degToRad(this.rotation));
  }
  private emitTransform() { this.onTransform({ scale: this.scale, rotation: this.rotation, volume: this.volume, lightIntensity: this.lightIntensity, animationPlaying: this.animationPlaying, mode: this.mode }); }
  private normalizeDegrees(value: number) { return ((value + 180) % 360 + 360) % 360 - 180; }

  private setState(state: WebXrSessionState) {
    if (this.currentState === state) return;
    this.currentState = state; this.onState(state);
    this.drawHud(state === "placed" ? this.mode === "play"
      ? "Hands: keys + stops · controllers: scale + light · grip relocates"
      : "Left stick scales · trigger edits light · A / X music"
      : state === "stabilizing" ? "Hold the controller steady on the amber floor ring"
        : state === "scanning" ? "Aim at a clear floor area; place when the ring turns green" : "Loading the verified organ…");
  }

  private createHud(scene: THREE.Scene) {
    const canvas = document.createElement("canvas"); canvas.width = 1536; canvas.height = 220; this.hudCanvas = canvas;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter;
    const hud = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: 0.92 }));
    hud.scale.set(1.55, 0.22, 1); hud.renderOrder = 100; this.hud = hud; scene.add(hud); this.drawHud("Loading the verified organ…");
  }

  private drawHud(message: string) {
    const canvas = this.hudCanvas; const hud = this.hud; const context = canvas?.getContext("2d"); if (!canvas || !hud || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = "rgba(24, 23, 21, .88)";
    context.beginPath(); context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 42); context.fill();
    context.strokeStyle = "rgba(255,255,255,.35)"; context.lineWidth = 4; context.stroke(); context.fillStyle = "white";
    context.font = "600 48px system-ui, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(message, canvas.width / 2, canvas.height / 2, canvas.width - 100);
    if (hud.material instanceof THREE.SpriteMaterial && hud.material.map) hud.material.map.needsUpdate = true; hud.visible = true;
  }
  private showPlacedHud() {
    if (!this.placed) return;
    this.drawHud(this.mode === "play"
      ? `Play with fingertips · ${this.stopLabel()} · volume ${Math.round(this.volume * 100)}%`
      : `A / X  music     right stick ↕  volume ${Math.round(this.volume * 100)}%     B / Y  face`);
    this.hudHideAt = performance.now() + 6_000;
  }
  private updateHud(time: number) { if (this.hud && this.placed && time > this.hudHideAt) this.hud.visible = false; }

  private onHandPlayerState(state: QuestHandPlayerState) {
    if (!this.placed) return;
    if (state.activeNotes.length) {
      this.drawHud(`${this.handPlayer?.describeActiveNotes() ?? "Playing"} · ${this.stopLabel()} · VAO loops`);
      this.hudHideAt = performance.now() + 1_800;
    } else if (state.trackedHands > 0) {
      this.drawHud(`Hands ready · touch keys or the five stops · ${this.stopLabel()}`);
      this.hudHideAt = performance.now() + 3_500;
    } else {
      this.drawHud("Put controllers down to enable hands · or point at a key and hold trigger");
      this.hudHideAt = performance.now() + 6_000;
    }
  }

  private onControllerToolsState(state: QuestControllerToolsState) {
    if (!this.placed) return;
    const message = state.gesture === "moving-light" ? "Moving the subtle key light · release trigger to place"
        : state.gesture === "aiming-light" ? "Aiming artificial light · move the cyan target"
          : state.hoveredHandle === "source" ? "Trigger: grab the warm light source"
            : state.hoveredHandle === "target" ? "Trigger: grab the cool light target to aim"
              : undefined;
    if (!message) return;
    this.drawHud(message);
    this.hudHideAt = performance.now() + (state.gesture === "idle" ? 4_500 : 1_800);
  }

  private stopLabel() { return this.handPlayer?.describeActiveStops() ?? instrument.stops.find((stop) => stop.id === this.stopId)?.label ?? this.stopId; }
  private pulse(inputSource: XRInputSource) {
    const actuator = (inputSource.gamepad as HapticGamepad | undefined)?.hapticActuators?.[0];
    if (actuator) void actuator.pulse(0.35, 40).catch(() => undefined);
  }

  private createAdaptiveLighting(scene: THREE.Scene, session: XRSession) {
    const ambient = new THREE.HemisphereLight(0xfff9ec, 0x6a625a, 2.2);
    const key = new THREE.DirectionalLight(0xffedcf, 3.2); key.position.set(2.5, 5, 3.5);
    const fill = new THREE.DirectionalLight(0xc9dded, 1.1); fill.position.set(-3.5, 2.5, 2);
    const rim = new THREE.DirectionalLight(0xffd8ad, 0.7); rim.position.set(0, 3, -4);
    const estimatedProbe = new THREE.LightProbe(); estimatedProbe.intensity = 0;
    const estimatedKey = new THREE.DirectionalLight(0xffffff, 0); estimatedKey.position.set(0, 1, 0);
    scene.add(ambient, key, fill, rim, estimatedProbe, estimatedKey);
    this.ambientLight = ambient; this.keyLight = key; this.fillLight = fill; this.rimLight = rim;
    this.estimatedLightProbe = estimatedProbe; this.estimatedKeyLight = estimatedKey;

    const requestLightProbe = (session as LightEstimatingSession).requestLightProbe;
    if (!requestLightProbe) return;
    void requestLightProbe.call(session).then((probe) => {
      if (this.session === session) this.xrLightProbe = probe;
    }).catch((error) => {
      // Lighting estimation is optional. The tuned four-light rig remains a
      // deterministic fallback on runtimes that expose but do not grant it.
      console.info("[vaoXR WebXR] Real-world light estimation unavailable; using the fallback rig", error);
    });
  }

  private updateAdaptiveLighting(frame: XRFrame | undefined, deltaSeconds: number) {
    const estimate = frame && this.xrLightProbe
      ? (frame as LightEstimatingFrame).getLightEstimate?.(this.xrLightProbe)
      : undefined;
    if (estimate && this.estimatedLightProbe && this.estimatedKeyLight) {
      this.estimatedLightProbe.sh.fromArray(estimate.sphericalHarmonicsCoefficients);
      const intensity = estimate.primaryLightIntensity;
      const scalar = Math.max(0.001, intensity.x, intensity.y, intensity.z);
      this.estimatedKeyLight.color.setRGB(intensity.x / scalar, intensity.y / scalar, intensity.z / scalar);
      this.estimatedKeyLight.position.set(
        estimate.primaryLightDirection.x,
        estimate.primaryLightDirection.y,
        estimate.primaryLightDirection.z,
      );
      this.estimatedKeyLight.intensity = THREE.MathUtils.clamp(scalar, 0.35, 4.5);
      this.lightEstimateActive = true;
    }

    // Blend rather than switching rigs, which prevents exposure flashes when
    // the first estimate arrives. Keep a readability floor because passthrough
    // estimates can be noisy or very dim in real rooms.
    const blend = deltaSeconds > 0 ? 1 - Math.exp(-deltaSeconds * 3.5) : 1;
    const targets = this.lightEstimateActive
      ? { ambient: 0.75, key: 0.7, fill: 0.38, rim: 0.28, probe: 1.05 }
      : { ambient: 2.2, key: 3.2, fill: 1.1, rim: 0.7, probe: 0 };
    if (this.ambientLight) this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, targets.ambient, blend);
    if (this.keyLight) this.keyLight.intensity = THREE.MathUtils.lerp(this.keyLight.intensity, targets.key, blend);
    if (this.fillLight) this.fillLight.intensity = THREE.MathUtils.lerp(this.fillLight.intensity, targets.fill, blend);
    if (this.rimLight) this.rimLight.intensity = THREE.MathUtils.lerp(this.rimLight.intensity, targets.rim, blend);
    if (this.estimatedLightProbe) this.estimatedLightProbe.intensity = THREE.MathUtils.lerp(this.estimatedLightProbe.intensity, targets.probe, blend);
  }

  private currentPerformanceTime() {
    if (this.performanceStartedAt === undefined) return THREE.MathUtils.clamp(this.performanceOffset, 0, this.performanceDuration);
    return THREE.MathUtils.clamp(this.performanceOffset + this.getAudioContext().currentTime - this.performanceStartedAt, 0, this.performanceDuration);
  }

  private updatePerformance(deltaSeconds: number) {
    if (!this.animationPlaying || !this.placed || !this.mixer) return;
    if (this.performanceStartedAt !== undefined) {
      this.mixer.setTime(mapAudioToAnimationTime(
        this.currentPerformanceTime(),
        instrument.performance.animationDurationSeconds,
        instrument.performance.sync.audioTimeAtAnimationStartSeconds,
      ));
    } else {
      this.mixer.update(deltaSeconds);
    }
  }

  private startPerformance() {
    if (!this.animationAction || !this.placed) return;
    if (this.performanceOffset >= this.performanceDuration - 0.05) {
      this.performanceOffset = 0;
      this.animationAction.reset().play();
    }
    this.animationAction.paused = false;
    this.mixer?.setTime(mapAudioToAnimationTime(
      this.performanceOffset,
      instrument.performance.animationDurationSeconds,
      instrument.performance.sync.audioTimeAtAnimationStartSeconds,
    ));
    const audio = this.performanceAudio;
    if (!audio) return;
    const context = this.getAudioContext();
    const play = () => {
      if (!this.animationPlaying || !this.placed || this.performanceAudio !== audio) return;
      if (audio.isPlaying) audio.stop();
      audio.offset = this.performanceOffset;
      audio.setVolume(this.volume);
      audio.play();
      this.performanceStartedAt = context.currentTime;
    };
    if (context.state === "running") play();
    else void context.resume().then(play).catch((error) => console.warn("[vaoXR WebXR] Audio context did not resume", error));
  }

  private stopPerformance() {
    if (this.performanceAudio?.isPlaying) this.performanceAudio.stop();
    this.performanceStartedAt = undefined;
  }

  private restartPerformance() {
    this.stopPerformance();
    this.performanceOffset = 0;
    this.animationPlaying = true;
    this.animationAction?.reset().play();
    if (this.animationAction) this.animationAction.paused = !this.placed;
    this.mixer?.setTime(0);
    this.startPerformance();
  }

  private getAudioContext() {
    return THREE.AudioContext.getContext() as unknown as globalThis.AudioContext;
  }

  private disposeRuntime() {
    this.assetAbortController.abort();
    this.session?.removeEventListener("select", this.selectHandler); this.session?.removeEventListener("selectstart", this.selectStartHandler);
    this.session?.removeEventListener("selectend", this.selectEndHandler); this.session?.removeEventListener("squeeze", this.squeezeHandler);
    this.session?.removeEventListener("inputsourceschange", this.inputSourcesHandler); this.session?.removeEventListener("visibilitychange", this.visibilityHandler);
    this.session?.removeEventListener("end", this.endHandler);
    this.viewerHitSource?.cancel(); this.inputHitSources.forEach((source) => source.cancel()); this.anchor?.delete(); this.renderer?.setAnimationLoop(null);
    this.handPlayer?.dispose(); this.controllerTools?.dispose(); this.liveAudioEngine?.dispose(); this.liveAudioBus?.disconnect();
    this.stopPerformance(); this.performanceAudio?.disconnect(); this.audioListener?.removeFromParent(); this.mixer?.stopAllAction();
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
    });
    this.reticle?.geometry.dispose(); this.reticle?.material.dispose();
    if (this.hud?.material instanceof THREE.SpriteMaterial) { this.hud.material.map?.dispose(); this.hud.material.dispose(); }
    this.controllerVisuals.forEach((controller) => {
      controller.traverse((object) => {
        if (!(object instanceof THREE.Line)) return; object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
      }); controller.removeFromParent();
    });
    this.renderer?.dispose(); this.session = undefined; this.renderer = undefined; this.scene = undefined; this.model = undefined;
    this.reticle = undefined; this.viewerHitSource = undefined; this.referenceSpace = undefined; this.latestCandidate = undefined;
    this.stableCandidate = undefined; this.stableSamples = []; this.inputHitSources.clear(); this.inputCandidates.clear(); this.controllerVisuals = [];
    this.mixer = undefined; this.animationAction = undefined; this.audioListener = undefined; this.performanceAudio = undefined;
    this.handPlayer = undefined; this.controllerTools = undefined; this.liveAudioEngine = undefined; this.liveAudioBus = undefined;
    this.ambientLight = undefined; this.keyLight = undefined; this.fillLight = undefined; this.rimLight = undefined;
    this.estimatedLightProbe = undefined; this.estimatedKeyLight = undefined; this.xrLightProbe = undefined; this.lightEstimateActive = false;
    this.performanceOffset = 0; this.performanceStartedAt = undefined; this.hud = undefined; this.hudCanvas = undefined;
    this.endActivity?.(); this.endActivity = undefined;
  }
}
