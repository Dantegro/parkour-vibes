import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

export interface PlayerAPI {
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  updateMovement: (delta: number) => void;
  dispose: () => void;
}

export function initPlayerControls(domElement: HTMLElement): PlayerAPI {
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
  const PLAYER_HEIGHT = 3;   // camera y when standing on the ground
  const GRAVITY = 30;        // units per second squared
  const JUMP_VELOCITY = 12;  // initial upward speed on jump

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

    // --- Vertical movement (gravity + jumping) ---
    velocityY -= GRAVITY * delta;
    camera.position.y += velocityY * delta;

    // Ground collision & landing
    if (camera.position.y < PLAYER_HEIGHT) {
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
