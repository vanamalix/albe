/**
 * Pointer handling on the canvas: placing masses / probes / rays, selecting and moving masses,
 * and the hover readout. Clicks are cast onto the drawn (curved) surface by fixed-point
 * iteration on the same height function the shader uses.
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { heightAt, sampleFields } from '../physics/fields';
import { ESCAPE_RADIUS, MAX_BODIES, MAX_SPEED, VEL_SCALE, world } from '../sim/world';
import { massFromLog, store, type Tool } from '../state/store';

export const preview = {
  active: false,
  tool: 'view' as Tool,
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
};

/** Intersects a ray with the sheet z = h(x, y). */
export function pickSurface(ray: THREE.Ray): { x: number; y: number } | null {
  const s = store.get();
  const dz = ray.direction.z;
  if (Math.abs(dz) < 1e-6) return null;
  let h = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 24; i++) {
    const t = (h - ray.origin.z) / dz;
    if (t < 0) return i === 0 ? null : { x, y };
    x = ray.origin.x + ray.direction.x * t;
    y = ray.origin.y + ray.direction.y * t;
    const nh = heightAt(s.mode, x, y, world.bodies, s.exaggeration);
    if (Math.abs(nh - h) < 0.01) break;
    h += 0.6 * (nh - h);
  }
  // Near the horizon a tiny pointer move spans thousands of units: not a usable place to click.
  if (Math.hypot(x, y) > ESCAPE_RADIUS * 0.5) return null;
  return { x, y };
}

const capSpeed = (vx: number, vy: number): [number, number] => {
  const v = Math.hypot(vx, vy);
  return v > MAX_SPEED ? [(vx / v) * MAX_SPEED, (vy / v) * MAX_SPEED] : [vx, vy];
};

export function Interaction() {
  const { gl, camera } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const touches = new Set<number>();
    let downAt: { x: number; y: number; id: number } | null = null;
    let lastReadout = 0;

    const toWorld = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return pickSurface(raycaster.ray);
    };

    const readout = (p: { x: number; y: number } | null, force = false) => {
      const now = performance.now();
      if (!force && now - lastReadout < 60) return;
      lastReadout = now;
      store.set({ readout: p ? { ...sampleFields(p.x, p.y, world.bodies), x: p.x, y: p.y } : null });
    };

    const cancel = () => {
      preview.active = false;
      downAt = null;
      world.held = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.add(e.pointerId);
        if (touches.size > 1) {
          cancel(); // two fingers: the camera gets the gesture
          return;
        }
      }
      const tool = store.get().tool;
      if (tool === 'view' || e.button !== 0) return;
      const p = toWorld(e);
      if (!p) return;
      downAt = { x: e.clientX, y: e.clientY, id: e.pointerId };
      preview.active = true;
      preview.tool = tool;
      preview.x0 = preview.x1 = p.x;
      preview.y0 = preview.y1 = p.y;
      if (tool === 'select') {
        // Keep the grab radius about the same on screen however far away the camera is.
        const b = world.nearestBody(p.x, p.y, 8 * Math.max(1, camera.position.distanceTo(new THREE.Vector3(p.x, p.y, 0)) / 350));
        store.set({ selectedId: b ? b.id : null });
        if (b) world.held = { id: b.id, x: b.x, y: b.y };
      }
      readout(p, true);
    };

    const onMove = (e: PointerEvent) => {
      const p = toWorld(e);
      if (downAt && e.pointerId === downAt.id && preview.active) {
        if (!p) return;
        preview.x1 = p.x;
        preview.y1 = p.y;
        if (world.held) {
          world.held.x = p.x;
          world.held.y = p.y;
          const b = world.bodyById(world.held.id);
          if (b) {
            b.x = p.x; // also moves it while the simulation is paused
            b.y = p.y;
            b.vx = 0;
            b.vy = 0;
          }
        }
      }
      if (downAt || (e.target === el && e.pointerType !== 'touch')) readout(p);
    };

    const onUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (!downAt || e.pointerId !== downAt.id || !preview.active) return;
      const s = store.get();
      const pix = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      const dragged = pix > 8;
      const { x0, y0, x1, y1 } = preview;
      const dx = x1 - x0;
      const dy = y1 - y0;
      switch (s.tool) {
        case 'mass': {
          if (world.bodies.length >= MAX_BODIES) break;
          const m = massFromLog(s.logMass);
          const [vx, vy] = dragged ? capSpeed(dx / VEL_SCALE, dy / VEL_SCALE) : world.autoVelocity(x0, y0, m, s.gr);
          const b = world.addBody(x0, y0, vx, vy, m);
          if (b) store.set({ selectedId: b.id });
          break;
        }
        case 'probe': {
          const [vx, vy] = dragged ? capSpeed(dx / VEL_SCALE, dy / VEL_SCALE) : world.autoVelocity(x0, y0, 0, s.gr);
          world.addProbe(x0, y0, vx, vy, 'follow');
          break;
        }
        case 'ray':
          if (dragged) world.fireRay(x0, y0, dx, dy);
          else world.fireRay(x0, y0, 1, 0);
          break;
        case 'fan':
          world.fireFan(x0, y0, dragged ? dx : 1, dragged ? dy : 0, 120, 21);
          break;
        default:
          break;
      }
      cancel();
    };

    const onCancel = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (downAt && e.pointerId === downAt.id) cancel();
    };
    const onLeave = () => {
      if (!downAt) store.set({ readout: null });
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, camera]);

  return null;
}
