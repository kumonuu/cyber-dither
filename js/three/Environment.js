/**
 * Environment.js — Background environmental effects for Cyber-Dither
 * 
 * Creates the 3D grid floor, distant star field, holographic rings,
 * volumetric beams, reactive fog, and energy pulses — all responding
 * intelligently to music rather than looping.
 */

import * as THREE from 'three';

export class Environment {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} settings
     * @param {Object} themeManager
     */
    constructor(scene, settings, themeManager) {
        this.scene = scene;
        this.settings = settings;
        this.themeManager = themeManager;

        const qualityConfig = settings.getQualityConfig();
        const colors = themeManager.getColors();
        this._time = 0;

        // ── Grid Floor ──
        this.gridGroup = new THREE.Group();
        this._createGrid(colors);
        this.scene.add(this.gridGroup);

        // ── Star Field ──
        this.starCount = qualityConfig.starCount || 3000;
        this.stars = this._createStars(colors);
        this.scene.add(this.stars);

        // ── Holographic Rings ──
        this.rings = [];
        this._createRings(colors);

        // ── Volumetric Beams ──
        this.beams = [];
        this._createBeams(colors);

        // ── Energy Pulses ──
        this.pulses = [];

        // ── Fog ──
        this.scene.fog = new THREE.FogExp2(colors.fogColor, 0.008);
        this.baseFogDensity = 0.008;
    }

    /**
     * Create the neon grid floor
     */
    _createGrid(colors) {
        const gridSize = 200;
        const divisions = 40;
        const material = new THREE.LineBasicMaterial({
            color: colors.gridColor,
            transparent: true,
            opacity: 0.3,
        });

        // X lines
        for (let i = -divisions / 2; i <= divisions / 2; i++) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(i * (gridSize / divisions), -10, -gridSize / 2),
                new THREE.Vector3(i * (gridSize / divisions), -10, gridSize / 2),
            ]);
            const line = new THREE.Line(geometry, material);
            this.gridGroup.add(line);
        }

        // Z lines
        for (let i = -divisions / 2; i <= divisions / 2; i++) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-gridSize / 2, -10, i * (gridSize / divisions)),
                new THREE.Vector3(gridSize / 2, -10, i * (gridSize / divisions)),
            ]);
            const line = new THREE.Line(geometry, material);
            this.gridGroup.add(line);
        }
    }

    /**
     * Create distant star field
     */
    _createStars(colors) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.starCount * 3);
        const sizes = new Float32Array(this.starCount);

        for (let i = 0; i < this.starCount; i++) {
            const i3 = i * 3;
            // Distribute in a large sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 100 + Math.random() * 400;

            positions[i3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = r * Math.cos(phi);

            sizes[i] = 0.5 + Math.random() * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            color: colors.starColor,
            size: 0.8,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this._starPositions = positions;
        return new THREE.Points(geometry, material);
    }

    /**
     * Create holographic rings
     */
    _createRings(colors) {
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: colors.primary,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        for (let i = 0; i < 3; i++) {
            const geometry = new THREE.RingGeometry(15 + i * 10, 15.3 + i * 10, 64);
            const ring = new THREE.Mesh(geometry, ringMaterial.clone());
            ring.rotation.x = Math.PI / 2 + (i - 1) * 0.2;
            ring.position.y = (i - 1) * 3;
            this.scene.add(ring);
            this.rings.push(ring);
        }
    }

    /**
     * Create volumetric light beams
     */
    _createBeams(colors) {
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: colors.secondary,
            transparent: true,
            opacity: 0.05,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        for (let i = 0; i < 4; i++) {
            const geometry = new THREE.ConeGeometry(3, 80, 8, 1, true);
            const beam = new THREE.Mesh(geometry, beamMaterial.clone());
            const angle = (i / 4) * Math.PI * 2;
            beam.position.set(Math.cos(angle) * 30, 30, Math.sin(angle) * 30);
            beam.rotation.x = Math.PI;
            beam.rotation.z = (Math.random() - 0.5) * 0.5;
            this.scene.add(beam);
            this.beams.push(beam);
        }
    }

    /**
     * Update environment — call once per frame
     * @param {Object} analysis - audio analysis
     * @param {Object} warpValues
     * @param {number} dt
     */
    update(analysis, warpValues, dt) {
        this._time += dt;
        const colors = this.themeManager.getColors();
        const bgEnabled = this.settings.get('mixer.backgroundEffects') ?? true;

        if (!bgEnabled) return;

        // ── Grid pulse with bass ──
        const gridOpacity = 0.2 + analysis.bass * 0.4;
        this.gridGroup.children.forEach(line => {
            line.material.opacity = gridOpacity;
        });

        // ── Stars twinkle with highs + warp stretch ──
        if (this.stars.geometry.attributes.position) {
            const positions = this.stars.geometry.attributes.position.array;
            const warpStretch = warpValues.starStretch || 1;

            // We only modify Z positions for warp stretch effect (efficient)
            if (warpStretch > 1.5) {
                for (let i = 0; i < Math.min(this.starCount, 500); i++) {
                    const i3 = i * 3;
                    const baseZ = this._starPositions[i3 + 2];
                    positions[i3 + 2] = baseZ * (1 + (warpStretch - 1) * 0.3 * Math.sin(this._time * 2 + i));
                }
                this.stars.geometry.attributes.position.needsUpdate = true;
            }
        }

        // Star brightness from volume
        this.stars.material.opacity = 0.5 + analysis.volume * 0.5;

        // ── Rings pulse with bass ──
        this.rings.forEach((ring, i) => {
            const scale = 1 + analysis.bass * 0.3 + Math.sin(this._time * 0.5 + i) * 0.05;
            ring.scale.set(scale, scale, scale);
            ring.rotation.z += (0.001 + analysis.energy * 0.005) * (i % 2 === 0 ? 1 : -1);
            ring.material.opacity = 0.1 + analysis.bass * 0.15;
        });

        // ── Beams pulse with energy ──
        this.beams.forEach((beam, i) => {
            beam.material.opacity = 0.03 + analysis.energy * 0.08;
            beam.rotation.y += 0.002 + analysis.mids * 0.005;
            const s = 1 + analysis.bass * 0.2;
            beam.scale.set(s, 1, s);
        });

        // ── Fog density from energy ──
        if (this.scene.fog) {
            this.scene.fog.density = this.baseFogDensity * (1 + analysis.energy * 0.5);
        }

        // ── Beat energy pulses ──
        if (analysis.isBeat && analysis.beatIntensity > 0.4) {
            this._spawnPulse(colors, analysis.beatIntensity);
        }

        // Update existing pulses
        for (let p = this.pulses.length - 1; p >= 0; p--) {
            const pulse = this.pulses[p];
            pulse.time += dt;
            const progress = pulse.time / pulse.maxTime;

            if (progress >= 1) {
                this.scene.remove(pulse.mesh);
                pulse.mesh.geometry.dispose();
                pulse.mesh.material.dispose();
                this.pulses.splice(p, 1);
            } else {
                const scale = 1 + progress * 60;
                pulse.mesh.scale.set(scale, scale, scale);
                pulse.mesh.material.opacity = (1 - progress) * 0.2;
            }
        }
    }

    /**
     * Spawn an expanding energy pulse sphere on beat
     */
    _spawnPulse(colors, intensity) {
        if (this.pulses.length > 5) return; // limit active pulses

        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: colors.primary,
            transparent: true,
            opacity: 0.2,
            wireframe: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);

        this.pulses.push({
            mesh,
            time: 0,
            maxTime: 2.0,
            intensity,
        });
    }

    /**
     * Update theme colours
     */
    updateColors() {
        const colors = this.themeManager.getColors();

        // Update grid
        this.gridGroup.children.forEach(line => {
            line.material.color.setHex(colors.gridColor);
        });

        // Update stars
        this.stars.material.color.setHex(colors.starColor);

        // Update rings
        this.rings.forEach(ring => {
            ring.material.color.setHex(colors.primary);
        });

        // Update beams
        this.beams.forEach(beam => {
            beam.material.color.setHex(colors.secondary);
        });

        // Update fog
        if (this.scene.fog) {
            this.scene.fog.color.setHex(colors.fogColor);
        }
    }

    /**
     * Dispose
     */
    dispose() {
        this.scene.remove(this.gridGroup);
        this.scene.remove(this.stars);
        this.rings.forEach(r => { this.scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
        this.beams.forEach(b => { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); });
        this.pulses.forEach(p => { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    }
}
