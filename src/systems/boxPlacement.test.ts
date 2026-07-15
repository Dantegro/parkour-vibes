import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PLAYER_FEET_OFFSET } from "../player/constants.js";
import {
  MAX_PLACE_DISTANCE,
  MIN_PLACE_DISTANCE,
  PLACEABLE_BOX_HEIGHT,
  PLACE_GROUND_OFFSET,
  computePlacementBaseY,
  evaluatePlacement,
  findPlacementSupport,
  isPlacementValid,
  positionBoxAtBase,
} from "./boxPlacement.js";
import { collidableWouldOverlap } from "../world/collidableOverlap.js";

function makeGround(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(40, 40, 4, 4);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
}

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

function makeCandidate(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(3, PLACEABLE_BOX_HEIGHT, 3),
    new THREE.MeshBasicMaterial(),
  );
  return mesh;
}

describe("positionBoxAtBase", () => {
  it("places box center using ground offset convention", () => {
    const mesh = makeCandidate();
    positionBoxAtBase(mesh, 1, 2, 3);
    expect(mesh.position.y).toBe(2 + PLACEABLE_BOX_HEIGHT / 2 + PLACE_GROUND_OFFSET);
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.z).toBe(3);
  });
});

describe("computePlacementBaseY", () => {
  it("uses ground height at hit XZ", () => {
    const ground = makeGround();
    const collidables: THREE.Mesh[] = [];
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();

    const hit: THREE.Intersection = {
      distance: 5,
      point: new THREE.Vector3(2, 0.5, 4),
      object: ground,
      face: null,
      faceIndex: 0,
      uv: undefined,
    };

    const baseY = computePlacementBaseY(hit, ground, collidables, 2, 4, raycaster, rayOrigin);
    expect(baseY).toBeCloseTo(0, 1);
  });

  it("stacks on box top when hitting upward-facing collidable face", () => {
    const ground = makeGround();
    const crate = makeBoxCollidable(0, 0, 0, 2, 2, 2);
    const collidables = [crate];
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();

    const hit: THREE.Intersection = {
      distance: 5,
      point: new THREE.Vector3(0, 2, 0),
      object: crate,
      face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(0, 1, 0), materialIndex: 0 },
      faceIndex: 0,
      uv: undefined,
    };

    const baseY = computePlacementBaseY(hit, ground, collidables, 0, 0, raycaster, rayOrigin);
    expect(baseY).toBeCloseTo(2, 2);
  });

  it("finds support collidables under the candidate footprint", () => {
    const ground = makeGround();
    const crate = makeBoxCollidable(4, 0, 4, 3, 2.5, 3);
    const collidables = [crate];
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();

    const support = findPlacementSupport(4, 4, ground, collidables, raycaster, rayOrigin);
    expect(support.baseY).toBeCloseTo(2.5, 2);
    expect(support.supportMeshes).toContain(crate);
  });
});

describe("isPlacementValid", () => {
  it("rejects overlap with existing collidables", () => {
    const existing = makeBoxCollidable(0, 0, 0, 4, 4, 4);
    const candidate = makeCandidate();
    positionBoxAtBase(candidate, 0, 0, 0);

    const playerFeet = new THREE.Vector3(10, PLAYER_FEET_OFFSET, 10);
    expect(isPlacementValid(candidate, [existing], playerFeet)).toBe(false);
    expect(collidableWouldOverlap(candidate, [existing])).toBe(true);
  });

  it("rejects placement overlapping player capsule in XZ", () => {
    const candidate = makeCandidate();
    positionBoxAtBase(candidate, 0, 0, 0);
    const playerFeet = new THREE.Vector3(0, PLAYER_FEET_OFFSET, 0);

    expect(isPlacementValid(candidate, [], playerFeet)).toBe(false);
  });

  it("accepts placement away from player and collidables", () => {
    const candidate = makeCandidate();
    positionBoxAtBase(candidate, 5, 0, 5);
    const playerFeet = new THREE.Vector3(0, PLAYER_FEET_OFFSET, 0);

    expect(isPlacementValid(candidate, [], playerFeet)).toBe(true);
  });

  it("rejects stacking without excluding the support collidable", () => {
    const existing = makeBoxCollidable(5, 0, 5, 3, PLACEABLE_BOX_HEIGHT, 3);
    const candidate = makeCandidate();
    positionBoxAtBase(candidate, 5, PLACEABLE_BOX_HEIGHT, 5);
    const playerFeet = new THREE.Vector3(0, PLAYER_FEET_OFFSET, 0);

    expect(collidableWouldOverlap(candidate, [existing])).toBe(true);
    expect(isPlacementValid(candidate, [existing], playerFeet)).toBe(false);
  });

  it("accepts stacking on top of an existing collidable", () => {
    const existing = makeBoxCollidable(5, 0, 5, 3, PLACEABLE_BOX_HEIGHT, 3);
    const candidate = makeCandidate();
    positionBoxAtBase(candidate, 5, PLACEABLE_BOX_HEIGHT, 5);
    const playerFeet = new THREE.Vector3(0, PLAYER_FEET_OFFSET, 0);

    expect(isPlacementValid(candidate, [existing], playerFeet, [existing])).toBe(true);
  });
});

describe("evaluatePlacement", () => {
  it("rejects hits beyond max place distance", () => {
    const ground = makeGround();
    const collidables: THREE.Mesh[] = [];
    const lookCamera = new THREE.PerspectiveCamera();
    lookCamera.position.set(0, 3, 0);
    lookCamera.lookAt(0, 0, -(MAX_PLACE_DISTANCE + 5));

    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const playerEyePos = new THREE.Vector3(0, 3, 0);
    const candidate = makeCandidate();

    const result = evaluatePlacement(
      { lookCamera, playerEyePos, raycaster, rayOrigin },
      ground,
      collidables,
      candidate,
    );

    expect(result).toBeNull();
  });

  it("rejects placement too close to player feet", () => {
    const ground = makeGround();
    const collidables: THREE.Mesh[] = [];
    const lookCamera = new THREE.PerspectiveCamera();
    lookCamera.position.set(0, 3, 0);
    lookCamera.lookAt(0, 0, -1);

    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const playerEyePos = new THREE.Vector3(0, 3, 0);
    const candidate = makeCandidate();

    const result = evaluatePlacement(
      { lookCamera, playerEyePos, raycaster, rayOrigin },
      ground,
      collidables,
      candidate,
    );

    if (result) {
      expect(result.distance).toBeLessThan(MIN_PLACE_DISTANCE + 0.5);
      expect(result.valid).toBe(false);
    }
  });

  it("raycasts from playerEyePos when lookCamera.position is stale", () => {
    const ground = makeGround();
    const collidables: THREE.Mesh[] = [];
    const lookCamera = new THREE.PerspectiveCamera();
    lookCamera.position.set(0, 3, 2);
    lookCamera.lookAt(0, 0, -4);

    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const playerEyePos = new THREE.Vector3(20, 3, 2);
    const candidate = makeCandidate();

    const result = evaluatePlacement(
      { lookCamera, playerEyePos, raycaster, rayOrigin },
      ground,
      collidables,
      candidate,
    );

    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(20, 0);
    expect(result!.z).toBeLessThan(0);
  });

  it("returns valid placement on ground within range", () => {
    const ground = makeGround();
    const collidables: THREE.Mesh[] = [];
    const lookCamera = new THREE.PerspectiveCamera();
    lookCamera.position.set(0, 3, 0);
    lookCamera.lookAt(0, 0, -4);

    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const playerEyePos = new THREE.Vector3(0, 3, 0);
    const candidate = makeCandidate();

    const result = evaluatePlacement(
      { lookCamera, playerEyePos, raycaster, rayOrigin },
      ground,
      collidables,
      candidate,
    );

    expect(result).not.toBeNull();
    expect(result!.distance).toBeLessThanOrEqual(MAX_PLACE_DISTANCE);
    expect(result!.distance).toBeGreaterThanOrEqual(MIN_PLACE_DISTANCE);
    expect(result!.valid).toBe(true);
  });

  it("returns valid placement when stacking on an existing box top", () => {
    const ground = makeGround();
    const crate = makeBoxCollidable(0, 0, -5, 3, PLACEABLE_BOX_HEIGHT, 3);
    const collidables = [crate];
    const lookCamera = new THREE.PerspectiveCamera();
    lookCamera.position.set(0, 5, 0);
    lookCamera.lookAt(0, PLACEABLE_BOX_HEIGHT, -5);

    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const playerEyePos = new THREE.Vector3(0, 5, 0);
    const candidate = makeCandidate();

    const result = evaluatePlacement(
      { lookCamera, playerEyePos, raycaster, rayOrigin },
      ground,
      collidables,
      candidate,
    );

    expect(result).not.toBeNull();
    expect(result!.baseY).toBeCloseTo(PLACEABLE_BOX_HEIGHT, 2);
    expect(result!.valid).toBe(true);
  });
});

describe("placed box collision integration", () => {
  it("snaps the player onto a placed-style box top when falling", async () => {
    const { resolveFloors } = await import("../player/collision.js");
    const { createMovementState } = await import("../player/movement.js");

    const crate = makeBoxCollidable(0, 0, 0, 3, PLACEABLE_BOX_HEIGHT, 3);
    const world = { collidables: [crate] };
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const eyePos = new THREE.Vector3(0, 3.2, 0);

    const result = resolveFloors(
      eyePos,
      {
        ...createMovementState(),
        velocityY: -5,
        canJump: false,
        prevFeetY: 3.5,
      },
      world,
      raycaster,
      rayOrigin,
      false,
    );

    expect(result.onSurface).toBe(true);
    expect(result.canJump).toBe(true);
    expect(eyePos.y).toBeCloseTo(PLACEABLE_BOX_HEIGHT + 2.85, 2);
  });

  it("pushes the player out of a placed-style box wall", async () => {
    const { resolveWalls } = await import("../player/collision.js");
    const { PLAYER_EYE_HEIGHT } = await import("../player/constants.js");

    const wall = makeBoxCollidable(0, 0, 2, 3, PLACEABLE_BOX_HEIGHT, 1);
    const eyePos = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 2.2);
    const move = { x: 0, z: 1 };
    const startZ = eyePos.z;

    const hit = resolveWalls(eyePos, [wall], move);

    expect(hit).toBe(true);
    expect(eyePos.z).not.toBe(startZ);
    expect(move.z).toBeLessThan(1);
  });
});
