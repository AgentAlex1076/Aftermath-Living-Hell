import * as THREE from 'three';
import { mat } from '../models/materials';
import { box, capsule, cyl } from '../models/build';
import { clamp, damp, TAU } from '../core/math';
import type { Player } from '../entities/Player';

/**
 * True FPS viewmodel: attached to the camera, rendering the survivor's hazmat arm,
 * rubber-gloved hand, and held tool/weapon in the lower-right foreground.
 * Includes walking/sprinting bob, idle breathing, and dynamic swing/punch animations.
 */
export class FirstPersonViewModel {
  readonly root = new THREE.Group();

  private readonly armPivot = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly toolSocket = new THREE.Group();
  private readonly leftFist = new THREE.Group();

  private currentModelId: string | null = null;
  private currentModel: THREE.Object3D | null = null;

  private phase = 0;
  private time = 0;
  private moveBlend = 0;
  private sprintBlend = 0;
  private visible = false;

  // Base resting transform in camera space (lower-right quadrant)
  private readonly restPos = new THREE.Vector3(0.26, -0.22, -0.42);
  private readonly restRot = new THREE.Euler(0.08, -0.15, 0.05);

  constructor() {
    this.root.name = 'FirstPersonViewModel';
    this.root.visible = false;
    this.buildArm();
    this.armPivot.add(this.rightArm);
    this.armPivot.add(this.leftFist);
    this.root.add(this.armPivot);

    // Initial position in camera local space
    this.armPivot.position.copy(this.restPos);
    this.armPivot.rotation.copy(this.restRot);
  }

  private buildArm(): void {
    const suit = mat('hazmat');
    const tape = mat('tape');
    const rubber = mat('rubber');

    // --- Right Forearm & Glove ---
    this.rightArm.name = 'viewmodel_rightArm';

    // Forearm sleeve (angled forward from off-screen bottom-right)
    const sleeve = capsule(0.055, 0.28, suit, {
      pos: [0.04, -0.08, 0.14],
      rot: [0.55, -0.2, 0.1],
    });
    const sleeveTape = cyl(0.058, 0.058, 0.035, tape, {
      pos: [0.015, -0.02, 0.06],
      rot: [0.55, -0.2, 0.1],
      segments: 14,
    });

    // Glove & Hand
    const wrist = cyl(0.052, 0.048, 0.07, rubber, {
      pos: [0, 0, 0],
      rot: [0.4, -0.1, 0],
      segments: 14,
    });
    const palm = box(0.08, 0.07, 0.06, rubber, {
      pos: [0, 0.03, -0.04],
      rot: [0.1, 0, 0.05],
    });
    const thumb = capsule(0.018, 0.04, rubber, {
      pos: [-0.038, 0.04, -0.03],
      rot: [0.3, 0.6, 0.4],
    });
    const fingers = capsule(0.022, 0.06, rubber, {
      pos: [0.038, 0.02, -0.05],
      rot: [0.1, 0, 0.2],
    });

    this.rightArm.add(sleeve, sleeveTape, wrist, palm, thumb, fingers);

    // Tool Socket: where held items are attached
    this.toolSocket.name = 'viewmodel_toolSocket';
    // Angled forward and slightly inward toward screen center
    this.toolSocket.position.set(0, 0.04, -0.04);
    this.toolSocket.rotation.set(-0.25, 0.18, -0.1);
    this.rightArm.add(this.toolSocket);

    // --- Left Fist (Visible when unarmed) ---
    this.leftFist.name = 'viewmodel_leftFist';
    this.leftFist.position.set(-0.52, -0.06, 0.05);
    this.leftFist.rotation.set(0.2, 0.35, -0.15);

    const leftSleeve = capsule(0.052, 0.24, suit, {
      pos: [-0.03, -0.07, 0.12],
      rot: [0.5, 0.2, -0.1],
    });
    const leftWrist = cyl(0.05, 0.046, 0.065, rubber, {
      pos: [0, 0, 0],
      rot: [0.35, 0.1, 0],
      segments: 14,
    });
    const leftPalm = box(0.075, 0.065, 0.055, rubber, {
      pos: [0, 0.025, -0.035],
    });
    const leftThumb = capsule(0.017, 0.038, rubber, {
      pos: [0.035, 0.035, -0.025],
      rot: [0.25, -0.5, -0.3],
    });

    this.leftFist.add(leftSleeve, leftWrist, leftPalm, leftThumb);
  }

  setHeld(model: THREE.Object3D | null, modelId: string | null): void {
    if (this.currentModelId === modelId && this.currentModel) return;
    this.currentModelId = modelId;

    while (this.toolSocket.children.length > 0) {
      this.toolSocket.remove(this.toolSocket.children[0]);
    }

    if (model) {
      this.currentModel = model;
      // Do not cast awkward shadows directly into camera view
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = false;
      });
      this.toolSocket.add(model);
      this.leftFist.visible = false;
    } else {
      this.currentModel = null;
      // When unarmed, show left fist ready for brawling
      this.leftFist.visible = true;
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.visible = visible;
  }

  update(
    dt: number,
    player: Player,
    moving: boolean,
    sprinting: boolean,
    isFirstPerson: boolean,
    buildTransition: number,
  ): void {
    if (!this.visible || !isFirstPerson || buildTransition > 0.1 || !player.alive) {
      if (this.root.visible) this.root.visible = false;
      return;
    }
    if (!this.root.visible) {
      this.root.visible = true;
    }

    this.time += dt;

    const speed = player.actualVelocity.length();
    this.moveBlend = damp(this.moveBlend, moving ? clamp(speed / 5.0, 0, 1.2) : 0, 9, dt);
    this.sprintBlend = damp(this.sprintBlend, sprinting && moving ? 1 : 0, 8, dt);

    if (moving) {
      const freq = sprinting ? 12 : 8.5;
      this.phase = (this.phase + dt * freq) % TAU;
    }

    // 1. Idle Breathing Sway
    const breathe = Math.sin(this.time * 2.0);
    const breatheY = breathe * 0.004;
    const breatheX = Math.cos(this.time * 1.0) * 0.002;

    // 2. Walk & Sprint Bobbing
    const bobX = Math.cos(this.phase) * (0.018 + 0.012 * this.sprintBlend) * this.moveBlend;
    const bobY = Math.abs(Math.sin(this.phase)) * (0.016 + 0.016 * this.sprintBlend) * this.moveBlend;

    // 3. Sprint Carry Lowering
    const sprintLower = this.sprintBlend * 0.08;
    const sprintForward = this.sprintBlend * 0.04;

    // 4. Dodge Roll Tuck
    const dodgeTuck = Math.sin(player.dodgeProgress * Math.PI);
    const dodgeDip = dodgeTuck * 0.45;

    // 5. Swing / Punch Animation
    let swingPosX = 0;
    let swingPosY = 0;
    let swingPosZ = 0;
    let swingRotX = 0;
    let swingRotY = 0;
    let swingRotZ = 0;

    if (player.swinging) {
      const p = player.swingProgress;
      if (player.swingArmed) {
        // Melee tool chop: wind up, then strike diagonally across screen
        if (p < 0.35) {
          // Wind-up: pull back and up
          const t = p / 0.35;
          swingPosX = t * 0.08;
          swingPosY = t * 0.09;
          swingPosZ = -t * 0.05;
          swingRotX = -t * 0.65;
          swingRotY = t * 0.35;
          swingRotZ = -t * 0.2;
        } else if (p < 0.55) {
          // Chop strike: rapid diagonal swing downward towards center
          const t = (p - 0.35) / 0.2;
          swingPosX = 0.08 - t * 0.22;
          swingPosY = 0.09 - t * 0.24;
          swingPosZ = -0.05 + t * 0.14;
          swingRotX = -0.65 + t * 1.45;
          swingRotY = 0.35 - t * 0.75;
          swingRotZ = -0.2 + t * 0.55;
        } else {
          // Recovery: ease back to ready
          const t = (p - 0.55) / 0.45;
          const ease = 1 - t * t * (3 - 2 * t);
          swingPosX = -0.14 * ease;
          swingPosY = -0.15 * ease;
          swingPosZ = 0.09 * ease;
          swingRotX = 0.8 * ease;
          swingRotY = -0.4 * ease;
          swingRotZ = 0.35 * ease;
        }
      } else {
        // Unarmed punch: right jab forward
        if (p < 0.4) {
          const t = p / 0.4;
          swingPosZ = -t * 0.06;
          swingPosY = t * 0.02;
        } else if (p < 0.65) {
          const t = (p - 0.4) / 0.25;
          swingPosZ = -0.06 + t * 0.28;
          swingPosX = -t * 0.09;
          swingPosY = 0.02 - t * 0.03;
          swingRotX = t * 0.3;
        } else {
          const t = (p - 0.65) / 0.35;
          const ease = 1 - t;
          swingPosZ = 0.22 * ease;
          swingPosX = -0.09 * ease;
          swingPosY = -0.01 * ease;
          swingRotX = 0.3 * ease;
        }
      }
    }

    // Apply computed offsets to the arm pivot
    this.armPivot.position.set(
      this.restPos.x + breatheX + bobX + swingPosX,
      this.restPos.y + breatheY - bobY - sprintLower - dodgeDip + swingPosY,
      this.restPos.z + sprintForward + swingPosZ,
    );

    this.armPivot.rotation.set(
      this.restRot.x + swingRotX - this.sprintBlend * 0.2,
      this.restRot.y + swingRotY + bobX * 2,
      this.restRot.z + swingRotZ + bobX,
    );
  }
}
