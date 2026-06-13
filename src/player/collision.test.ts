import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PLAYER_EYE_HEIGHT } from "./constants.js";
import { resolveWalls, type CollisionWorld } from "./collision.js";

function makeBoxCollidable(
  x: number,
  baseY: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  mesh.position.set(x, baseY + height / 2, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("resolveWalls", () => {
  it("returns false when there are no collidables", () => {
    const eyePos = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0);
    expect(resolveWalls(eyePos, [])).toBe(false);
    expect(eyePos.x).toBe(0);
    expect(eyePos.z).toBe(0);
  });

  it("pushes the player out when inside a wall footprint", () => {
    const wall = makeBoxCollidable(0, 0, 2, 4, 4, 1);
    const eyePos = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 2.2);
    const move = { x: 0, z: 1 };
    const startZ = eyePos.z;

    const hit = resolveWalls(eyePos, [wall], move);

    expect(hit).toBe(true);
    expect(eyePos.z).not.toBe(startZ);
    expect(move.z).toBeLessThan(1);
  });

  it("does not block movement when the player has cleared the wall lip", () => {
    const wall = makeBoxCollidable(0, 0, 0, 4, 2, 4);
    const eyePos = new THREE.Vector3(0, 5, 0);
    const startX = eyePos.x;
    const startZ = eyePos.z;

    const hit = resolveWalls(eyePos, [wall]);

    expect(hit).toBe(false);
    expect(eyePos.x).toBe(startX);
    expect(eyePos.z).toBe(startZ);
  });
});

describe("resolveFloors", () => {
  it("snaps the player onto a box top when falling onto it", async () => {
    const { resolveFloors } = await import("./collision.js");
    const crate = makeBoxCollidable(0, 0, 0, 2, 2, 2);
    const world: CollisionWorld = { collidables: [crate] };
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const eyePos = new THREE.Vector3(0, 3.2, 0);

    const result = resolveFloors(
      eyePos,
      {
        velocityY: -5,
        canJump: false,
        prevFeetY: 3.5,
      },
      world,
      raycaster,
      rayOrigin,
    );

    expect(result.onSurface).toBe(true);
    expect(result.canJump).toBe(true);
    expect(result.velocityY).toBe(0);
    expect(eyePos.y).toBeCloseTo(2 + 2.85, 2);
  });

  it("snaps onto a box top when falling slightly past the lip", async () => {
    const { resolveFloors } = await import("./collision.js");
    const crate = makeBoxCollidable(0, 0, 0, 2, 2, 2);
    const world: CollisionWorld = { collidables: [crate] };
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const eyePos = new THREE.Vector3(1.42, 5.0, 0);

    const result = resolveFloors(
      eyePos,
      {
        velocityY: -8,
        canJump: false,
        prevFeetY: 2.55,
      },
      world,
      raycaster,
      rayOrigin,
    );

    expect(result.onSurface).toBe(true);
    expect(eyePos.y).toBeCloseTo(2 + 2.85, 2);
  });
});
