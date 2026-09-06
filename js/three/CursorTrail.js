/**
 * CursorTrail.js — Mouse/touch cursor trail system for Cyber-Dither
 * 
 * Creates neon particle trails following the cursor, with intensity
 * responding to cursor velocity. Clicks generate radial pulse explosions.
 */

import * as THREE from 'three';

const MAX_TRAIL_PARTICLES = 200;
const MAX_CLICK_PARTICLES = 100;

export class CursorTrail {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.PerspectiveCamera} camera
     * @param {Object} themeManager
     */
    constructor(scene, camera, themeManager) {
        this.scene = scene;
        this.camera = camera;
        this.themeManager = themeManager;

        // Cursor state
        this.mousePos = new THREE.Vector2(0, 0);
        this.prevMousePos = new THREE.Vector2(0, 0);
        this.velocity = 0;
        this.mouse3D = new THREE.Vector3(0, 0, 0);

        // Raycaster for 3D position
        this._raycaster = new THREE.Raycaster();
        this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this._intersect = new THREE.Vector3();

        // ── Trail Particles ──
        this.trailGeometry = new THREE.BufferGeometry();
        this.trailPositions = new Float32Array(MAX_TRAIL_PARTICLES * 3);
        this.trailAlphas = new Float32Array(MAX_TRAIL_PARTICLES);
        this.trailSizes = new Float32Array(MAX_TRAIL_PARTICLES);

        this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));

        const colors = themeManager.getColors();
        this.trailMaterial = new THREE.PointsMaterial({
            color: colors.primary,
            size: 0.3,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.trailPoints = new THREE.Points(this.trailGeometry, this.trailMaterial);
        this.scene.add(this.trailPoints);

        // Trail pool
        this._trailIndex = 0;
        this._trailLifes = new Float32Array(MAX_TRAIL_PARTICLES);
        this._trailVelocities = new Float32Array(MAX_TRAIL_PARTICLES * 3);

        // ── Click Explosion Particles ──
        this.clickGeometry = new THREE.BufferGeometry();
        this.clickPositions = new Float32Array(MAX_CLICK_PARTICLES * 3);
        this.clickGeometry.setAttribute('position', new THREE.BufferAttribute(this.clickPositions, 3));

        this.clickMaterial = new THREE.PointsMaterial({
            color: colors.secondary,
            size: 0.4,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.clickPoints = new THREE.Points(this.clickGeometry, this.clickMaterial);
        this.scene.add(this.clickPoints);

        this._clickLifes = new Float32Array(MAX_CLICK_PARTICLES);
        this._clickVelocities = new Float32Array(MAX_CLICK_PARTICLES * 3);
        this._clickIndex = 0;

        // Bind event handlers
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onClick = this._handleClick.bind(this);
        this._onTouchMove = this._handleTouchMove.bind(this);

        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('click', this._onClick);
        window.addEventListener('touchmove', this._onTouchMove, { passive: true });
    }

    _handleMouseMove(e) {
        this.prevMousePos.copy(this.mousePos);
        this.mousePos.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );

        // Calculate velocity
        const dx = this.mousePos.x - this.prevMousePos.x;
        const dy = this.mousePos.y - this.prevMousePos.y;
        this.velocity = Math.sqrt(dx * dx + dy * dy) * 50;

        // Get 3D position via raycasting onto a plane
        this._raycaster.setFromCamera(this.mousePos, this.camera);
        this._raycaster.ray.intersectPlane(this._plane, this._intersect);
        if (this._intersect) {
            this.mouse3D.copy(this._intersect);
        }
    }

    _handleTouchMove(e) {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            this._handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    _handleClick(e) {
        // Spawn radial explosion at cursor position
        const count = 30;
        for (let i = 0; i < count; i++) {
            const idx = (this._clickIndex + i) % MAX_CLICK_PARTICLES;
            const i3 = idx * 3;

            this.clickPositions[i3] = this.mouse3D.x;
            this.clickPositions[i3 + 1] = this.mouse3D.y;
            this.clickPositions[i3 + 2] = this.mouse3D.z;

            // Radial velocity
            const angle = (i / count) * Math.PI * 2;
            const speed = 0.3 + Math.random() * 0.5;
            this._clickVelocities[i3] = Math.cos(angle) * speed;
            this._clickVelocities[i3 + 1] = Math.sin(angle) * speed;
            this._clickVelocities[i3 + 2] = (Math.random() - 0.5) * 0.3;

            this._clickLifes[idx] = 1.0;
        }
        this._clickIndex = (this._clickIndex + count) % MAX_CLICK_PARTICLES;
    }

    /**
     * Update cursor trail — call each frame
     * @param {number} dt
     */
    update(dt) {
        // ── Spawn trail particles based on velocity ──
        const spawnRate = Math.min(5, Math.floor(this.velocity * 3));
        for (let s = 0; s < spawnRate; s++) {
            const idx = this._trailIndex % MAX_TRAIL_PARTICLES;
            const i3 = idx * 3;

            this.trailPositions[i3] = this.mouse3D.x + (Math.random() - 0.5) * 0.3;
            this.trailPositions[i3 + 1] = this.mouse3D.y + (Math.random() - 0.5) * 0.3;
            this.trailPositions[i3 + 2] = this.mouse3D.z + (Math.random() - 0.5) * 0.3;

            this._trailVelocities[i3] = (Math.random() - 0.5) * 0.05;
            this._trailVelocities[i3 + 1] = (Math.random() - 0.5) * 0.05 + 0.02;
            this._trailVelocities[i3 + 2] = (Math.random() - 0.5) * 0.05;

            this._trailLifes[idx] = 1.0;
            this._trailIndex++;
        }

        // ── Update trail particles ──
        for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
            if (this._trailLifes[i] > 0) {
                const i3 = i * 3;
                this._trailLifes[i] -= dt * 1.5;

                this.trailPositions[i3] += this._trailVelocities[i3];
                this.trailPositions[i3 + 1] += this._trailVelocities[i3 + 1];
                this.trailPositions[i3 + 2] += this._trailVelocities[i3 + 2];

                // Fade velocity
                this._trailVelocities[i3] *= 0.95;
                this._trailVelocities[i3 + 1] *= 0.95;
                this._trailVelocities[i3 + 2] *= 0.95;
            } else {
                // Hide dead particles far away
                const i3 = i * 3;
                this.trailPositions[i3] = 9999;
                this.trailPositions[i3 + 1] = 9999;
                this.trailPositions[i3 + 2] = 9999;
            }
        }
        this.trailGeometry.attributes.position.needsUpdate = true;

        // ── Update click particles ──
        for (let i = 0; i < MAX_CLICK_PARTICLES; i++) {
            if (this._clickLifes[i] > 0) {
                const i3 = i * 3;
                this._clickLifes[i] -= dt * 2;

                this.clickPositions[i3] += this._clickVelocities[i3];
                this.clickPositions[i3 + 1] += this._clickVelocities[i3 + 1];
                this.clickPositions[i3 + 2] += this._clickVelocities[i3 + 2];

                this._clickVelocities[i3] *= 0.96;
                this._clickVelocities[i3 + 1] *= 0.96;
                this._clickVelocities[i3 + 2] *= 0.96;
            } else {
                const i3 = i * 3;
                this.clickPositions[i3] = 9999;
                this.clickPositions[i3 + 1] = 9999;
                this.clickPositions[i3 + 2] = 9999;
            }
        }
        this.clickGeometry.attributes.position.needsUpdate = true;

        // Decay velocity
        this.velocity *= 0.9;
    }

    /**
     * Update theme colours
     */
    updateColors() {
        const colors = this.themeManager.getColors();
        this.trailMaterial.color.setHex(colors.primary);
        this.clickMaterial.color.setHex(colors.secondary);
    }

    /**
     * Dispose
     */
    dispose() {
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('click', this._onClick);
        window.removeEventListener('touchmove', this._onTouchMove);

        this.scene.remove(this.trailPoints);
        this.scene.remove(this.clickPoints);
        this.trailGeometry.dispose();
        this.trailMaterial.dispose();
        this.clickGeometry.dispose();
        this.clickMaterial.dispose();
    }
}
