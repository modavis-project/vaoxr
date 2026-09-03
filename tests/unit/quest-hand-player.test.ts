import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { instrument } from "@/lib/content";
import type { WebAudioEngine } from "@/lib/audio/WebAudioEngine";
import {
  isQuestKeyContactHeld,
  isQuestStopContactHeld,
  QuestHandPlayer,
  questKeyMidiFromNode,
  questStopIndexFromNode,
  selectQuestKeySurface,
  selectQuestStopSurface,
  type QuestKeySurface,
  type QuestStopSurface,
} from "@/lib/ar/QuestHandPlayer";

const surface = (midi: number, min: [number, number, number], max: [number, number, number]): QuestKeySurface => ({
  midi,
  bounds: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
});

describe("Quest hand-key interaction", () => {
  const white = surface(60, [-0.02, 0, 0], [0.02, 0.006, 0.1]);
  const raisedBlack = surface(61, [-0.005, 0.003, 0.02], [0.005, 0.012, 0.075]);

  it("prefers the raised key where black and white key volumes overlap", () => {
    expect(selectQuestKeySurface(new THREE.Vector3(0, 0.019, 0.05), 0.008, [white, raisedBlack])?.midi).toBe(61);
  });

  it("recognizes authored and Three.js-sanitized key node names", () => {
    expect(questKeyMidiFromNode({ name: "M160", userData: { name: "M1.60" } })).toBe(60);
    expect(questKeyMidiFromNode({ name: "M172", userData: {} })).toBe(72);
    expect(questKeyMidiFromNode({ name: "REG1", userData: { name: "REG.1" } })).toBeUndefined();
    expect(questStopIndexFromNode({ name: "REG1", userData: { name: "REG.1" } })).toBe(1);
    expect(questStopIndexFromNode({ name: "REG5", userData: {} })).toBe(5);
  });

  it("uses fingertip radius at a key edge without selecting a distant key", () => {
    expect(selectQuestKeySurface(new THREE.Vector3(0.025, 0.014, 0.09), 0.008, [white])?.midi).toBe(60);
    expect(selectQuestKeySurface(new THREE.Vector3(0.04, 0.014, 0.09), 0.008, [white])).toBeUndefined();
  });

  it("keeps a held key through tracking jitter but releases above the hysteresis band", () => {
    expect(isQuestKeyContactHeld(new THREE.Vector3(0.023, 0.017, 0.05), 0.008, white)).toBe(true);
    expect(isQuestKeyContactHeld(new THREE.Vector3(0, 0.034, 0.05), 0.008, white)).toBe(false);
  });

  it("selects physical stop controls with a release band", () => {
    const stop: QuestStopSurface = {
      stopId: "ged",
      index: 1,
      bounds: new THREE.Box3(new THREE.Vector3(-0.04, 0, 0), new THREE.Vector3(0.04, 0.07, 0.02)),
    };
    expect(selectQuestStopSurface(new THREE.Vector3(0.045, 0.04, 0.01), 0.008, [stop])?.stopId).toBe("ged");
    expect(isQuestStopContactHeld(new THREE.Vector3(0.055, 0.04, 0.01), 0.008, stop)).toBe(true);
    expect(isQuestStopContactHeld(new THREE.Vector3(0.08, 0.04, 0.01), 0.008, stop)).toBe(false);
  });

  it("keeps key collision aligned after outer model scaling, then releases on pose loss", () => {
    const scene = new THREE.Scene();
    const model = new THREE.Group();
    model.scale.setScalar(2);
    scene.add(model);
    instrument.notes.forEach((midi, index) => {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.08), new THREE.MeshBasicMaterial());
      key.name = `M1${midi}`;
      key.userData.name = `M1.${midi}`;
      key.position.set(index * 0.02, 0, 0);
      model.add(key);
    });
    ["ged", "princ4", "princ2", "qui223", "reg8"].forEach((_, index) => {
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.018), new THREE.MeshBasicMaterial());
      stop.name = `REG${index + 1}`;
      stop.userData.name = `REG.${index + 1}`;
      stop.position.set(-0.2 - index * 0.035, 0.08, 0);
      model.add(stop);
    });
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    const panic = vi.fn();
    const releaseStop = vi.fn();
    const rebalanceMidi = vi.fn();
    const engine = { noteOn, noteOff, releaseStop, rebalanceMidi, panic } as unknown as WebAudioEngine;
    const player = new QuestHandPlayer(model, scene, engine, ["ged"], vi.fn());
    player.setEnabled(true);

    const midi = 60;
    const keyIndex = instrument.notes.indexOf(midi);
    const source = { handedness: "right", hand: new Map([["index-finger-tip", {}]]) } as unknown as XRInputSource;
    let height = 0.04;
    let tracked = true;
    const frame = {
      getJointPose: () => tracked ? {
        radius: 0.008,
        transform: { position: { x: keyIndex * 0.04, y: height, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      } : undefined,
    } as unknown as XRFrame;
    const referenceSpace = {} as XRReferenceSpace;
    const sources = [source] as unknown as XRInputSourceArray;

    player.update(frame, referenceSpace, sources, 1 / 90);
    height = 0.012;
    player.update(frame, referenceSpace, sources, 1 / 90);
    expect(noteOn).toHaveBeenCalledOnce();
    expect(noteOn).toHaveBeenCalledWith(midi, ["ged"], 0.92);

    expect(player.toggleStop("princ4")).toBe(true);
    expect(noteOn).toHaveBeenLastCalledWith(midi, ["princ4"], 0.92, 2);
    expect(rebalanceMidi).toHaveBeenLastCalledWith(midi, 2, 0.92);
    expect(player.toggleStop("ged")).toBe(true);
    expect(releaseStop).toHaveBeenCalledWith("ged");
    expect(rebalanceMidi).toHaveBeenLastCalledWith(midi, 1, 0.92);

    tracked = false;
    player.update(frame, referenceSpace, sources, 1 / 90);
    expect(noteOff).toHaveBeenCalledOnce();
    expect(noteOff).toHaveBeenCalledWith(midi);
    player.dispose();
  });
});
