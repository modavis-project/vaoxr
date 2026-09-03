import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { instrument } from "@/lib/content";
import type { PerformanceTimeline } from "@/lib/content";
import { OrganPerformanceBinding } from "./OrganPerformanceBinding";
import { fetchVerifiedVaoBytes } from "@/lib/vao/integrity";

async function loadOrganObject(onProgress?: (percent: number) => void) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const bytes = await fetchVerifiedVaoBytes(instrument.model.realizationId);
  onProgress?.(100);
  const gltf = await loader.parseAsync(bytes, instrument.model.url.slice(0, instrument.model.url.lastIndexOf("/") + 1));
  return gltf.scene;
}

export class OrganScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, .01, 100);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  model?: THREE.Object3D;
  private size = new THREE.Vector3(1, 1, 1);
  private frame = 0;
  private disposed = false;
  private performance?: OrganPerformanceBinding;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.minDistance = .7;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI * .88;
    this.scene.add(new THREE.HemisphereLight(0xfffcf4, 0x645b50, 2.2));
    const key = new THREE.DirectionalLight(0xfff3df, 3.7);
    key.position.set(4, 6, 5); key.castShadow = true; this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4df, 1.2);
    fill.position.set(-4, 2, 2); this.scene.add(fill);
  }

  async initialize(onProgress?: (percent: number) => void) {
    const model = await loadOrganObject(onProgress);
    if (this.disposed) return;
    this.model = model;
    this.scene.add(model);
    model.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(model);
    this.size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y += this.size.y / 2;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(Math.max(this.size.x, this.size.z) * .9, 64), new THREE.ShadowMaterial({ color: 0x5c4a39, opacity: .13 }));
    floor.name = "web-viewer-floor";
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.015; floor.receiveShadow = true; this.scene.add(floor);
    this.reset();
  }

  reset() {
    const distance = Math.max(this.size.y * 1.45, this.size.x * 1.65);
    this.camera.position.set(distance * .7, this.size.y * .63, distance);
    this.controls.target.set(0, this.size.y * .45, 0);
    this.controls.update();
  }

  resize(width: number, height: number) {
    if (!height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    const draw = () => {
      if (this.disposed) return;
      this.controls.update(); this.renderer.render(this.scene, this.camera); this.frame = requestAnimationFrame(draw);
    };
    draw();
  }

  setPerformanceTimeline(timeline: PerformanceTimeline) {
    if (this.model) this.performance = new OrganPerformanceBinding(this.model, timeline, instrument.performance.sync);
  }

  setPerformanceTime(audioTime: number) {
    this.performance?.setTime(audioTime);
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.controls.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => { if (value && typeof value === "object" && "isTexture" in value) (value as THREE.Texture).dispose(); });
        material.dispose();
      });
    });
    this.renderer.dispose();
    this.performance = undefined;
  }
}
