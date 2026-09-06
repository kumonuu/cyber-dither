/**
 * ParticleEngine.js — InstancedMesh particle system for Cyber-Dither
 * 
 * Manages thousands of particles using Three.js InstancedMesh for performance.
 * Supports multiple geometries, audio reactivity (bass/mids/highs/volume),
 * visual mode behaviours, and smooth morphing between states.
 */

import * as THREE from 'three';

// Geometry factory functions
const GEOMETRIES = {
    points:   () => new THREE.SphereGeometry(0.08, 4, 4),
    cubes:    () => new THREE.BoxGeometry(0.15, 0.15, 0.15),
    diamonds: () => new THREE.OctahedronGeometry(0.12, 0),
    rings:    () => new THREE.TorusGeometry(0.1, 0.02, 6, 8),
    shards:   () => new THREE.TetrahedronGeometry(0.14, 0),
    hexagons: () => new THREE.CylinderGeometry(0.1, 0.1, 0.04, 6),
    crystals: () => new THREE.IcosahedronGeometry(0.11, 0),
};

// Temp objects to avoid GC pressure
const _tempMatrix = new THREE.Matrix4();
const _tempPosition = new THREE.Vector3();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _tempColor = new THREE.Color();

export class ParticleEngine {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} settings - from SettingsManager
     * @param {Object} themeManager
     */
    constructor(scene, settings, themeManager) {
        this.scene = scene;
        this.settings = settings;
        this.themeManager = themeManager;

        const qualityConfig = settings.getQualityConfig();
        this.maxParticles = qualityConfig.particleCount;

        // Particle data arrays
        this.positions = new Float32Array(this.maxParticles * 3);
        this.velocities = new Float32Array(this.maxParticles * 3);
        this.scales = new Float32Array(this.maxParticles);
        this.rotations = new Float32Array(this.maxParticles * 3);
        this.lives = new Float32Array(this.maxParticles);
        this.basePositions = new Float32Array(this.maxParticles * 3); // home positions

        // Current geometry type
        this.currentShape = settings.get('mixer.particleShape') || 'points';

        // Create instanced mesh
        this.mesh = null;
        this._createMesh(this.currentShape);

        // Initialize particle positions
        this._initParticles(50);

        // Shockwave state
        this._shockwaves = []; // { origin, force, time, maxTime }

        // Time accumulator
        this._time = 0;
    }

    /**
     * Create the instanced mesh with a given geometry type
     * @param {string} shape
     */
    _createMesh(shape) {
        // Remove old mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        const geometryFactory = GEOMETRIES[shape] || GEOMETRIES.points;
        const geometry = geometryFactory();

        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;

        // Initialize instance colours
        const colors = this.themeManager.getColors();
        const primaryColor = new THREE.Color(colors.primary);
        const secondaryColor = new THREE.Color(colors.secondary);
        const accentColor = new THREE.Color(colors.accent);

        for (let i = 0; i < this.maxParticles; i++) {
            const t = Math.random();
            if (t < 0.4) _tempColor.copy(primaryColor);
            else if (t < 0.7) _tempColor.copy(secondaryColor);
            else _tempColor.copy(accentColor);

            // Add slight variation
            _tempColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
            this.mesh.setColorAt(i, _tempColor);
        }
        this.mesh.instanceColor.needsUpdate = true;

        this.scene.add(this.mesh);
    }

    /**
     * Initialize particle home positions in a sphere
     * @param {number} radius
     */
    _initParticles(radius) {
        for (let i = 0; i < this.maxParticles; i++) {
            const i3 = i * 3;

            // Random spherical distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 0.5) * radius;

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            this.positions[i3] = x;
            this.positions[i3 + 1] = y;
            this.positions[i3 + 2] = z;

            this.basePositions[i3] = x;
            this.basePositions[i3 + 1] = y;
            this.basePositions[i3 + 2] = z;

            this.velocities[i3] = 0;
            this.velocities[i3 + 1] = 0;
            this.velocities[i3 + 2] = 0;

            this.scales[i] = 0.5 + Math.random() * 0.5;
            this.rotations[i3] = Math.random() * Math.PI * 2;
            this.rotations[i3 + 1] = Math.random() * Math.PI * 2;
            this.rotations[i3 + 2] = Math.random() * Math.PI * 2;
            this.lives[i] = Math.random();
        }
    }

    /**
     * Change particle geometry shape with smooth transition
     * @param {string} shape
     */
    setShape(shape) {
        if (!GEOMETRIES[shape] || shape === this.currentShape) return;
        this.currentShape = shape;
        this._createMesh(shape);
        // Re-apply current positions
        this._updateMatrices();
    }

    /**
     * Update all particles — call once per frame
     * @param {Object} analysis - audio analysis from AudioEngine
     * @param {Object} modeConfig - from VisualModeManager
     * @param {Object} warpValues - from WarpController
     * @param {number} dt - delta time in seconds
     */
    update(analysis, modeConfig, warpValues, dt) {
        if (!this.mesh) return;

        this._time += dt;
        const mixer = this.settings.get('mixer') || {};
        const bassResponse = mixer.bassResponse ?? 0.8;
        const trebleResponse = mixer.trebleResponse ?? 0.6;
        const motionIntensity = mixer.motionIntensity ?? 0.7;

        const bass = analysis.bass * bassResponse;
        const mids = analysis.mids;
        const highs = analysis.highs * trebleResponse;
        const volume = analysis.volume;
        const energy = analysis.energy;
        const warpMult = warpValues.particleMult;

        const behaviour = modeConfig.particleBehaviour || 'explosive';

        // Trigger shockwave on beat
        if (analysis.isBeat && analysis.beatIntensity > 0.3) {
            this._shockwaves.push({
                origin: new THREE.Vector3(0, 0, 0),
                force: analysis.beatIntensity * (modeConfig.beatExplosionForce || 5.0) * bassResponse,
                time: 0,
                maxTime: 1.5,
            });
        }

        // Update shockwaves
        for (let s = this._shockwaves.length - 1; s >= 0; s--) {
            this._shockwaves[s].time += dt;
            if (this._shockwaves[s].time > this._shockwaves[s].maxTime) {
                this._shockwaves.splice(s, 1);
            }
        }

        // Update each particle based on behaviour
        for (let i = 0; i < this.maxParticles; i++) {
            const i3 = i * 3;

            switch (behaviour) {
                case 'explosive':
                    this._updateExplosive(i, i3, bass, mids, highs, energy, motionIntensity, warpMult, dt);
                    break;
                case 'rain':
                    this._updateRain(i, i3, bass, mids, highs, energy, modeConfig, warpMult, dt);
                    break;
                case 'spiral':
                    this._updateSpiral(i, i3, bass, mids, highs, energy, modeConfig, warpMult, dt);
                    break;
                case 'datafall':
                    this._updateDatafall(i, i3, bass, mids, highs, energy, modeConfig, warpMult, dt);
                    break;
                case 'tunnel':
                    this._updateTunnel(i, i3, bass, mids, highs, energy, modeConfig, warpMult, dt);
                    break;
                case 'gentle':
                    this._updateGentle(i, i3, bass, mids, highs, energy, modeConfig, dt);
                    break;
            }

            // Apply shockwaves
            for (const shock of this._shockwaves) {
                const dx = this.positions[i3] - shock.origin.x;
                const dy = this.positions[i3 + 1] - shock.origin.y;
                const dz = this.positions[i3 + 2] - shock.origin.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
                const waveRadius = shock.time * 30;
                const waveDelta = Math.abs(dist - waveRadius);

                if (waveDelta < 5) {
                    const intensity = (1 - shock.time / shock.maxTime) * shock.force / (waveDelta + 1);
                    this.velocities[i3] += (dx / dist) * intensity * dt * 20;
                    this.velocities[i3 + 1] += (dy / dist) * intensity * dt * 20;
                    this.velocities[i3 + 2] += (dz / dist) * intensity * dt * 20;
                }
            }

            // Highs → shimmer (rapid scale oscillation + brightness)
            const shimmer = highs * trebleResponse * 0.3;
            this.scales[i] = Math.max(0.1, this.scales[i] + Math.sin(this._time * 20 + i) * shimmer * dt * 10);

            // Update rotations
            this.rotations[i3] += (mids * 2 + 0.1) * motionIntensity * dt;
            this.rotations[i3 + 1] += (energy + 0.05) * motionIntensity * dt;

            // Damping
            this.velocities[i3] *= 0.97;
            this.velocities[i3 + 1] *= 0.97;
            this.velocities[i3 + 2] *= 0.97;

            // Apply velocity
            this.positions[i3] += this.velocities[i3] * dt * 60;
            this.positions[i3 + 1] += this.velocities[i3 + 1] * dt * 60;
            this.positions[i3 + 2] += this.velocities[i3 + 2] * dt * 60;
        }

        // Update instance matrices
        this._updateMatrices();
    }

    // — Behaviour update methods —

    _updateExplosive(i, i3, bass, mids, highs, energy, intensity, warp, dt) {
        // Return to base position with spring force
        const returnForce = 0.02 * intensity;
        this.velocities[i3] += (this.basePositions[i3] - this.positions[i3]) * returnForce;
        this.velocities[i3 + 1] += (this.basePositions[i3 + 1] - this.positions[i3 + 1]) * returnForce;
        this.velocities[i3 + 2] += (this.basePositions[i3 + 2] - this.positions[i3 + 2]) * returnForce;

        // Bass pushes outward
        const dist = Math.sqrt(
            this.positions[i3] ** 2 + this.positions[i3 + 1] ** 2 + this.positions[i3 + 2] ** 2
        ) + 0.01;
        const pushForce = bass * 0.5 * intensity * warp;
        this.velocities[i3] += (this.positions[i3] / dist) * pushForce * dt;
        this.velocities[i3 + 1] += (this.positions[i3 + 1] / dist) * pushForce * dt;
        this.velocities[i3 + 2] += (this.positions[i3 + 2] / dist) * pushForce * dt;

        // Mids create orbital motion
        this.velocities[i3] += -this.positions[i3 + 2] * mids * 0.01 * intensity;
        this.velocities[i3 + 2] += this.positions[i3] * mids * 0.01 * intensity;

        // Scale based on energy
        this.scales[i] = (0.3 + energy * 1.5) * (0.7 + bass * 0.8);
    }

    _updateRain(i, i3, bass, mids, highs, energy, config, warp, dt) {
        const pc = config;
        const fallSpeed = (pc.fallSpeed || -2.0) * warp;
        const drift = (pc.horizontalDrift || 0.3) * mids;
        const respawn = pc.respawnHeight || 40;
        const bottom = pc.bottomBound || -40;

        // Fall downward
        this.velocities[i3 + 1] += fallSpeed * dt * (0.5 + energy * 0.5);

        // Horizontal drift from mids
        this.velocities[i3] += Math.sin(this._time + i * 0.1) * drift * dt;
        this.velocities[i3 + 2] += Math.cos(this._time * 0.7 + i * 0.15) * drift * dt * 0.5;

        // Bass burst
        if (bass > 0.5) {
            this.velocities[i3] += (Math.random() - 0.5) * bass * 0.3;
        }

        // Respawn at top
        if (this.positions[i3 + 1] < bottom) {
            this.positions[i3 + 1] = respawn + Math.random() * 10;
            this.positions[i3] = (Math.random() - 0.5) * 80;
            this.positions[i3 + 2] = (Math.random() - 0.5) * 80;
            this.velocities[i3] = 0;
            this.velocities[i3 + 1] = 0;
            this.velocities[i3 + 2] = 0;
        }

        this.scales[i] = 0.3 + energy * 0.5 + highs * 0.3;
    }

    _updateSpiral(i, i3, bass, mids, highs, energy, config, warp, dt) {
        const pc = config;
        const arms = pc.spiralArms || 3;
        const tightness = pc.spiralTightness || 0.3;
        const orbitSpeed = (pc.orbitSpeed || 0.2) * warp;

        const angle = this._time * orbitSpeed + (i % arms) * (Math.PI * 2 / arms);
        const armIndex = i % arms;
        const distFromCenter = 5 + (i / this.maxParticles) * 40;
        const spiralAngle = angle + distFromCenter * tightness;

        // Target position in spiral
        const targetX = Math.cos(spiralAngle) * distFromCenter;
        const targetZ = Math.sin(spiralAngle) * distFromCenter;
        const targetY = Math.sin(this._time * 0.5 + i * 0.05) * (pc.verticalSpread || 5);

        // Smoothly move toward target
        const follow = 0.03 + energy * 0.02;
        this.velocities[i3] += (targetX - this.positions[i3]) * follow;
        this.velocities[i3 + 1] += (targetY - this.positions[i3 + 1]) * follow;
        this.velocities[i3 + 2] += (targetZ - this.positions[i3 + 2]) * follow;

        // Bass expands the spiral
        if (bass > 0.3) {
            const dist = Math.sqrt(this.positions[i3] ** 2 + this.positions[i3 + 2] ** 2) + 0.01;
            this.velocities[i3] += (this.positions[i3] / dist) * bass * 0.2;
            this.velocities[i3 + 2] += (this.positions[i3 + 2] / dist) * bass * 0.2;
        }

        this.scales[i] = 0.3 + energy * 0.6 + Math.sin(this._time * 3 + i) * highs * 0.3;
    }

    _updateDatafall(i, i3, bass, mids, highs, energy, config, warp, dt) {
        const pc = config;
        const fallSpeed = (pc.fallSpeed || -3.0) * warp;
        const spacing = pc.columnSpacing || 2;
        const respawn = pc.respawnHeight || 35;
        const bottom = pc.bottomBound || -35;

        // Column-based positions
        const col = i % 30;
        const targetX = (col - 15) * spacing;

        // Fall
        this.velocities[i3 + 1] += fallSpeed * dt * (0.3 + energy * 0.7);

        // Snap to column
        this.velocities[i3] += (targetX - this.positions[i3]) * 0.1;

        // Flicker on highs
        if (Math.random() < highs * (pc.flickerRate || 0.1)) {
            this.scales[i] = 0.1 + Math.random() * 1.5;
        }

        // Respawn
        if (this.positions[i3 + 1] < bottom) {
            this.positions[i3 + 1] = respawn + Math.random() * 10;
            this.velocities[i3 + 1] = 0;
        }

        this.scales[i] = 0.3 + energy * 0.4;
    }

    _updateTunnel(i, i3, bass, mids, highs, energy, config, warp, dt) {
        const pc = config;
        const speed = (pc.tunnelSpeed || 4.0) * warp;
        const radius = pc.tunnelRadius || 20;
        const respawnDepth = pc.respawnDepth || -100;
        const nearClip = pc.nearClip || 5;
        const spiral = pc.spiralAmount || 0.3;

        // Move toward camera (positive Z)
        this.velocities[i3 + 2] += speed * dt * (0.5 + energy * 1.0);

        // Spiral motion
        const angle = this._time * spiral + i * 0.1;
        this.velocities[i3] += Math.cos(angle) * mids * 0.1;
        this.velocities[i3 + 1] += Math.sin(angle) * mids * 0.1;

        // Respawn behind camera
        if (this.positions[i3 + 2] > nearClip) {
            const theta = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            this.positions[i3] = Math.cos(theta) * r;
            this.positions[i3 + 1] = Math.sin(theta) * r;
            this.positions[i3 + 2] = respawnDepth + Math.random() * 20;
            this.velocities[i3] = 0;
            this.velocities[i3 + 1] = 0;
            this.velocities[i3 + 2] = 0;
        }

        this.scales[i] = 0.2 + energy * 0.6 + bass * 0.4;
    }

    _updateGentle(i, i3, bass, mids, highs, energy, config, dt) {
        const pc = config;
        const floatAmp = pc.floatAmplitude || 0.5;
        const floatFreq = pc.floatFrequency || 0.3;
        const audioScale = pc.audioResponseScale || 0.3;

        // Gentle floating
        const phase = this._time * floatFreq + i * 0.3;
        const targetY = this.basePositions[i3 + 1] + Math.sin(phase) * floatAmp;
        const targetX = this.basePositions[i3] + Math.sin(phase * 0.7) * floatAmp * 0.5;

        this.velocities[i3] += (targetX - this.positions[i3]) * 0.01;
        this.velocities[i3 + 1] += (targetY - this.positions[i3 + 1]) * 0.01;
        this.velocities[i3 + 2] += (this.basePositions[i3 + 2] - this.positions[i3 + 2]) * 0.01;

        // Subtle audio response
        this.scales[i] = 0.3 + energy * audioScale + Math.sin(phase * 2) * 0.1;
    }

    /**
     * Write all particle transforms into the InstancedMesh matrix buffer
     */
    _updateMatrices() {
        for (let i = 0; i < this.maxParticles; i++) {
            const i3 = i * 3;

            _tempPosition.set(
                this.positions[i3],
                this.positions[i3 + 1],
                this.positions[i3 + 2]
            );

            _tempEuler.set(
                this.rotations[i3],
                this.rotations[i3 + 1],
                this.rotations[i3 + 2]
            );
            _tempQuaternion.setFromEuler(_tempEuler);

            const s = Math.max(0.01, this.scales[i]);
            _tempScale.set(s, s, s);

            _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
            this.mesh.setMatrixAt(i, _tempMatrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Update particle colours to match theme
     */
    updateColors() {
        if (!this.mesh) return;

        const colors = this.themeManager.getColors();
        const primaryColor = new THREE.Color(colors.primary);
        const secondaryColor = new THREE.Color(colors.secondary);
        const accentColor = new THREE.Color(colors.accent);

        for (let i = 0; i < this.maxParticles; i++) {
            const t = (i * 0.618) % 1; // golden ratio distribution
            if (t < 0.4) _tempColor.copy(primaryColor);
            else if (t < 0.7) _tempColor.copy(secondaryColor);
            else _tempColor.copy(accentColor);

            _tempColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
            this.mesh.setColorAt(i, _tempColor);
        }
        this.mesh.instanceColor.needsUpdate = true;
    }

    /**
     * Resize particle system (e.g. quality change)
     * @param {number} count
     */
    resize(count) {
        this.maxParticles = count;
        this.positions = new Float32Array(count * 3);
        this.velocities = new Float32Array(count * 3);
        this.scales = new Float32Array(count);
        this.rotations = new Float32Array(count * 3);
        this.lives = new Float32Array(count);
        this.basePositions = new Float32Array(count * 3);
        this._initParticles(50);
        this._createMesh(this.currentShape);
    }

    /**
     * Clean up
     */
    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
