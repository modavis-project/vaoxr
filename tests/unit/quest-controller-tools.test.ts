import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { questScaleRange, selectQuestLightHandle } from "@/lib/ar/QuestControllerTools";

describe("Quest controller scene tools", () => {
  it("keeps the intended controller scale range", () => {
    expect(questScaleRange).toEqual({ min: 0.5, max: 3.5 });
  });

  it("uses a generous invisible hit radius around subtle light handles", () => {
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    const handles = {
      source: new THREE.Vector3(0.07, 0, -1),
      target: new THREE.Vector3(0, 0, -2),
    };
    expect(selectQuestLightHandle(ray, handles)?.kind).toBe("source");
    expect(selectQuestLightHandle(ray, { source: new THREE.Vector3(0.1, 0, -1), target: new THREE.Vector3(0.2, 0, -2) })).toBeUndefined();
  });

  it("rejects handles behind the controller", () => {
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    expect(selectQuestLightHandle(ray, {
      source: new THREE.Vector3(0, 0, 0.5),
      target: new THREE.Vector3(0, 0, 1),
    })).toBeUndefined();
  });
});
