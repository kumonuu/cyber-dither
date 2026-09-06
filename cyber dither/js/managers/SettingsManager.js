/**
 * SettingsManager.js — Persistent settings & quality control for Cyber-Dither
 * 
 * Manages quality presets (Low/Medium/High/Ultra), custom visual mixer values,
 * user preferences, and saves/loads everything to localStorage.
 */

const STORAGE_KEY = 'cyberDither_settings';
const PRESETS_KEY = 'cyberDither_presets';

// Quality tier definitions
const QUALITY_TIERS = {
    low: {
        label: 'Low',
        particleCount: 2000,
        bloomEnabled: true,
        bloomSamples: 4,
        ditherEnabled: false,
        chromaticEnabled: false,
        grainEnabled: false,
        glitchEnabled: false,
        scanlineEnabled: false,
        starCount: 500,
        envComplexity: 0.3,
        maxPixelRatio: 1,
        shadowsEnabled: false,
    },
    medium: {
        label: 'Medium',
        particleCount: 5000,
        bloomEnabled: true,
        bloomSamples: 8,
        ditherEnabled: true,
        chromaticEnabled: false,
        grainEnabled: true,
        glitchEnabled: true,
        scanlineEnabled: true,
        starCount: 1500,
        envComplexity: 0.6,
        maxPixelRatio: 1.5,
        shadowsEnabled: false,
    },
    high: {
        label: 'High',
        particleCount: 10000,
        bloomEnabled: true,
        bloomSamples: 16,
        ditherEnabled: true,
        chromaticEnabled: true,
        grainEnabled: true,
        glitchEnabled: true,
        scanlineEnabled: true,
        starCount: 3000,
        envComplexity: 0.85,
        maxPixelRatio: 2,
        shadowsEnabled: true,
    },
    ultra: {
        label: 'Ultra',
        particleCount: 20000,
        bloomEnabled: true,
        bloomSamples: 32,
        ditherEnabled: true,
        chromaticEnabled: true,
        grainEnabled: true,
        glitchEnabled: true,
        scanlineEnabled: true,
        starCount: 5000,
        envComplexity: 1.0,
        maxPixelRatio: 2,
        shadowsEnabled: true,
    },
};

// Default settings
const DEFAULTS = {
    // Quality
    quality: 'high',

    // Audio
    volume: 0.75,
    isMuted: false,

    // Visual mixer
    mixer: {
        palette: 'neonCyber',       // theme name
        particleCount: 10000,
        particleShape: 'points',     // points, cubes, diamonds, rings, shards, hexagons, crystals
        motionIntensity: 0.7,        // 0-1
        bassResponse: 0.8,           // 0-1
        trebleResponse: 0.6,         // 0-1
        glowIntensity: 0.7,          // 0-1
        ditherAmount: 0.3,           // 0-1
        glitchIntensity: 0.2,        // 0-1
        cameraSpeed: 0.5,            // 0-1
        starDensity: 0.6,            // 0-1
        backgroundEffects: true,
        bloomStrength: 1.5,
        bloomRadius: 0.4,
        scanlineIntensity: 0.15,
        chromaticAmount: 0.003,
        grainIntensity: 0.08,
        vignetteIntensity: 0.3,
    },

    // UI state
    theme: 'neonCyber',
    visualMode: 'beatStorm',
    lastTrackIndex: 0,
    reducedMotion: false,
    showFPS: true,
    showHUD: true,

    // Camera
    cameraLocked: false,
    autoCamera: true,
};

export class SettingsManager {
    constructor() {
        /** @type {Object} Current settings */
        this.settings = this._deepClone(DEFAULTS);

        /** @type {Object} Saved user presets */
        this.userPresets = {};

        /** @type {Set<Function>} Change listeners */
        this._listeners = new Set();

        // Load from storage
        this._load();
    }

    /**
     * Get current quality tier config
     * @returns {Object}
     */
    getQualityConfig() {
        return QUALITY_TIERS[this.settings.quality] || QUALITY_TIERS.high;
    }

    /**
     * Get all quality tier names
     * @returns {string[]}
     */
    getQualityTiers() {
        return Object.keys(QUALITY_TIERS);
    }

    /**
     * Set quality tier
     * @param {string} tier
     */
    setQuality(tier) {
        if (QUALITY_TIERS[tier]) {
            this.settings.quality = tier;
            // Update mixer particle count to match tier
            this.settings.mixer.particleCount = QUALITY_TIERS[tier].particleCount;
            this._save();
            this._notify('quality', tier);
        }
    }

    /**
     * Get a setting value by dot-notation path
     * @param {string} path - e.g. 'mixer.glowIntensity'
     * @returns {*}
     */
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.settings);
    }

    /**
     * Set a setting value by dot-notation path
     * @param {string} path
     * @param {*} value
     */
    set(path, value) {
        const keys = path.split('.');
        let obj = this.settings;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this._save();
        this._notify(path, value);
    }

    /**
     * Get the full settings object
     * @returns {Object}
     */
    getAll() {
        return this._deepClone(this.settings);
    }

    /**
     * Reset to defaults
     */
    reset() {
        this.settings = this._deepClone(DEFAULTS);
        this._save();
        this._notify('reset', null);
    }

    /**
     * Save current mixer as a named preset
     * @param {string} name
     */
    savePreset(name) {
        this.userPresets[name] = this._deepClone(this.settings.mixer);
        this._savePresets();
    }

    /**
     * Load a named preset into the mixer
     * @param {string} name
     * @returns {boolean}
     */
    loadPreset(name) {
        if (this.userPresets[name]) {
            this.settings.mixer = this._deepClone(this.userPresets[name]);
            this._save();
            this._notify('preset', name);
            return true;
        }
        return false;
    }

    /**
     * Delete a named preset
     * @param {string} name
     */
    deletePreset(name) {
        delete this.userPresets[name];
        this._savePresets();
    }

    /**
     * Get list of saved preset names
     * @returns {string[]}
     */
    getPresetNames() {
        return Object.keys(this.userPresets);
    }

    /**
     * Register a change listener
     * @param {Function} fn - (path, value) => void
     */
    onChange(fn) {
        this._listeners.add(fn);
    }

    /**
     * Remove a change listener
     * @param {Function} fn
     */
    offChange(fn) {
        this._listeners.delete(fn);
    }

    /**
     * Estimate device performance and auto-select quality
     * @returns {string} recommended quality tier
     */
    autoDetectQuality() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return 'low';

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        const cores = navigator.hardwareConcurrency || 2;
        const memory = navigator.deviceMemory || 4;

        // Heuristic scoring
        let score = 0;
        if (!isMobile) score += 2;
        if (cores >= 8) score += 2;
        else if (cores >= 4) score += 1;
        if (memory >= 8) score += 2;
        else if (memory >= 4) score += 1;
        if (/RTX|GTX|Radeon RX|Apple M[2-9]/i.test(renderer)) score += 3;
        else if (/Intel|Mali|Adreno/i.test(renderer)) score += 0;

        canvas.remove();

        if (score >= 7) return 'ultra';
        if (score >= 5) return 'high';
        if (score >= 3) return 'medium';
        return 'low';
    }

    // — Private methods —

    _notify(path, value) {
        this._listeners.forEach(fn => {
            try { fn(path, value); } catch (e) { console.error('[Settings] Listener error:', e); }
        });
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch (e) {
            console.warn('[Settings] Failed to save:', e);
        }
    }

    _load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.settings = this._merge(this._deepClone(DEFAULTS), parsed);
            }
        } catch (e) {
            console.warn('[Settings] Failed to load:', e);
        }

        try {
            const presets = localStorage.getItem(PRESETS_KEY);
            if (presets) {
                this.userPresets = JSON.parse(presets);
            }
        } catch (e) {
            console.warn('[Settings] Failed to load presets:', e);
        }
    }

    _savePresets() {
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(this.userPresets));
        } catch (e) {
            console.warn('[Settings] Failed to save presets:', e);
        }
    }

    _merge(target, source) {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this._merge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    _deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
}
