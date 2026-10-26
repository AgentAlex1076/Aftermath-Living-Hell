import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { BUILD_TABS, PIECES, pieceModel, type PieceDef, type PieceId } from '../data/buildables';
import { models } from '../models/ModelRegistry';
import { mergeColored } from '../models/merge';
import type { Building, Piece, Placement } from './Building';

const L = CONFIG.building.cell;
const GRID_CELLS = 2;
const OK_COLOR = new THREE.Color('#8cff3a');
const BAD_COLOR = new THREE.Color('#ff3b30');

/**
 * Build mode (B): picks a piece from the build bar, previews it as a translucent ghost that
 * snaps to the grid (green = placeable, red = not), and places it on click. Also draws the
 * outline around whatever the hammer is pointed at.
 */
export class BuildMode {
  active = false;
  tab = 0;
  selected = 0;
  rotSteps = 0;
  placement: Placement | null = null;
  private readonly ghosts = new Map<string, THREE.Object3D>();
  private ghost: THREE.Object3D | null = null;
  private readonly ghostMat = new THREE.MeshStandardMaterial({
    color: OK_COLOR, emissive: OK_COLOR, emissiveIntensity: 0.55, roughness: 0.6, transparent: true, opacity: 0.42, depthWrite: false,
  });
  private readonly grid: THREE.LineSegments;
  private readonly highlight: THREE.LineSegments;
  private highlightPulse = 0;

  constructor(private readonly scene: THREE.Scene, private readonly building: Building) {
    this.grid = buildGrid();
    this.grid.visible = false;
    scene.add(this.grid);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#f2b705', transparent: true, depthTest: false }));
    this.highlight.renderOrder = 998;
    this.highlight.visible = false;
    this.highlight.name = 'build-highlight';
    scene.add(this.highlight);
  }

  get pieces(): readonly PieceId[] {
    return BUILD_TABS[this.tab].pieces;
  }

  get def(): PieceDef {
    return PIECES[this.pieces[Math.min(this.selected, this.pieces.length - 1)]];
  }

  setTab(i: number): void {
    if (i < 0 || i >= BUILD_TABS.length) return;
    this.tab = i;
    this.selected = Math.min(this.selected, this.pieces.length - 1);
  }

  nextTab(): void {
    this.setTab((this.tab + 1) % BUILD_TABS.length);
  }

  setActive(on: boolean): void {
    this.active = on;
    if (!on) {
      this.placement = null;
      if (this.ghost) this.ghost.visible = false;
      this.grid.visible = false;
    }
  }

  select(i: number): void {
    if (i < 0 || i >= this.pieces.length) return;
    this.selected = i;
  }

  rotate(): void {
    this.rotSteps = (this.rotSteps + 1) % 4;
  }

  /** Per tick: re-plans the selected piece at the cursor. */
  update(cursor: THREE.Vector3 | null): void {
    this.placement = this.active && cursor ? this.building.plan(this.def, cursor, this.rotSteps) : null;
  }

  place(): Piece | null {
    return this.placement ? this.building.place(this.placement) : null;
  }

  /** Per frame: positions the ghost and grid, and outlines `target` (the hammer's piece). */
  render(dt: number, target: Piece | null): void {
    const p = this.placement;
    const ghost = p ? this.ghostFor(p.def) : null;
    if (this.ghost && this.ghost !== ghost) this.ghost.visible = false;
    this.ghost = ghost;
    if (p && ghost) {
      ghost.visible = true;
      ghost.position.set(p.x, this.building.ghostY(p), p.z);
      ghost.rotation.y = p.rot;
      const c = p.ok ? OK_COLOR : BAD_COLOR;
      this.ghostMat.color.copy(c);
      this.ghostMat.emissive.copy(c);
    }

    const structural = !!p && p.def.kind !== 'deployable';
    this.grid.visible = structural;
    if (p && structural) {
      const cx = p.cell ? p.cell[0] : Math.floor(p.x / L);
      const cz = p.cell ? p.cell[1] : Math.floor(p.z / L);
      this.grid.position.set(cx * L + L / 2, this.building.ghostY(p) + 0.03, cz * L + L / 2);
    }

    this.highlight.visible = !!target;
    if (target) {
      this.highlightPulse += dt;
      const pad = 0.12;
      this.highlight.position.set(target.x, target.y, target.z);
      this.highlight.rotation.y = target.rot;
      this.highlight.scale.set(target.size.w + pad, target.size.h + pad * 0.5, target.size.d + pad);
      (this.highlight.material as THREE.LineBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(this.highlightPulse * 7);
    }
  }

  private ghostFor(def: PieceDef): THREE.Object3D {
    let g = this.ghosts.get(def.id);
    if (!g) {
      g = models.create(pieceModel(def, 'wood'), 1);
      mergeColored(g, this.ghostMat);
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = false;
        o.receiveShadow = false;
        o.renderOrder = 3;
      });
      g.name = `ghost:${def.id}`;
      this.scene.add(g);
      this.ghosts.set(def.id, g);
    }
    return g;
  }
}

/** Grid lines around a cell, fading out toward the edges. Centered on the cell's middle. */
function buildGrid(): THREE.LineSegments {
  const pts: number[] = [];
  const cols: number[] = [];
  const ext = (GRID_CELLS + 0.5) * L;
  const alpha = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x, z) / (ext * 1.05)) * 0.55;
  const steps = 10;
  for (let k = -GRID_CELLS; k <= GRID_CELLS + 1; k++) {
    const line = (k - 0.5) * L;
    for (let s = 0; s < steps; s++) {
      const a = -ext + (2 * ext * s) / steps;
      const b = -ext + (2 * ext * (s + 1)) / steps;
      pts.push(line, 0, a, line, 0, b);
      cols.push(1, 0.72, 0.02, alpha(line, a), 1, 0.72, 0.02, alpha(line, b));
      pts.push(a, 0, line, b, 0, line);
      cols.push(1, 0.72, 0.02, alpha(a, line), 1, 0.72, 0.02, alpha(b, line));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  lines.renderOrder = 2;
  lines.name = 'build-grid';
  return lines;
}
