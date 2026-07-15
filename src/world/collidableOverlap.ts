import * as THREE from "three";

const _candidateBox = new THREE.Box3();
const _existingBox = new THREE.Box3();

/** Returns true if candidate AABB intersects any existing collidable (with margin). */
export function collidableWouldOverlap(
  candidate: THREE.Mesh,
  existing: THREE.Mesh[],
  margin = 0.25,
): boolean {
  _candidateBox.setFromObject(candidate);
  for (const ex of existing) {
    _existingBox.setFromObject(ex);
    _existingBox.min.addScalar(-margin);
    _existingBox.max.addScalar(margin);
    if (_existingBox.intersectsBox(_candidateBox)) {
      return true;
    }
  }
  return false;
}
