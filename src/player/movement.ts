import * as THREE from "three";
import {
  GRAVITY,
  JUMP_VELOCITY,
  MIN_STAMINA_TO_SPRINT,
  PLAYER_FEET_OFFSET,
  SPRINT_DECEL_TAU,
  SPRINT_RAMP_TAU,
  SPRINT_SPEED,
  STAMINA_DRAIN_RATE,
  STAMINA_MAX,
  STAMINA_REGEN_RATE,
  STAMINA_REGEN_STATIONARY_MULT,
  WALK_SPEED,
} from "./constants.js";
import {
  type CollisionWorld,
  type FloorContext,
  resolveFloors,
  resolveWalls,
} from "./collision.js";

export interface MovementState {
  velocityY: number;
  canJump: boolean;
  prevFeetY: number;
  /** Current (ramped) horizontal speed actually used this frame. */
  currentSpeed: number;
  /** 0..STAMINA_MAX. Drains while sprinting on ground; regens otherwise. */
  stamina: number;
}

export interface MovementInput {
  forward: number;
  strafe: number;
  jump: boolean;
  sprint: boolean;
}

export function createMovementState(): MovementState {
  return {
    velocityY: 0,
    canJump: true,
    prevFeetY: 0,
    currentSpeed: 0,
    stamina: STAMINA_MAX,
  };
}

// Reusable temps for movement direction derivation (no per-frame allocations).
const _moveForward = new THREE.Vector3();
const _moveRight = new THREE.Vector3();

export function updatePlayerMovement(
  delta: number,
  playerEye: THREE.Vector3,
  viewQuat: THREE.Quaternion,
  input: MovementInput,
  state: MovementState,
  world: CollisionWorld,
  raycaster: THREE.Raycaster,
  rayOrigin: THREE.Vector3,
  isLocked: boolean = true,
): void {
  if (!isLocked) return;

  const horizontalMove = { x: 0, z: 0 };
  const moveLen = Math.hypot(input.strafe, input.forward);

  // --- Sprint target + exponential ramp (momentum) ---
  const tryingToSprint = input.sprint && state.stamina > MIN_STAMINA_TO_SPRINT;
  const targetSpeed = tryingToSprint ? SPRINT_SPEED : WALK_SPEED;
  const tau = tryingToSprint ? SPRINT_RAMP_TAU : SPRINT_DECEL_TAU;
  const alpha = 1 - Math.exp(-delta / tau);
  state.currentSpeed = state.currentSpeed * (1 - alpha) + targetSpeed * alpha;

  if (moveLen > 0) {
    const inv = 1 / moveLen;
    horizontalMove.x = input.strafe * inv * state.currentSpeed * delta;
    horizontalMove.z = input.forward * inv * state.currentSpeed * delta;

    // Derive world-space horizontal directions from the current view quaternion (yaw primarily).
    // Matches the previous PointerLockControls.moveRight/moveForward behavior for FP.
    _moveForward.set(0, 0, -1).applyQuaternion(viewQuat).setY(0).normalize();
    _moveRight.set(1, 0, 0).applyQuaternion(viewQuat).setY(0).normalize();

    playerEye.x += _moveRight.x * horizontalMove.x + _moveForward.x * horizontalMove.z;
    playerEye.z += _moveRight.z * horizontalMove.x + _moveForward.z * horizontalMove.z;
  }

  resolveWalls(playerEye, world.collidables, horizontalMove);

  state.velocityY -= GRAVITY * delta;
  playerEye.y += state.velocityY * delta;

  const floorCtx: FloorContext = {
    velocityY: state.velocityY,
    canJump: state.canJump,
    prevFeetY: state.prevFeetY,
  };

  const floor = resolveFloors(
    playerEye,
    floorCtx,
    world,
    raycaster,
    rayOrigin,
    delta,
  );
  state.velocityY = floor.velocityY;
  state.canJump = floor.canJump;

  resolveWalls(playerEye, world.collidables);

  if (input.jump && state.canJump) {
    state.velocityY = JUMP_VELOCITY;
    state.canJump = false;
  }

  // --- Stamina drain / regen (only drain while actually sprinting on the ground) ---
  const isMoving = moveLen > 0;
  const isSprintingNow = state.currentSpeed > WALK_SPEED * 1.05 && isMoving;

  if (isSprintingNow) {
    state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN_RATE * delta);
  } else {
    const mult = !isMoving ? STAMINA_REGEN_STATIONARY_MULT : 1;
    state.stamina = Math.min(STAMINA_MAX, state.stamina + STAMINA_REGEN_RATE * mult * delta);
  }

  // Hysteresis: if we just hit zero we stay forced to walk until we cross the restore threshold.
  if (state.stamina <= 0 && tryingToSprint) {
    // Already ramping toward WALK_SPEED above; just make sure we don't allow re-entry until regen.
  }

  state.prevFeetY = playerEye.y - PLAYER_FEET_OFFSET;
}
