import * as THREE from "three";
import { PLAYER_FEET_OFFSET, PLAYER_RADIUS } from "../player/constants.js";
import { sampleGroundHeight } from "../player/collision.js";
import { disposeMeshes } from "../disposeMeshes.js";
import { collidableWouldOverlap } from "../world/collidableOverlap.js";

export const PLACEABLE_BOX_WIDTH = 3;
export const PLACEABLE_BOX_HEIGHT = 2.5;
export const PLACEABLE_BOX_DEPTH = 3;
export const MAX_PLACE_DISTANCE = 8;
export const MIN_PLACE_DISTANCE = 1.2;
export const PLACE_GROUND_OFFSET = 0.1;

export type BoxInventoryState = "available" | "placed";

export interface PlacementContext {
  lookCamera: THREE.PerspectiveCamera;
  playerEyePos: THREE.Vector3;
  raycaster: THREE.Raycaster;
  rayOrigin: THREE.Vector3;
}

export interface BoxPlacementSystem {
  updatePreview(ctx: PlacementContext): void;
  tryPlace(ctx: PlacementContext): boolean;
  getInventoryState(): BoxInventoryState;
  dispose(): void;
}

export interface BoxPlacementOptions {
  scene: THREE.Scene;
  collidables: THREE.Mesh[];
  ground: THREE.Mesh;
}

const _forward = new THREE.Vector3();
const _box = new THREE.Box3();
const _playerFeet = new THREE.Vector3();

const PREVIEW_VALID_COLOR = 0x6a9a6a;
const PREVIEW_INVALID_COLOR = 0xaa5555;
const PLACED_BOX_COLOR = 0x6b8e6b;

export function computePlacementBaseY(
  hit: THREE.Intersection,
  ground: THREE.Mesh,
  collidables: THREE.Mesh[],
  x: number,
  z: number,
  raycaster: THREE.Raycaster,
  rayOrigin: THREE.Vector3,
): number {
  let baseY = sampleGroundHeight(ground, x, z, raycaster, rayOrigin);

  const hitMesh = hit.object;
  if (
    hitMesh instanceof THREE.Mesh &&
    collidables.includes(hitMesh) &&
    hit.face &&
    hit.face.normal.y > 0.7
  ) {
    _box.setFromObject(hitMesh);
    baseY = Math.max(baseY, _box.max.y);
  }

  return baseY;
}

export function positionBoxAtBase(
  mesh: THREE.Mesh,
  x: number,
  baseY: number,
  z: number,
  height = PLACEABLE_BOX_HEIGHT,
): void {
  mesh.position.set(x, baseY + height / 2 + PLACE_GROUND_OFFSET, z);
  mesh.updateMatrixWorld(true);
}

export interface PlacementEvaluation {
  valid: boolean;
  x: number;
  z: number;
  baseY: number;
  distance: number;
}

export function evaluatePlacement(
  ctx: PlacementContext,
  ground: THREE.Mesh,
  collidables: THREE.Mesh[],
  candidateMesh: THREE.Mesh,
  excludeFromRaycast: THREE.Object3D[] = [],
): PlacementEvaluation | null {
  const { lookCamera, playerEyePos, raycaster } = ctx;

  _forward.set(0, 0, -1).applyQuaternion(lookCamera.quaternion);
  raycaster.set(playerEyePos, _forward);

  const rayTargets: THREE.Object3D[] = [ground, ...collidables];
  const hits = raycaster
    .intersectObjects(rayTargets, false)
    .filter((h) => !excludeFromRaycast.includes(h.object));

  if (hits.length === 0) return null;

  const hit = hits[0];
  const distance = hit.distance;
  if (distance > MAX_PLACE_DISTANCE) return null;

  const x = hit.point.x;
  const z = hit.point.z;

  _playerFeet.set(playerEyePos.x, playerEyePos.y - PLAYER_FEET_OFFSET, playerEyePos.z);
  const horizontalDist = Math.hypot(x - _playerFeet.x, z - _playerFeet.z);
  if (horizontalDist < MIN_PLACE_DISTANCE) return null;

  const baseY = computePlacementBaseY(
    hit,
    ground,
    collidables,
    x,
    z,
    raycaster,
    ctx.rayOrigin,
  );

  positionBoxAtBase(candidateMesh, x, baseY, z);
  const valid = isPlacementValid(candidateMesh, collidables, _playerFeet);

  return { valid, x, z, baseY, distance };
}

export function isPlacementValid(
  candidate: THREE.Mesh,
  collidables: THREE.Mesh[],
  playerFeet: THREE.Vector3,
): boolean {
  if (collidableWouldOverlap(candidate, collidables)) {
    return false;
  }

  _box.setFromObject(candidate);
  const playerMinX = playerFeet.x - PLAYER_RADIUS;
  const playerMaxX = playerFeet.x + PLAYER_RADIUS;
  const playerMinZ = playerFeet.z - PLAYER_RADIUS;
  const playerMaxZ = playerFeet.z + PLAYER_RADIUS;

  const overlapsPlayer =
    _box.min.x <= playerMaxX &&
    _box.max.x >= playerMinX &&
    _box.min.z <= playerMaxZ &&
    _box.max.z >= playerMinZ;

  return !overlapsPlayer;
}

function createBoxMesh(material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(PLACEABLE_BOX_WIDTH, PLACEABLE_BOX_HEIGHT, PLACEABLE_BOX_DEPTH),
    material,
  );
}

function removeFromCollidables(collidables: THREE.Mesh[], mesh: THREE.Mesh): void {
  const idx = collidables.indexOf(mesh);
  if (idx >= 0) collidables.splice(idx, 1);
}

export function createBoxPlacementSystem(options: BoxPlacementOptions): BoxPlacementSystem {
  const { scene, collidables, ground } = options;

  let inventory: BoxInventoryState = "available";
  let previewMesh: THREE.Mesh | undefined;
  let placedMesh: THREE.Mesh | undefined;

  const previewMaterial = new THREE.MeshLambertMaterial({
    color: PREVIEW_VALID_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  const candidateMaterial = new THREE.MeshLambertMaterial();
  const candidateMesh = createBoxMesh(candidateMaterial);
  candidateMesh.visible = false;

  function ensurePreviewMesh(): THREE.Mesh {
    if (!previewMesh) {
      previewMesh = createBoxMesh(previewMaterial);
      scene.add(previewMesh);
    }
    return previewMesh;
  }

  function hidePreview(): void {
    if (previewMesh) {
      previewMesh.visible = false;
    }
  }

  function updatePreview(ctx: PlacementContext): void {
    if (inventory !== "available") {
      hidePreview();
      return;
    }

    const preview = ensurePreviewMesh();
    const result = evaluatePlacement(ctx, ground, collidables, candidateMesh, [preview]);

    if (!result) {
      preview.visible = false;
      return;
    }

    preview.position.copy(candidateMesh.position);
    preview.quaternion.copy(candidateMesh.quaternion);
    preview.scale.copy(candidateMesh.scale);
    preview.updateMatrixWorld(true);
    preview.visible = true;

    const mat = preview.material as THREE.MeshLambertMaterial;
    mat.color.setHex(result.valid ? PREVIEW_VALID_COLOR : PREVIEW_INVALID_COLOR);
  }

  function tryPlace(ctx: PlacementContext): boolean {
    if (inventory !== "available") return false;

    const result = evaluatePlacement(ctx, ground, collidables, candidateMesh, [
      ...(previewMesh ? [previewMesh] : []),
    ]);

    if (!result || !result.valid) return false;

    const placedMaterial = new THREE.MeshLambertMaterial({ color: PLACED_BOX_COLOR });
    placedMesh = createBoxMesh(placedMaterial);
    positionBoxAtBase(placedMesh, result.x, result.baseY, result.z);

    scene.add(placedMesh);
    collidables.push(placedMesh);

    inventory = "placed";

    if (previewMesh) {
      scene.remove(previewMesh);
      disposeMeshes(previewMesh);
      previewMesh = undefined;
    }

    return true;
  }

  function getInventoryState(): BoxInventoryState {
    return inventory;
  }

  function dispose(): void {
    if (previewMesh) {
      scene.remove(previewMesh);
      disposeMeshes(previewMesh);
      previewMesh = undefined;
    }

    if (placedMesh) {
      scene.remove(placedMesh);
      removeFromCollidables(collidables, placedMesh);
      disposeMeshes(placedMesh);
      placedMesh = undefined;
    }

    disposeMeshes(candidateMesh);
    candidateMaterial.dispose();
    previewMaterial.dispose();
    candidateMesh.geometry.dispose();
  }

  return {
    updatePreview,
    tryPlace,
    getInventoryState,
    dispose,
  };
}
