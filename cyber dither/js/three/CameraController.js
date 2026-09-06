/**
 * CameraController.js — Cinematic camera system for Cyber-Dither
 * 
 * Manages automated orbiting, push-in/pull-out, beat shake, zoom pulses,
 * mouse parallax, warp-speed FOV, and user lock/reset controls.
 */

import * as THREE from 'three';

export class CameraController {
    /**
     * @param {THREE.PerspectiveCamera} camera
     * @param {Object} settings
     */
    constructor(camera, settings) {
        this.camera = camera;
        this.settings = settings;

        // Default camera position
        this.defaultPosition = new THREE.Vector3(0, 2, 30);
        this.defaultTarget = new THREE.Vector3(0, 0, 0);
        this.defaultFOV = 65;

        // Orbit params
        this.orbitRadius = 30;
        this.orbitSpeed = 0.15;
        this.orbitHeight = 2;
        this.orbitAngle = 0;

        // Push in/out
        this.pushCycle = 0;
        this.pushSpeed = 0.05;
        this.pushAmount = 8;

        // State
        this.isLocked = false;
        this.autoMode = true;
        this.currentPreset = 'orbit';

        // Shake
        this.shakeIntensity = 0;
        this.shakeDecay = 0.92;
        this._shakeOffset = new THREE.Vector3();

        // Parallax
        this.mouseX = 0;
        this.mouseY = 0;
        this.parallaxStrength = 2.0;

        // Warp FOV
        this.warpFOVAdd = 0;

        // Look target (for smooth look-at)
        this.lookTarget = new THREE.Vector3(0, 0, 0);

        // Time
        this._time = 0;

        // Bind mouse handler
        this._onMouseMove = (e) => {
            this.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
            this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        };
        window.addEventListener('mousemove', this._onMouseMove);
    }

    /**
     * Set camera preset
     * @param {string} preset - orbit, static, slow, dynamic, aggressive, tunnel, cinematic
     */
    setPreset(preset) {
        this.currentPreset = preset;
        switch (preset) {
            case 'orbit':
                this.orbitSpeed = 0.15;
                this.pushSpeed = 0.05;
                this.pushAmount = 8;
                break;
            case 'static':
                this.orbitSpeed = 0;
                this.pushSpeed = 0;
                this.pushAmount = 0;
                break;
            case 'slow':
                this.orbitSpeed = 0.05;
                this.pushSpeed = 0.02;
                this.pushAmount = 3;
                break;
            case 'dynamic':
                this.orbitSpeed = 0.3;
                this.pushSpeed = 0.08;
                this.pushAmount = 12;
                break;
            case 'aggressive':
                this.orbitSpeed = 0.4;
                this.pushSpeed = 0.1;
                this.pushAmount = 15;
                break;
            case 'tunnel':
                this.orbitSpeed = 0;
                this.pushSpeed = 0;
                this.pushAmount = 0;
                break;
            case 'cinematic':
                this.orbitSpeed = 0.08;
                this.pushSpeed = 0.03;
                this.pushAmount = 5;
                break;
        }
    }

    /**
     * Update camera — call once per frame
     * @param {Object} analysis - audio data
     * @param {Object} warpValues - from WarpController
     * @param {number} dt - delta time
     */
    update(analysis, warpValues, dt) {
        if (this.isLocked) return;

        this._time += dt;
        const cameraSpeed = (this.settings.get('mixer.cameraSpeed') ?? 0.5);
        const reducedMotion = this.settings.get('reducedMotion');

        // Warp FOV
        this.warpFOVAdd = warpValues.fovAdd || 0;

        // Auto camera movements
        if (this.autoMode && this.currentPreset !== 'static') {
            const speed = this.orbitSpeed * cameraSpeed * (warpValues.cameraSpeed || 1);

            if (this.currentPreset === 'tunnel') {
                // Tunnel mode: camera looks forward
                this.camera.position.set(0, 0, 30);
                this.lookTarget.set(0, 0, -100);
            } else {
                // Orbit
                this.orbitAngle += speed * dt;
                this.pushCycle += this.pushSpeed * cameraSpeed * dt;

                const pushOffset = Math.sin(this.pushCycle) * this.pushAmount;
                const currentRadius = this.orbitRadius + pushOffset;

                const targetX = Math.cos(this.orbitAngle) * currentRadius;
                const targetZ = Math.sin(this.orbitAngle) * currentRadius;
                const targetY = this.orbitHeight + Math.sin(this._time * 0.3) * 3;

                // Smooth follow
                this.camera.position.x += (targetX - this.camera.position.x) * 0.02;
                this.camera.position.y += (targetY - this.camera.position.y) * 0.02;
                this.camera.position.z += (targetZ - this.camera.position.z) * 0.02;
            }
        }

        // Mouse parallax
        if (!reducedMotion) {
            const parallax = this.parallaxStrength * cameraSpeed;
            this.camera.position.x += this.mouseX * parallax * dt;
            this.camera.position.y += -this.mouseY * parallax * dt * 0.5;
        }

        // Beat-synced camera shake
        if (analysis.isBeat && !reducedMotion) {
            this.shakeIntensity = Math.min(0.8, analysis.beatIntensity * 0.4);
        }

        if (this.shakeIntensity > 0.01) {
            this._shakeOffset.set(
                (Math.random() - 0.5) * this.shakeIntensity,
                (Math.random() - 0.5) * this.shakeIntensity * 0.5,
                (Math.random() - 0.5) * this.shakeIntensity * 0.3
            );
            this.camera.position.add(this._shakeOffset);
            this.shakeIntensity *= this.shakeDecay;
        }

        // Beat-synced zoom pulse
        if (analysis.isBeat && analysis.beatIntensity > 0.5 && !reducedMotion) {
            const zoomPulse = analysis.beatIntensity * 3;
            this.camera.fov = this.defaultFOV + this.warpFOVAdd - zoomPulse;
        } else {
            // Smoothly return FOV
            const targetFOV = this.defaultFOV + this.warpFOVAdd;
            this.camera.fov += (targetFOV - this.camera.fov) * 0.05;
        }

        this.camera.updateProjectionMatrix();

        // Look at target
        this.camera.lookAt(this.lookTarget);
    }

    /**
     * Lock/unlock camera movement
     */
    toggleLock() {
        this.isLocked = !this.isLocked;
        return this.isLocked;
    }

    /**
     * Reset camera to default position
     */
    reset() {
        this.isLocked = false;

        if (typeof gsap !== 'undefined') {
            gsap.to(this.camera.position, {
                x: this.defaultPosition.x,
                y: this.defaultPosition.y,
                z: this.defaultPosition.z,
                duration: 2,
                ease: 'power3.inOut',
            });
            gsap.to(this, {
                orbitAngle: 0,
                pushCycle: 0,
                duration: 2,
                ease: 'power3.inOut',
            });
            gsap.to(this.camera, {
                fov: this.defaultFOV,
                duration: 1,
                ease: 'power2.out',
                onUpdate: () => this.camera.updateProjectionMatrix(),
            });
        } else {
            this.camera.position.copy(this.defaultPosition);
            this.camera.fov = this.defaultFOV;
            this.camera.updateProjectionMatrix();
            this.orbitAngle = 0;
            this.pushCycle = 0;
        }
    }

    /**
     * Dispose
     */
    dispose() {
        window.removeEventListener('mousemove', this._onMouseMove);
    }
}
