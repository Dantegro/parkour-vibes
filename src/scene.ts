import * as THREE from "three";

export function createWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.0018);

  const hemi = new THREE.HemisphereLight(0xddddff, 0x666688, 1.5);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(50, 100, 40);
  scene.add(dirLight);

  const groundGeo = new THREE.PlaneGeometry(400, 400, 30, 30);
  groundGeo.rotateX(-Math.PI / 2);
  const gpos = groundGeo.attributes.position;
  for (let i = 0; i < gpos.count; i++) {
    // Increased unevenness for more natural rolling hills / valleys.
    // Player still stands at fixed eye height on the "ground" layer.
    gpos.setY(i, gpos.getY(i) + (Math.random() - 0.5) * 3.2);
  }
  gpos.needsUpdate = true;
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ color: 0x3a8a3a }),
  );
  scene.add(ground);

  const collidables: THREE.Mesh[] = [];

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(6, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0xff2222 }),
  );
  cube.position.set(3, 4, -12);
  scene.add(cube);
  collidables.push(cube);

  // Tall buildings (main obstacles). Made taller/higher so they are out of reach
  // even with a normal jump (and even on most hills). They are more spread out.
  for (let i = 0; i < 18; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 5.5, 3.8),
      new THREE.MeshLambertMaterial({ color: 0x777799 }),
    );
    const angle = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 50; // larger spread
    b.position.set(
      Math.cos(angle) * r * (0.75 + Math.random() * 0.9),
      2.75,
      Math.sin(angle) * r
    );
    if (Math.random() < 0.35) {
      b.material.color.setHex(0xaaaa66 + ((Math.random() * 0x555555) | 0));
    }
    scene.add(b);
    collidables.push(b);
  }

  // Shorter boxes / low platforms that the player *can* jump onto.
  // These are easier to reach (top around ~2.8) and help make the environment
  // more interesting and climbable without changing the main jump height.
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.6, 3.2),
      new THREE.MeshLambertMaterial({ color: 0x8B7355 }), // more earthy/crate-like
    );
    const angle = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 48; // spread out, slightly different range
    b.position.set(
      Math.cos(angle) * r * (0.7 + Math.random() * 0.85),
      1.3,
      Math.sin(angle) * r
    );
    if (Math.random() < 0.4) {
      // slight variation toward woodier tones
      b.material.color.setHex(0xA0522D + ((Math.random() * 0x333333) | 0));
    }
    scene.add(b);
    collidables.push(b);
  }

  return { scene, cube, collidables };
}
