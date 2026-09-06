/**
 * VisualModeManager.js — Visual mode system for Cyber-Dither
 * 
 * Manages 6 creative interaction modes with smooth GSAP transitions.
 * Each mode defines particle behaviour, colour bias, camera style,
 * and shader intensity.
 */

const VISUAL_MODES = {
    beatStorm: {
        label: 'Beat Storm',
        icon: '⚡',
        description: 'Radial explosions and particle waves on major beats',
        particleBehaviour: 'explosive',
        colorBias: null, // uses theme colours
        cameraPreset: 'orbit',
        shaderIntensity: { bloom: 1.5, glitch: 0.3, chromatic: 0.003 },
        particleConfig: {
            spreadRadius: 50,
            baseVelocity: 0.3,
            beatExplosionForce: 8.0,
            returnForce: 0.02,
            rotationSpeed: 0.01,
        },
    },
    neonRain: {
        label: 'Neon Rain',
        icon: '🌧',
        description: 'Particles stream downward like neon rain',
        particleBehaviour: 'rain',
        colorBias: 'secondary',
        cameraPreset: 'static',
        shaderIntensity: { bloom: 1.2, glitch: 0.1, chromatic: 0.002 },
        particleConfig: {
            spreadRadius: 60,
            baseVelocity: 0.1,
            fallSpeed: -2.0,
            horizontalDrift: 0.3,
            respawnHeight: 40,
            bottomBound: -40,
        },
    },
    galaxy: {
        label: 'Galaxy',
        icon: '🌌',
        description: 'Spiral arms and nebula-like structures',
        particleBehaviour: 'spiral',
        colorBias: 'accent',
        cameraPreset: 'slow',
        shaderIntensity: { bloom: 1.8, glitch: 0.05, chromatic: 0.001 },
        particleConfig: {
            spreadRadius: 40,
            baseVelocity: 0.05,
            spiralArms: 3,
            spiralTightness: 0.3,
            armWidth: 0.4,
            verticalSpread: 5,
            orbitSpeed: 0.2,
        },
    },
    matrix: {
        label: 'Matrix',
        icon: '📟',
        description: 'Digital symbols and data fragments falling through space',
        particleBehaviour: 'datafall',
        colorBias: { r: 0.2, g: 1.0, b: 0.3 }, // green tint
        cameraPreset: 'static',
        shaderIntensity: { bloom: 0.8, glitch: 0.5, chromatic: 0.005, dither: 0.6 },
        particleConfig: {
            spreadRadius: 50,
            baseVelocity: 0.15,
            fallSpeed: -3.0,
            columnSpacing: 2,
            flickerRate: 0.1,
            respawnHeight: 35,
            bottomBound: -35,
        },
    },
    tunnel: {
        label: 'Tunnel',
        icon: '🔮',
        description: 'Objects race toward camera in a vortex',
        particleBehaviour: 'tunnel',
        colorBias: 'primary',
        cameraPreset: 'tunnel',
        shaderIntensity: { bloom: 1.6, glitch: 0.2, chromatic: 0.004 },
        particleConfig: {
            spreadRadius: 30,
            baseVelocity: 0.5,
            tunnelSpeed: 4.0,
            tunnelRadius: 20,
            respawnDepth: -100,
            nearClip: 5,
            spiralAmount: 0.3,
        },
    },
    minimal: {
        label: 'Minimal',
        icon: '〰️',
        description: 'Subtle waveform and gentle particle motion',
        particleBehaviour: 'gentle',
        colorBias: null,
        cameraPreset: 'slow',
        shaderIntensity: { bloom: 0.6, glitch: 0.0, chromatic: 0.0, dither: 0.1 },
        particleConfig: {
            spreadRadius: 35,
            baseVelocity: 0.02,
            floatAmplitude: 0.5,
            floatFrequency: 0.3,
            audioResponseScale: 0.3,
        },
    },
};

export class VisualModeManager {
    constructor(settings) {
        this.settings = settings;
        this.currentMode = settings.get('visualMode') || 'beatStorm';
        this.isTransitioning = false;
        this._transitionProgress = 1.0;

        // Callbacks
        this._onModeChange = null;

        // Transition state
        this._fromMode = null;
        this._toMode = null;
    }

    /**
     * Get current mode configuration
     * @returns {Object}
     */
    getMode() {
        return VISUAL_MODES[this.currentMode] || VISUAL_MODES.beatStorm;
    }

    /**
     * Get mode by id
     * @param {string} id
     * @returns {Object}
     */
    getModeById(id) {
        return VISUAL_MODES[id] || null;
    }

    /**
     * Get all available modes
     * @returns {Array<{id: string, label: string, icon: string, description: string}>}
     */
    getModeList() {
        return Object.entries(VISUAL_MODES).map(([id, m]) => ({
            id,
            label: m.label,
            icon: m.icon,
            description: m.description,
        }));
    }

    /**
     * Switch to a visual mode with smooth transition
     * @param {string} modeId
     */
    setMode(modeId) {
        if (!VISUAL_MODES[modeId] || modeId === this.currentMode) return;
        if (this.isTransitioning) return; // wait for current transition

        this.isTransitioning = true;
        this._fromMode = this.currentMode;
        this._toMode = modeId;
        this._transitionProgress = 0;

        const duration = 1.5;

        if (typeof gsap !== 'undefined') {
            gsap.to(this, {
                _transitionProgress: 1.0,
                duration,
                ease: 'power2.inOut',
                onComplete: () => {
                    this.currentMode = modeId;
                    this.isTransitioning = false;
                    this._fromMode = null;
                    this._toMode = null;
                    this.settings.set('visualMode', modeId);
                    if (this._onModeChange) this._onModeChange(modeId);
                },
            });
        } else {
            // Fallback: instant
            this.currentMode = modeId;
            this._transitionProgress = 1.0;
            this.isTransitioning = false;
            this.settings.set('visualMode', modeId);
            if (this._onModeChange) this._onModeChange(modeId);
        }
    }

    /**
     * Cycle to the next mode
     */
    nextMode() {
        const keys = Object.keys(VISUAL_MODES);
        const currentIdx = keys.indexOf(this.currentMode);
        const nextIdx = (currentIdx + 1) % keys.length;
        this.setMode(keys[nextIdx]);
    }

    /**
     * Get interpolated particle config during transition
     * @returns {Object} blended config
     */
    getParticleConfig() {
        if (!this.isTransitioning || !this._fromMode || !this._toMode) {
            return this.getMode().particleConfig;
        }

        const from = VISUAL_MODES[this._fromMode].particleConfig;
        const to = VISUAL_MODES[this._toMode].particleConfig;
        const t = this._transitionProgress;

        // Lerp numeric values
        const result = {};
        const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
        for (const key of allKeys) {
            const fv = from[key];
            const tv = to[key];
            if (typeof fv === 'number' && typeof tv === 'number') {
                result[key] = fv + (tv - fv) * t;
            } else {
                result[key] = t < 0.5 ? (fv ?? tv) : (tv ?? fv);
            }
        }
        return result;
    }

    /**
     * Get current behaviour name (handles transition blending)
     * @returns {string}
     */
    getBehaviour() {
        if (this.isTransitioning && this._transitionProgress > 0.5 && this._toMode) {
            return VISUAL_MODES[this._toMode].particleBehaviour;
        }
        return this.getMode().particleBehaviour;
    }

    /**
     * Get transition progress (0-1, 1 = complete)
     * @returns {number}
     */
    getTransitionProgress() {
        return this._transitionProgress;
    }

    /**
     * Get shader intensity for current mode (blended during transition)
     * @returns {Object}
     */
    getShaderIntensity() {
        if (!this.isTransitioning || !this._fromMode || !this._toMode) {
            return this.getMode().shaderIntensity;
        }

        const from = VISUAL_MODES[this._fromMode].shaderIntensity;
        const to = VISUAL_MODES[this._toMode].shaderIntensity;
        const t = this._transitionProgress;

        const result = {};
        const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
        for (const key of allKeys) {
            const fv = from[key] ?? 0;
            const tv = to[key] ?? 0;
            result[key] = fv + (tv - fv) * t;
        }
        return result;
    }

    /**
     * Register mode change callback
     * @param {Function} cb
     */
    onModeChange(cb) {
        this._onModeChange = cb;
    }
}
