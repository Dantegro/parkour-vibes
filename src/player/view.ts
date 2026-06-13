import * as THREE from "three";
import {
  PLAYER_EYE_HEIGHT,
  PLAYER_FEET_OFFSET,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  LOOK_BEHIND_DISTANCE,
  LOOK_BEHIND_HEIGHT,
  LOOK_BEHIND_LOOK_TARGET_TAU,
  LOOK_BEHIND_POSITION_TAU,
  LOOK_BEHIND_TARGET_HEIGHT,
  LOOK_BEHIND_TRANSITION_TAU,
} from "./constants.js";

// Reusable temps — zero per-frame allocations (matches project discipline in collision.ts and PointerLockControls).
const _offset = new THREE.Vector3();
const _target = new THREE.Vector3();
const _fpPos = new THREE.Vector3();
const _tpPos = new THREE.Vector3();
const _fpQuat = new THREE.Quaternion();
const _tpQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _bodyQuat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _lookHelper = new THREE.Object3D();

// Persistent state for damping the rear look-at target (reduces flicker from terrain/collision micro-adjustments
// on the player eye when the camera is offset behind during the transition + speed changes).
const _smoothedLookTarget = new THREE.Vector3();
let _lookTargetSmoothed = false;

// Temp for ideal blended camera position (used when applying light position smoothing during active transition).
const _idealPos = new THREE.Vector3();

// Temp for the mathematical blended quat (we apply light slerp toward it during active transition for extra stability).
const _idealQuat = new THREE.Quaternion();

/** Create a minimal visible player representation (shown when looking behind). */
export function createPlayerModel(): THREE.Group {
  const group = new THREE.Group();

  // Torso (capsule-like using cylinder + slight scale for parkour feel)
  const torsoRadius = PLAYER_RADIUS * 0.82;
  const torsoHeight = PLAYER_HEIGHT * 0.72;
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoRadius, torsoRadius * 0.92, torsoHeight, 12),
    new THREE.MeshLambertMaterial({ color: 0x4a6fa5 }),
  );
  torso.position.y = torsoHeight / 2 + 0.05;
  group.add(torso);

  // Head (sphere)
  const headRadius = PLAYER_RADIUS * 0.62;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0x3f5f8f }),
  );
  head.position.y = torsoHeight + headRadius * 0.75;
  group.add(head);

  // Simple "pack" accent on back for a bit of silhouette (small box)
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(torsoRadius * 1.1, torsoHeight * 0.45, torsoRadius * 0.7),
    new THREE.MeshLambertMaterial({ color: 0x2f485f }),
  );
  pack.position.set(0, torsoHeight * 0.55, -torsoRadius * 0.85);
  group.add(pack);

  // Arms (thin cylinders) for a tiny bit of human shape without complexity
  const armRadius = 0.09;
  const armLen = torsoHeight * 0.7;
  const armMat = new THREE.MeshLambertMaterial({ color: 0x3a5a7a });
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(armRadius, armRadius, armLen, 6), armMat);
  leftArm.position.set(-torsoRadius * 1.05, torsoHeight * 0.55, 0);
  leftArm.rotation.z = 0.35;
  group.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = -leftArm.position.x;
  rightArm.rotation.z = -0.35;
  group.add(rightArm);

  group.userData.isPlayerModel = true;
  return group;
}

/**
 * Smoothly update the render camera and player model for the look-behind (rear glance) feature.
 * lookBehindT: 0 = normal first-person (camera at eye, model hidden), 1 = full look-behind.
 * When active the camera is placed behind the player and oriented to look at your own character,
 * letting you see yourself from behind while movement direction (derived from mouse) is unchanged.
 * The scalar T is expected to be driven with exponential smoothing via stepLookBehindTransition().
 *
 * delta drives two things:
 *  - exponential damping of the rear look-at target (LOOK_BEHIND_LOOK_TARGET_TAU) for orientation stability
 *  - light position + quat low-pass toward the "ideal" blended camera (LOOK_BEHIND_POSITION_TAU) *only*
 *    while the transition is active (0.03 < t < 0.97). This kills the L/R (and general) jitter that
 *    appears toward the *end* of enter/exit animations at full sprint + jumping/landing (irregular
 *    last steps of the t ramp + eye corrections from high-speed motion over terrain/near obstacles).
 *    Direct exact ideal placement is used at the extremes (t very close to 0 or 1) for zero-lag
 *    steady FP and full look-back.
 */
export function updateLookBehindView(
  renderCamera: THREE.PerspectiveCamera,
  playerEye: THREE.Vector3,
  viewQuat: THREE.Quaternion,
  lookBehindT: number,
  playerModel: THREE.Object3D,
  delta: number = 0,
): void {
  const t = THREE.MathUtils.clamp(lookBehindT, 0, 1);

  // FP pose (normal view)
  _fpPos.copy(playerEye);
  _fpQuat.copy(viewQuat);

  // Look-behind pose: camera offset behind using current yaw, then oriented to look at the player character.
  _euler.setFromQuaternion(viewQuat, "YXZ");
  const yaw = _euler.y;

  // Back direction in XZ (standard three -Z forward when yaw=0)
  _offset.set(Math.sin(yaw) * LOOK_BEHIND_DISTANCE, LOOK_BEHIND_HEIGHT, Math.cos(yaw) * LOOK_BEHIND_DISTANCE);
  _tpPos.copy(playerEye).add(_offset);

  // Raw target point on the character (slightly below eye height).
  _target.copy(playerEye).y += -LOOK_BEHIND_TARGET_HEIGHT + (PLAYER_EYE_HEIGHT - PLAYER_FEET_OFFSET) * 0.1;

  // Smooth the look-at target with its own time constant. This is the key stability fix:
  // the *position* of the camera still uses the live blended offset (preserving the direct/snappy
  // pull-back feel), but the direction it points while offset is low-pass filtered so micro
  // adjustments in playerEye (terrain following, resolves, ground noise) don't cause visible
  // rotational flicker, especially when sprint speed changes the rate at which you cross terrain.
  if (!_lookTargetSmoothed || t < 0.02) {
    _smoothedLookTarget.copy(_target);
    _lookTargetSmoothed = true;
  } else {
    const smoothAlpha = 1 - Math.exp(-(delta || 0.016) / LOOK_BEHIND_LOOK_TARGET_TAU);
    _smoothedLookTarget.lerp(_target, smoothAlpha);
  }

  _lookHelper.position.copy(_tpPos);
  _lookHelper.lookAt(_smoothedLookTarget);
  _tpQuat.copy(_lookHelper.quaternion);

  // Blend position + orientation. T is already smoothed by the caller.
  const blend = t;

  // Compute the "mathematical" ideal camera position and orientation (eye + current blend * offset,
  // slerp of fpQuat and the (already target-smoothed) tpQuat).
  // We do *not* assign directly while the transition is active (incl. the tails toward 0/1): we
  // apply a light low-pass filter to both. This damps the left/right (and general) jitter that
  // appears at full sprint + jumping/landing while t is still changing even in the final moments
  // of the exponential approach. The core "pull the camera back while running" math is still
  // evaluated every frame; we just don't instantly set the camera to the noisy ideal.
  // Once t is extremely close to 0 or 1 (animation practically finished), direct exact placement
  // for responsive steady FP and full look-back.
  _idealPos.lerpVectors(_fpPos, _tpPos, blend);
  _idealQuat.copy(_fpQuat).slerp(_tpQuat, blend);

  if (t < 0.03 || t > 0.97) {
    // Direct / settled mode: exact follow for crisp response.
    renderCamera.position.copy(_idealPos);
    renderCamera.quaternion.copy(_idealQuat);
  } else {
    // Active transition (including the problematic tail ends): smooth the camera position
    // and orientation toward this frame's ideal. The filter kills single-frame or irregular
    // micro-corrections in eye position (from sprint-speed landings, wall resolves, terrain stick)
    // and the tiny irregular steps from varying delta as the exponential t approaches its target.
    const smoothAlpha = 1 - Math.exp(-(delta || 0.016) / LOOK_BEHIND_POSITION_TAU);
    renderCamera.position.lerp(_idealPos, smoothAlpha);
    renderCamera.quaternion.slerp(_idealQuat, smoothAlpha);
  }

  // Player model (avatar) is shown while looking behind so you can see your own character.
  // Positioned at feet level; rotated only on yaw (body never tilts with camera pitch).
  const feetY = playerEye.y - PLAYER_FEET_OFFSET;
  playerModel.position.set(playerEye.x, feetY + 0.02, playerEye.z);
  _bodyQuat.setFromAxisAngle(_up, yaw);
  playerModel.quaternion.copy(_bodyQuat);
  playerModel.visible = t > 0.04;
}

/**
 * Drive the look-behind scalar (0..1) toward a target with exponential smoothing.
 * Call every frame with real delta (seconds). Produces the smooth "glance behind" animation.
 */
export function stepLookBehindTransition(currentT: number, targetT: number, delta: number): number {
  const tau = LOOK_BEHIND_TRANSITION_TAU;
  const alpha = 1 - Math.exp(-delta / tau);
  return currentT * (1 - alpha) + targetT * alpha;
}
