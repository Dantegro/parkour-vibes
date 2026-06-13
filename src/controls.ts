import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  createMovementState,
  updatePlayerMovement,
  type MovementInput,
} from "./player/movement.js";
import type { CollisionWorld } from "./player/collision.js";
import { placePlayerOnGround } from "./player/collision.js";
import { buildGameStartOverlay } from "./ui/gameOverlay.js";
import {
  createPlayerModel,
  stepLookBehindTransition,
  updateLookBehindView,
} from "./player/view.js";

export interface PlayerAPI {
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  updateMovement: (delta: number) => void;
  dispose: () => void;
  getStamina: () => number;
  playerMesh?: THREE.Group;
}

export function initPlayerControls(
  domElement: HTMLElement,
  collidables: THREE.Mesh[] = [],
  groundMesh?: THREE.Mesh,
  onExitToMenu?: () => void,
): PlayerAPI {
  // lookCamera is the target for PointerLockControls. Mouse look only ever affects its quaternion.
  // Its .position is unused. This is the source of the player's facing / movement direction at all times.
  const lookCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  lookCamera.position.set(0, 3, 2);
  lookCamera.lookAt(0, 2.5, -12);
  const initialCameraQuaternion = lookCamera.quaternion.clone();

  // renderCamera is the one actually used by the renderer and exposed on the API.
  // We position + orient it every frame. Normally it sits at the eye (first-person).
  // When the look-behind key is held we animate it behind the player and point it at the character.
  const renderCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  const controls = new PointerLockControls(lookCamera, domElement);

  const startOverlay = buildGameStartOverlay(onExitToMenu);
  document.body.appendChild(startOverlay.element);

  startOverlay.element.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen denied — still attempt pointer lock.
    }

    controls.lock();
  });

  controls.addEventListener("lock", () => {
    startOverlay.hide();
    controls.enabled = true;
    controls.pointerSpeed = 1;
    lookCamera.quaternion.copy(initialCameraQuaternion);
  });

  controls.addEventListener("unlock", () => {
    startOverlay.show();
    controls.enabled = true;
    controls.pointerSpeed = 1;
  });

  const keys: Record<string, boolean> = {};

  const handleKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true;

    if (controls.isLocked) {
      e.preventDefault();
      e.stopImmediatePropagation();

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

  const handleContextMenu = (e: MouseEvent) => {
    if (controls.isLocked) {
      e.preventDefault();
    }
  };
  domElement.addEventListener("contextmenu", handleContextMenu);

  const movementState = createMovementState();
  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();

  const world: CollisionWorld = { collidables, groundMesh };

  // Logical player eye position (authoritative for movement + collision).
  // The render camera is placed relative to this; the old "camera === eye" coupling is removed.
  const playerEyePos = new THREE.Vector3().copy(lookCamera.position);

  const spawnGroundY = placePlayerOnGround(
    playerEyePos,
    world,
    raycaster,
    rayOrigin,
  );
  movementState.prevFeetY = spawnGroundY;

  // Visible player avatar. It becomes visible while the player is looking behind so you can see
  // your own character from the rear. Hidden in normal first-person view.
  const playerModel = createPlayerModel();

  // 0 = normal first-person, 1 = full look-behind (rear view). Driven by holding the C key.
  let lookBehindT = 0;

  function readInput(): MovementInput {
    return {
      forward: (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0),
      strafe: (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0),
      jump: keys["Space"] ?? false,
      sprint: !!(keys["ShiftLeft"] || keys["ShiftRight"]),
    };
  }

  function updateMovement(delta: number) {
    const input = readInput();

    // Movement + collision still operate exclusively on the logical player eye (decoupled from render camera).
    updatePlayerMovement(
      delta,
      playerEyePos,
      lookCamera.quaternion,
      input,
      movementState,
      world,
      raycaster,
      rayOrigin,
      controls.isLocked,
    );

    // Hold C to look behind you (see your character from the rear / over-the-shoulder glance).
    // The render camera animates smoothly behind the player and orients to look at the avatar.
    // Movement direction (and model facing) continue to follow the mouse look (lookCamera quaternion).
    // Releasing C smoothly returns the camera to the normal first-person eye position + orientation.
    const holdingLookBehind = !!keys["KeyC"];
    const targetT = holdingLookBehind ? 1 : 0;
    lookBehindT = stepLookBehindTransition(lookBehindT, targetT, delta);

    updateLookBehindView(
      renderCamera,
      playerEyePos,
      lookCamera.quaternion,
      lookBehindT,
      playerModel,
      delta,
    );
  }

  function dispose() {
    startOverlay.element.remove();
    controls.disconnect();
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    domElement.removeEventListener("contextmenu", handleContextMenu);

    // Dispose the player model geometry/materials (main.ts is responsible for scene removal).
    playerModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose();
        } else {
          mat.dispose();
        }
      }
    });
  }

  return {
    camera: renderCamera,
    controls,
    updateMovement,
    dispose,
    getStamina: () => movementState.stamina,
    playerMesh: playerModel,
  };
}
