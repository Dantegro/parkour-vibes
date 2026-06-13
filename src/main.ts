import * as THREE from "three";
import { createWorld } from "./scene.js";
import { initPlayerControls } from "./controls.js";

const canvas = document.querySelector("#game") as HTMLCanvasElement;

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

function startGame() {
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
menuStyle = document.createElement("style");
menuStyle.textContent = `
  .menu-entry {
    width: 320px;
    padding: 14px 18px;
    border: 1px solid #3a3a44;
    background: #16161c;
    color: #c0c0c8;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    transition: background .08s ease, border-color .08s ease;
  }
  .menu-entry.selected {
    border-color: #55556a;
    background: #1f1f28;
    color: #e0e0e8;
  }
  .menu-entry:hover {
    background: #1f1f28;
    border-color: #5a5a66;
  }
  #menu-start-btn {
    margin-top: 32px;
    padding: 13px 52px;
    font-size: 14px;
    letter-spacing: 2px;
    background: #1a1a22;
    color: #d0d0d8;
    border: 1px solid #464652;
    cursor: pointer;
    transition: background .08s, border-color .08s, color .08s;
  }
  #menu-start-btn:hover {
    background: #24242e;
    border-color: #5f5f6e;
    color: #f0f0f8;
  }
  #menu-start-btn:active {
    transform: translateY(1px);
  }
`;
document.head.appendChild(menuStyle);

menu = document.createElement("div");
menu.style.cssText =
  "position:fixed;inset:0;z-index:100;background:#0a0a10;color:#c8c8d0;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;";

const title = document.createElement("div");
title.style.cssText = "font-size:48px;letter-spacing:5px;margin-bottom:2px;color:#d8d8e2;";
title.textContent = "OPEN WORLD";

const tagline = document.createElement("div");
tagline.style.cssText = "font-size:12px;letter-spacing:2.5px;opacity:0.4;margin-bottom:64px;";
tagline.textContent = "PROTOTYPE";

const gamesLabel = document.createElement("div");
gamesLabel.style.cssText = "font-size:10px;letter-spacing:2px;opacity:0.45;margin-bottom:6px;";
gamesLabel.textContent = "GAMES";

const gameEntry = document.createElement("div");
gameEntry.className = "menu-entry selected";
gameEntry.innerHTML = `Open World<span style="font-size:11px;opacity:0.35;letter-spacing:1px;">EXPLORE</span>`;

const startBtn = document.createElement("button");
startBtn.id = "menu-start-btn";
startBtn.textContent = "START GAME";

const hint = document.createElement("div");
hint.style.cssText = "margin-top:14px;font-size:10px;opacity:0.35;";
hint.textContent = "Enter / click to begin • WASD + mouse after lock";

menu.append(title, tagline, gamesLabel, gameEntry, startBtn, hint);
document.body.appendChild(menu);

// Start the game from the menu (button, entry click, or Enter key)
gameEntry.addEventListener("click", startGame);
startBtn.addEventListener("click", startGame);

window.addEventListener("keydown", (e) => {
  if (menu && menu.parentNode && e.code === "Enter") {
    e.preventDefault();
    startGame();
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (disposeControls) disposeControls();
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
