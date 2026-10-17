import * as THREE from 'three';
import { boundsOf, collectParts, type PartMesh } from './engine/parts';

/**
 * Four-view "set-of-marks" snapshot for the vision model: every visible part gets a number, the
 * model is rendered from four viewpoints into a 2×2 image, and a yellow numbered pill is drawn on a
 * visible point of each part. Lets the model edit meshes with meaningless names like `Object_12`.
 */

export type Snapshot = { image: string; markers: Record<string, number> };

const TILE = 512;
const VIEWS: Array<[number, number, number]> = [
  [1, 0.6, 1], // front-right
  [-1, 0.6, 1], // front-left
  [1, 0.6, -1], // back-right
  [0.0001, 1, 0.0001], // top
];
const BUDGET_MS = 3000;

function sampleCandidates(mesh: PartMesh): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(mesh, true);
  const out = [box.getCenter(new THREE.Vector3())];
  const pos = mesh.geometry.attributes.position;
  const step = Math.max(1, Math.floor(pos.count / 10));
  for (let i = 0; i < pos.count && out.length < 11; i += step) {
    out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.font = 'bold 15px system-ui, sans-serif';
  const w = Math.max(22, ctx.measureText(label).width + 10);
  const h = 20;
  ctx.fillStyle = '#ffd400';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

export function captureMarkedViews(renderer: THREE.WebGLRenderer, scene: THREE.Scene, root: THREE.Object3D): Snapshot {
  const parts = [...collectParts(root).values()].filter((m) => m.visible && !m.userData.decalOf);
  const markers: Record<string, number> = {};
  parts.forEach((m, i) => {
    markers[m.userData.partId as string] = i + 1;
  });

  const box = boundsOf(parts);
  const sphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 1) : box.getBoundingSphere(new THREE.Sphere());
  const canvas = document.createElement('canvas');
  canvas.width = TILE * 2;
  canvas.height = TILE * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d9dde3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hide everything except the model and the lights (grid, ground, selection boxes…).
  const hidden: THREE.Object3D[] = [];
  for (const child of scene.children) {
    if (child === root || (child as THREE.Light).isLight || !child.visible) continue;
    child.visible = false;
    hidden.push(child);
  }
  const prevBackground = scene.background;
  scene.background = new THREE.Color('#d9dde3');
  const target = new THREE.WebGLRenderTarget(TILE, TILE, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
  const pixels = new Uint8Array(TILE * TILE * 4);
  const prevTarget = renderer.getRenderTarget();
  const cameras: THREE.PerspectiveCamera[] = [];

  try {
    VIEWS.forEach((dir, v) => {
      const camera = new THREE.PerspectiveCamera(40, 1, sphere.radius * 0.05, sphere.radius * 20);
      const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(20)) * 1.05;
      camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(...dir).normalize(), distance);
      camera.up.set(0, v === 3 ? 0 : 1, v === 3 ? -1 : 0);
      camera.lookAt(sphere.center);
      camera.updateMatrixWorld();
      cameras.push(camera);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, TILE, TILE, pixels);
      const image = ctx.createImageData(TILE, TILE);
      for (let y = 0; y < TILE; y++) {
        // WebGL rows are bottom-up.
        image.data.set(pixels.subarray((TILE - 1 - y) * TILE * 4, (TILE - y) * TILE * 4), y * TILE * 4);
      }
      ctx.putImageData(image, (v % 2) * TILE, Math.floor(v / 2) * TILE);
    });
  } finally {
    renderer.setRenderTarget(prevTarget);
    scene.background = prevBackground;
    for (const o of hidden) o.visible = true;
    target.dispose();
  }

  // Markers: project sample points; keep the first that is visible (the raycast hits this part first)
  // and does not overlap markers placed already.
  const started = performance.now();
  const raycaster = new THREE.Raycaster();
  const placed: Array<[number, number]> = [];
  const ndc = new THREE.Vector3();
  const pills: Array<[number, number, string]> = [];
  for (const mesh of parts) {
    const label = String(markers[mesh.userData.partId as string]);
    const candidates = sampleCandidates(mesh);
    let chosen: [number, number] | null = null;
    let fallback: [number, number] | null = null;
    outer: for (let v = 0; v < cameras.length; v++) {
      for (const point of candidates) {
        ndc.copy(point).project(cameras[v]);
        if (Math.abs(ndc.x) > 0.97 || Math.abs(ndc.y) > 0.97 || ndc.z > 1) continue;
        const x = (v % 2) * TILE + (ndc.x * 0.5 + 0.5) * TILE;
        const y = Math.floor(v / 2) * TILE + (1 - (ndc.y * 0.5 + 0.5)) * TILE;
        if (performance.now() - started < BUDGET_MS) {
          const origin = cameras[v].position;
          raycaster.set(origin, point.clone().sub(origin).normalize());
          const hit = raycaster.intersectObjects(parts, false)[0];
          if (!hit || hit.object !== mesh) continue;
        }
        fallback ??= [x, y];
        if (placed.every(([px, py]) => Math.hypot(px - x, py - y) > 24)) {
          chosen = [x, y];
          break outer;
        }
      }
    }
    const at = chosen ?? fallback;
    if (at) {
      placed.push(at);
      pills.push([at[0], at[1], label]);
    }
  }
  for (const [x, y, label] of pills) drawPill(ctx, x, y, label);
  ctx.strokeStyle = '#9aa4b1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TILE, 0);
  ctx.lineTo(TILE, TILE * 2);
  ctx.moveTo(0, TILE);
  ctx.lineTo(TILE * 2, TILE);
  ctx.stroke();

  return { image: canvas.toDataURL('image/jpeg', 0.85), markers };
}
