import * as THREE from "three";
import { createWorld } from "./scene.js";
import { initPlayerControls } from "./controls.js";
import {
  initBackgroundMusic,
  playBackgroundMusic,
  toggleBackgroundMusic,
  disposeBackgroundMusic,
  setMusicVolume,
  getMusicVolume,
} from "./audio.js";
import {
  buildMainMenu,
  injectMainMenuStyles,
  setGameModeSelected,
  setStartButtonEnabled,
} from "./ui/mainMenu.js";

const canvas = document.querySelector("#game") as HTMLCanvasElement;
// Menu is the primary UI until the game starts; hide decorative canvas from AT.
canvas.setAttribute("aria-hidden", "true");

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.documentElement.style.height = "100%";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x87ceeb);

const c = renderer.domElement;
c.style.position = "fixed";
c.style.left = "0";
c.style.top = "0";
c.style.width = "100%";
c.style.height = "100%";
c.style.zIndex = "1";
c.style.display = "none";

let prevTime = 0;

let scene: THREE.Scene | undefined;
let cube: THREE.Mesh | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let updateMovement: ((delta: number) => void) | undefined;
let disposeControls: (() => void) | undefined;

let menu: HTMLDivElement | undefined;
let menuStyle: HTMLStyleElement | undefined;
let gameStarted = false;

let selectedGameMode: string | null = null;
let gameEntryEl: HTMLButtonElement | undefined;
let gamesLabelEl: HTMLDivElement | undefined;

function startGame() {
  if (!selectedGameMode) {
    // Visually prompt the user to select a game mode first
    if (gameEntryEl) {
      gameEntryEl.classList.add('selecting');
      setTimeout(() => gameEntryEl?.classList.remove('selecting'), 380);
    }
    if (gamesLabelEl) {
      const originalColor = gamesLabelEl.style.color;
      gamesLabelEl.style.color = '#cc9966';
      setTimeout(() => {
        if (gamesLabelEl) gamesLabelEl.style.color = originalColor || '';
      }, 650);
    }
    return;
  }

  if (gameStarted || !menu || !menu.parentNode) return;
  gameStarted = true;

  menu.remove();

  // Lazily create the world and player controls when leaving the menu
  const world = createWorld();
  scene = world.scene;
  cube = world.cube;

  const playerAPI = initPlayerControls(
    renderer.domElement,
    world.collidables,
    world.ground
  );
  camera = playerAPI.camera;
  updateMovement = playerAPI.updateMovement;
  disposeControls = playerAPI.dispose;

  // Reveal the 3D canvas and kick off the game loop
  c.style.display = "block";
  c.removeAttribute("aria-hidden");
  prevTime = performance.now();
  animate();
}

function animate() {
  requestAnimationFrame(animate);

  if (!scene || !camera || !updateMovement || !cube) return;

  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  prevTime = time;

  updateMovement(delta);

  // Keep the red cube spinning so we can see rendering is alive
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
}

// --- Home screen menu (shown first) ---
const menuStyles = injectMainMenuStyles();
menuStyle = menuStyles.element;

const mainMenu = buildMainMenu();
menu = mainMenu.root;
gameEntryEl = mainMenu.gameModeOption;
gamesLabelEl = mainMenu.gamesLabel;
document.body.appendChild(menu);

initBackgroundMusic();
mainMenu.updateVolumeDisplay(getMusicVolume());

mainMenu.volumeSlider.addEventListener("input", () => {
  const vol = parseFloat(mainMenu.volumeSlider.value);
  setMusicVolume(vol);
  mainMenu.updateVolumeDisplay(vol);
});

mainMenu.gameModeOption.addEventListener("click", () => {
  selectedGameMode = "open-world";
  setGameModeSelected(mainMenu.gameModeOption, mainMenu.gameModeStatus, true);
  setStartButtonEnabled(mainMenu.startButton, true);
  playBackgroundMusic();

  mainMenu.gameModeOption.classList.add("selecting");
  setTimeout(() => mainMenu.gameModeOption.classList.remove("selecting"), 380);
});

mainMenu.startButton.addEventListener("click", startGame);

window.addEventListener("keydown", (e) => {
  if (menu && menu.parentNode && e.code === "Enter") {
    e.preventDefault();
    startGame();
  }
});

// Global music toggle (works on the menu and after entering the game world)
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyM") {
    e.preventDefault();
    toggleBackgroundMusic();
  }
});

// Simple in-game (and menu) volume control with keyboard
// [ / ] or - / + to adjust music volume (useful after starting the game when the slider is gone)
window.addEventListener("keydown", (e) => {
  if (e.key === "[" || e.key === "-") {
    e.preventDefault();
    const newVol = Math.max(0, getMusicVolume() - 0.05);
    setMusicVolume(newVol);
  } else if (e.key === "]" || e.key === "+" || e.key === "=") {
    e.preventDefault();
    const newVol = Math.min(1, getMusicVolume() + 0.05);
    setMusicVolume(newVol);
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (disposeControls) disposeControls();
    disposeBackgroundMusic();
    if (menu && menu.parentNode) menu.remove();
    if (menuStyle && menuStyle.parentNode) menuStyle.remove();
    renderer.dispose();
  });
}

window.addEventListener("resize", () => {
  if (!camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
});
