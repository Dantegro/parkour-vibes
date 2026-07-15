import * as THREE from "three";
import { initPlayerControls, type PlayerAPI } from "./controls.js";
import { STAMINA_MAX } from "./player/constants.js";
import { createStaminaBar, type StaminaBar } from "./ui/staminaBar.js";
import { createBoxInventoryHud, type BoxInventoryHud } from "./ui/boxInventoryHud.js";
import { createBoxPlacementSystem, type BoxPlacementSystem } from "./systems/boxPlacement.js";
import { updateClouds } from "./world/clouds.js";
import type { WorldData } from "./world/worldHandle.js";

export interface GameSession {
  isActive(): boolean;
  start(world: WorldData, domElement: HTMLElement, onExitToMenu: () => void): PlayerAPI;
  tick(delta: number): void;
  exit(): WorldData | undefined;
  dispose(): void;
  onResize(width: number, height: number): void;
}

export function createGameSession(renderer: THREE.WebGLRenderer): GameSession {
  let active = false;
  let world: WorldData | undefined;
  let playerAPI: PlayerAPI | undefined;
  let staminaBar: StaminaBar | undefined;
  let boxPlacement: BoxPlacementSystem | undefined;
  let boxHud: BoxInventoryHud | undefined;

  function clearPlayer() {
    if (boxPlacement) {
      boxPlacement.dispose();
      boxPlacement = undefined;
    }
    if (boxHud) {
      boxHud.remove();
      boxHud = undefined;
    }
    if (playerAPI) {
      playerAPI.dispose();
      playerAPI = undefined;
    }
    if (staminaBar) {
      staminaBar.remove();
      staminaBar = undefined;
    }
  }

  return {
    isActive() {
      return active;
    },

    start(worldData, domElement, onExitToMenu) {
      if (active) {
        throw new Error("GameSession.start called while session is active");
      }
      active = true;
      world = worldData;

      const isOpenWorld = world.mode === "open-world";
      if (isOpenWorld) {
        boxPlacement = createBoxPlacementSystem({
          scene: world.scene,
          collidables: world.collidables,
          ground: world.ground,
        });
        boxHud = createBoxInventoryHud();
        document.body.appendChild(boxHud.element);
      }

      playerAPI = initPlayerControls(
        domElement,
        world.scene,
        world.collidables,
        world.ground,
        onExitToMenu,
        {
          boxPlacement,
          overlayExtraHint: isOpenWorld ? "Click to place box" : undefined,
        },
      );

      staminaBar = createStaminaBar();
      document.body.appendChild(staminaBar.element);

      return playerAPI;
    },

    tick(delta) {
      if (!active || !world || !playerAPI) return;

      playerAPI.updateMovement(delta);
      staminaBar?.update(playerAPI.getStamina(), STAMINA_MAX);
      if (boxHud && boxPlacement) {
        boxHud.setState(boxPlacement.getInventoryState());
      }
      updateClouds(world.clouds, delta);
      world.cube.rotation.y += 0.01;
      renderer.render(world.scene, playerAPI.camera);
    },

    exit() {
      if (!active) return undefined;
      active = false;
      clearPlayer();
      const returned = world;
      world = undefined;
      return returned;
    },

    dispose() {
      clearPlayer();
      active = false;
      world = undefined;
    },

    onResize(width, height) {
      playerAPI?.onResize(width, height);
      renderer.setSize(width, height, false);
    },
  };
}
