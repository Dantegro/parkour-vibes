import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

export interface PlayerAPI {
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  updateMovement: (delta: number) => void;
  dispose: () => void;
}

export function initPlayerControls(
  domElement: HTMLElement,
  collidables: THREE.Mesh[] = [],
  groundMesh?: THREE.Mesh
): PlayerAPI {
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  camera.position.set(0, 3, 2);
  camera.lookAt(0, 2.5, -12);
  const initialCameraQuaternion = camera.quaternion.clone();

  const controls = new PointerLockControls(camera, domElement);

  const instructions = document.createElement("div");
  instructions.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;color:#ccc;font-family:sans-serif;text-align:center;z-index:10;background:linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.2));user-select:none;cursor:pointer;";
  instructions.innerHTML =
    "Click to start<br><small>WASD to move • Space to jump • Mouse to look</small><br><small>(enters fullscreen for immersion)</small>";
  document.body.appendChild(instructions);

  instructions.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Request fullscreen for better immersion.
    // Fullscreen + pointer lock suppresses many browser keyboard shortcuts
    // (e.g. Ctrl+W, Ctrl+T, Cmd+W, etc.) that would otherwise close tabs or trigger UI.
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen request denied or unsupported — still attempt pointer lock.
    }

    controls.lock();
  });

  controls.addEventListener("lock", () => {
    instructions.style.display = "none";
    controls.enabled = true;
    controls.pointerSpeed = 1;
    camera.quaternion.copy(initialCameraQuaternion);
  });

  controls.addEventListener("unlock", () => {
    instructions.style.display = "grid";
    controls.enabled = true;
    controls.pointerSpeed = 1;
  });

  const keys: Record<string, boolean> = {};

  const handleKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true;

    if (controls.isLocked) {
      // Prevent browser default behavior for keys while in game.
      // This blocks many shortcuts like Ctrl+W (close tab), Ctrl+T (new tab),
      // Ctrl+R (reload), Cmd+W, Alt+key combos, etc.
      e.preventDefault();
      e.stopImmediatePropagation();

      // Extra aggressive blocking for any modified key (Ctrl, Cmd, Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.stopImmediatePropagation();
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;

    if (controls.isLocked) {
      e.preventDefault();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Also prevent the browser context menu (right-click) while in the game
  // for better immersion / to avoid accidental UI popups.
  const handleContextMenu = (e: MouseEvent) => {
    if (controls.isLocked) {
      e.preventDefault();
    }
  };
  domElement.addEventListener("contextmenu", handleContextMenu);

  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();

  // Vertical physics state for jumping
  let velocityY = 0;
  let canJump = true;

  // Tuning values (feel free to adjust)
  const PLAYER_HEIGHT = 3;   // camera y when standing on the *world* ground (y=0)
  const GRAVITY = 30;        // units per second squared
  const JUMP_VELOCITY = 12;  // initial upward speed on jump

  // Player capsule dimensions (for full vertical + horizontal collision)
  const PLAYER_RADIUS = 0.55;       // horizontal "thickness"
  const PLAYER_HEAD_OFFSET = 0.15;  // head is slightly above the camera (eye)
  const PLAYER_FEET_OFFSET = 2.85;  // camera (eye) is this far above the feet when standing
  const PLAYER_EYE_HEIGHT = 3.0;    // desired camera y above the terrain surface when "on ground"
  const WALL_FRICTION = 0.82;       // < 1.0 slows you down while scraping/sliding along walls

  // Raycaster for sampling the actual height of the uneven ground mesh
  const raycaster = new THREE.Raycaster();
  const _down = new THREE.Vector3(0, -1, 0);
  const _rayOrigin = new THREE.Vector3();

  function getGroundHeight(x: number, z: number): number {
    if (!groundMesh) return 0;
    // Shoot a ray straight down from high above the player's (x,z)
    _rayOrigin.set(x, 150, z);
    raycaster.set(_rayOrigin, _down);
    const intersects = raycaster.intersectObject(groundMesh, false);
    if (intersects.length > 0) {
      return intersects[0].point.y;
    }
    return 0;
  }

  // --- Horizontal collision with proper sliding + friction ---
  // Player is a vertical cylinder. After movement we push out of walls.
  // Multiple resolution passes + per-axis push gives smooth sliding along walls.
  // Friction is applied to the movement scalars when scraping a wall (slows parallel motion).
  function resolveHorizontalCollisions() {
    if (collidables.length === 0) return;

    const pos = camera.position;
    let hitWall = false;

    const pHead = pos.y + PLAYER_HEAD_OFFSET;
    const pFeet = pos.y - PLAYER_FEET_OFFSET;

    // Several iterations for stable corner / diagonal resolution
    for (let iter = 0; iter < 4; iter++) {
      let anyHit = false;

      for (const mesh of collidables) {
        const box = new THREE.Box3().setFromObject(mesh);

        const boxMinY = box.min.y;
        const boxMaxY = box.max.y;

        // Only collide horizontally with this box if the player's capsule
        // vertically overlaps the box's height range (i.e. the box is acting
        // as a side wall at the player's current height).
        // This is the key fix for being able to jump over short boxes:
        // once your feet clear the top of a short box, horizontal side
        // collision with it is disabled so your XZ can pass over it.
        if (pHead <= boxMinY || pFeet >= boxMaxY) {
          continue;
        }

        const minX = box.min.x - PLAYER_RADIUS;
        const maxX = box.max.x + PLAYER_RADIUS;
        const minZ = box.min.z - PLAYER_RADIUS;
        const maxZ = box.max.z + PLAYER_RADIUS;

        const x = pos.x;
        const z = pos.z;

        if (x > minX && x < maxX && z > minZ && z < maxZ) {
          anyHit = true;
          hitWall = true;

          // Find smallest penetration axis and snap to the surface
          const penX1 = x - minX;
          const penX2 = maxX - x;
          const penZ1 = z - minZ;
          const penZ2 = maxZ - z;

          if (penX1 < penX2 && penX1 < penZ1 && penX1 < penZ2) {
            pos.x = minX;               // hit left face
          } else if (penX2 < penX1 && penX2 < penZ1 && penX2 < penZ2) {
            pos.x = maxX;               // hit right face
          } else if (penZ1 < penX1 && penZ1 < penX2 && penZ1 < penZ2) {
            pos.z = minZ;               // hit "near" face
          } else {
            pos.z = maxZ;               // hit "far" face
          }
        }
      }

      if (!anyHit) break;
    }

    // Friction along walls: damp the current frame's movement scalars when in contact.
    // This gives a "scraping" / resistance feel while still allowing you to slide.
    if (hitWall) {
      velocity.x *= WALL_FRICTION;
      velocity.z *= WALL_FRICTION;
    }
  }

  // --- Vertical capsule collision (head + feet) ---
  // Allows bonking your head on ceilings and standing on top of boxes.
  function resolveVerticalCollisions() {
    if (collidables.length === 0) return;

    const headY = camera.position.y + PLAYER_HEAD_OFFSET;
    const feetY = camera.position.y - PLAYER_FEET_OFFSET;

    for (const mesh of collidables) {
      const box = new THREE.Box3().setFromObject(mesh);

      const px = camera.position.x;
      const pz = camera.position.z;

      // Use a small expansion for the *floor* check (landing on tops) so it's
      // easier to land on short boxes after a jump (your center doesn't need to
      // be perfectly inside the box).
      const floorMargin = 0.5;
      const overFloor = px >= box.min.x - floorMargin && px <= box.max.x + floorMargin &&
                        pz >= box.min.z - floorMargin && pz <= box.max.z + floorMargin;

      // For ceiling bonk, use stricter center check.
      const centerOver = px >= box.min.x && px <= box.max.x &&
                         pz >= box.min.z && pz <= box.max.z;

      if (overFloor || centerOver) {

        // Head bonk (hitting the underside of an object while moving upward)
        if (velocityY > 0 && headY > box.min.y && centerOver) {
          camera.position.y = box.min.y - PLAYER_HEAD_OFFSET;
          velocityY = 0; // stop upward momentum (head bonk)
        }

        // Feet / standing on top of an object while falling
        if (velocityY <= 0 && feetY < box.max.y && overFloor) {
          camera.position.y = box.max.y + PLAYER_FEET_OFFSET;
          velocityY = 0;
          canJump = true;
        }
      }
    }
  }

  function updateMovement(delta: number) {
    if (!controls.isLocked) return;

    // --- Horizontal movement (WASD) ---
    // Get movement direction from keys
    direction.z = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
    direction.x = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
    direction.y = 0;

    if (direction.lengthSq() > 0) {
      direction.normalize();

      // Time-based movement (smoother and more reliable)
      const speed = 25; // adjust this value if movement feels too fast/slow
      velocity.x = direction.x * speed * delta;
      velocity.z = direction.z * speed * delta;

      controls.moveRight(velocity.x);
      controls.moveForward(velocity.z);
    }

    // Horizontal wall collision with sliding + friction
    resolveHorizontalCollisions();

    // Optional: if we hit a wall this frame, further damp the *next* frame's input speed
    // (the scalars were already scaled inside resolve when hitWall was true).
    // This + surface snapping gives a nice "scraping" friction feel while sliding.

    // --- Vertical movement (gravity + jumping) ---
    velocityY -= GRAVITY * delta;
    camera.position.y += velocityY * delta;

    // Vertical capsule: ceiling bonks + standing on top of low objects (buildings / red cube)
    resolveVerticalCollisions();

    // React to the actual uneven ground height (raycast sample).
    // This makes the camera follow hills and valleys instead of staying at fixed y=3.
    // We only "stick" to ground when close to it or falling (respects jumps).
    // Using lerp gives smooth vertical motion as you traverse slopes.
    if (groundMesh) {
      const gHeight = getGroundHeight(camera.position.x, camera.position.z);
      const targetY = gHeight + PLAYER_EYE_HEIGHT;

      const currentY = camera.position.y;
      const distAboveGround = currentY - gHeight;

      // If we are at or below the "standing" height on the terrain, or falling towards it,
      // follow the ground (with smoothing for natural feel on uneven terrain).
      if (distAboveGround < PLAYER_EYE_HEIGHT + 0.15 && (canJump || velocityY <= 0)) {
        // Lerp for smoothness instead of hard snap every frame.
        // Higher lerp factor = snappier response to slopes.
        // Lower = smoother / floatier but can lag on steep changes.
        camera.position.y = THREE.MathUtils.lerp(currentY, targetY, 0.35);

        if (velocityY < 0) velocityY = 0;
        canJump = true;
      }
    } else if (camera.position.y < PLAYER_HEIGHT) {
      // Fallback for when no ground mesh is provided
      camera.position.y = PLAYER_HEIGHT;
      velocityY = 0;
      canJump = true;
    }

    // Jump input (only when on the ground)
    if (keys["Space"] && canJump) {
      velocityY = JUMP_VELOCITY;
      canJump = false;
    }
  }

  function dispose() {
    instructions.remove();
    controls.disconnect();

    // Clean up listeners (important for HMR / hot reloads)
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    domElement.removeEventListener("contextmenu", handleContextMenu);
  }

  return {
    camera,
    controls,
    updateMovement,
    dispose,
  };
}
