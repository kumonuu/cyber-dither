/**
 * WarpController.js — Warp Speed system for Cyber-Dither
 * 
 * Controls warp speed levels that simultaneously affect playback rate,
 * particle velocity, star streak length, camera speed, and FOV.
 * Uses GSAP for smooth acceleration/deceleration.
 */

const WARP_LEVELS = [
    { level: 0, label: 'OFF',     rate: 1.0,  particleMult: 1.0,  starStretch: 1.0, fovAdd: 0,  cameraSpeed: 1.0 },
    { level: 1, label: 'LVL 1',   rate: 1.15, particleMult: 1.5,  starStretch: 2.0, fovAdd: 5,  cameraSpeed: 1.5 },
    { level: 2, label: 'LVL 2',   rate: 1.35, particleMult: 2.5,  starStretch: 4.0, fovAdd: 12, cameraSpeed: 2.5 },
    { level: 3, label: 'LVL 3',   rate: 1.6,  particleMult: 4.0,  starStretch: 7.0, fovAdd: 20, cameraSpeed: 4.0 },
    { level: 4, label: 'MAXIMUM',  rate: 2.0,  particleMult: 6.0,  starStretch: 12.0, fovAdd: 30, cameraSpeed: 6.0 },
];

export class WarpController {
    constructor(audioEngine, settings) {
        this.audio = audioEngine;
        this.settings = settings;

        /** @type {number} Current warp level index */
        this.currentLevel = 0;

        /** @type {Object} Current interpolated warp values */
        this.values = { ...WARP_LEVELS[0] };

        /** @type {boolean} Whether hold-to-boost is active */
        this.isHolding = false;

        /** @type {number} Continuous hold accumulator */
        this._holdTime = 0;

        /** @type {Object|null} Active GSAP tween */
        this._tween = null;

        // Callbacks
        this._onWarpChange = null;
    }

    /**
     * Get current warp level config
     * @returns {Object}
     */
    getLevel() {
        return WARP_LEVELS[this.currentLevel];
    }

    /**
     * Get all warp levels
     * @returns {Array}
     */
    getLevels() {
        return WARP_LEVELS;
    }

    /**
     * Get current interpolated warp values
     * @returns {Object}
     */
    getValues() {
        return this.values;
    }

    /**
     * Toggle warp speed up one level (cycles back to 0)
     */
    toggle() {
        const nextLevel = (this.currentLevel + 1) % WARP_LEVELS.length;
        this.setLevel(nextLevel);
    }

    /**
     * Set warp to a specific level
     * @param {number} level - 0 to 4
     */
    setLevel(level) {
        level = Math.max(0, Math.min(WARP_LEVELS.length - 1, level));
        if (level === this.currentLevel) return;

        this.currentLevel = level;
        const target = WARP_LEVELS[level];

        // Cancel existing tween
        if (this._tween) {
            this._tween.kill();
        }

        // Smoothly animate warp values
        if (typeof gsap !== 'undefined') {
            this._tween = gsap.to(this.values, {
                rate: target.rate,
                particleMult: target.particleMult,
                starStretch: target.starStretch,
                fovAdd: target.fovAdd,
                cameraSpeed: target.cameraSpeed,
                duration: level > 0 ? 1.2 : 2.0, // Faster acceleration, slower deceleration
                ease: level > 0 ? 'power2.in' : 'power3.out',
                onUpdate: () => {
                    // Update audio playback rate in real-time
                    this.audio.setPlaybackRate(this.values.rate);
                },
                onComplete: () => {
                    this._tween = null;
                },
            });
        } else {
            // Fallback: instant
            Object.assign(this.values, target);
            this.audio.setPlaybackRate(target.rate);
        }

        if (this._onWarpChange) this._onWarpChange(level, target);
    }

    /**
     * Start hold-to-boost
     */
    startHold() {
        this.isHolding = true;
        this._holdTime = 0;
    }

    /**
     * Stop hold-to-boost, return to previous level
     */
    stopHold() {
        if (!this.isHolding) return;
        this.isHolding = false;
        this._holdTime = 0;
        // Return to current set level
        const target = WARP_LEVELS[this.currentLevel];
        if (typeof gsap !== 'undefined') {
            gsap.to(this.values, {
                rate: target.rate,
                particleMult: target.particleMult,
                starStretch: target.starStretch,
                fovAdd: target.fovAdd,
                cameraSpeed: target.cameraSpeed,
                duration: 1.5,
                ease: 'power3.out',
                onUpdate: () => {
                    this.audio.setPlaybackRate(this.values.rate);
                },
            });
        }
    }

    /**
     * Update hold-to-boost — call each frame while holding
     * @param {number} dt - delta time in seconds
     */
    updateHold(dt) {
        if (!this.isHolding) return;

        this._holdTime += dt;

        // Ramp up warp over 3 seconds from current level to MAXIMUM
        const maxLevel = WARP_LEVELS[WARP_LEVELS.length - 1];
        const currentLevel = WARP_LEVELS[this.currentLevel];
        const progress = Math.min(this._holdTime / 3.0, 1.0);
        const ease = progress * progress; // Quadratic ease-in

        this.values.rate = currentLevel.rate + (maxLevel.rate - currentLevel.rate) * ease;
        this.values.particleMult = currentLevel.particleMult + (maxLevel.particleMult - currentLevel.particleMult) * ease;
        this.values.starStretch = currentLevel.starStretch + (maxLevel.starStretch - currentLevel.starStretch) * ease;
        this.values.fovAdd = currentLevel.fovAdd + (maxLevel.fovAdd - currentLevel.fovAdd) * ease;
        this.values.cameraSpeed = currentLevel.cameraSpeed + (maxLevel.cameraSpeed - currentLevel.cameraSpeed) * ease;

        this.audio.setPlaybackRate(this.values.rate);
    }

    /**
     * Check if warp is active (level > 0 or holding)
     * @returns {boolean}
     */
    isActive() {
        return this.currentLevel > 0 || this.isHolding;
    }

    /**
     * Get normalised warp intensity (0-1)
     * @returns {number}
     */
    getIntensity() {
        const max = WARP_LEVELS[WARP_LEVELS.length - 1];
        return (this.values.rate - 1) / (max.rate - 1);
    }

    /**
     * Set warp change callback
     * @param {Function} cb - (level, config) => void
     */
    onWarpChange(cb) {
        this._onWarpChange = cb;
    }

    /**
     * Reset to off
     */
    reset() {
        this.setLevel(0);
    }
}
