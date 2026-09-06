/**
 * ThemeManager.js — Theme system with AI-powered auto-selection for Cyber-Dither
 * 
 * Provides built-in cyberpunk colour themes, AI-driven theme inference from
 * audio characteristics, and smooth GSAP-powered theme transitions.
 */

const THEMES = {
    neonCyber: {
        label: 'Neon Cyber',
        primary: '#ff2d7b',       // Neon pink
        secondary: '#00f0ff',     // Cyber cyan
        accent: '#9d4eff',        // Electric violet
        background: '#0a0a0f',    // Deep space
        particleGlow: '#ff2d7b',
        bloomTint: '#ff2d7b',
        gridColor: '#1a1a2e',
        starColor: '#ffffff',
        fogColor: '#0d0d1a',
    },
    void: {
        label: 'Void',
        primary: '#9d4eff',
        secondary: '#6b21a8',
        accent: '#c084fc',
        background: '#050510',
        particleGlow: '#9d4eff',
        bloomTint: '#7c3aed',
        gridColor: '#12061f',
        starColor: '#e0d0ff',
        fogColor: '#08041a',
    },
    solar: {
        label: 'Solar',
        primary: '#ff6b35',
        secondary: '#ffd700',
        accent: '#ff3d00',
        background: '#0f0800',
        particleGlow: '#ff8c00',
        bloomTint: '#ff6b35',
        gridColor: '#1a1000',
        starColor: '#ffe0a0',
        fogColor: '#0a0500',
    },
    arctic: {
        label: 'Arctic',
        primary: '#00d4ff',
        secondary: '#80e0ff',
        accent: '#ffffff',
        background: '#040810',
        particleGlow: '#00d4ff',
        bloomTint: '#40c0ff',
        gridColor: '#0a1525',
        starColor: '#c0e8ff',
        fogColor: '#060d18',
    },
    toxic: {
        label: 'Toxic',
        primary: '#39ff14',
        secondary: '#00ff80',
        accent: '#b0ff40',
        background: '#050a04',
        particleGlow: '#39ff14',
        bloomTint: '#20e000',
        gridColor: '#0a1a08',
        starColor: '#d0ffc0',
        fogColor: '#040a03',
    },
    midnight: {
        label: 'Midnight',
        primary: '#4060ff',
        secondary: '#8090c0',
        accent: '#c0d0ff',
        background: '#04060f',
        particleGlow: '#4060ff',
        bloomTint: '#3050d0',
        gridColor: '#0a0f25',
        starColor: '#a0b0e0',
        fogColor: '#030510',
    },
};

// AI classification profiles
const AUDIO_PROFILES = {
    ambient: {
        themes: ['arctic', 'midnight', 'void'],
        characteristics: { energyMax: 0.35, bassMax: 0.3, tempoMax: 0.3 },
    },
    lofi: {
        themes: ['midnight', 'void'],
        characteristics: { energyMax: 0.5, bassRange: [0.2, 0.5], tempoRange: [0.2, 0.5] },
    },
    dance: {
        themes: ['neonCyber', 'solar', 'toxic'],
        characteristics: { energyMin: 0.5, bassMin: 0.4, tempoMin: 0.5 },
    },
    industrial: {
        themes: ['solar', 'void'],
        characteristics: { energyMin: 0.6, highsMin: 0.4, bassMin: 0.5 },
    },
    synthwave: {
        themes: ['neonCyber', 'void'],
        characteristics: { midsMin: 0.3, energyRange: [0.3, 0.7] },
    },
    dnb: {
        themes: ['toxic', 'neonCyber'],
        characteristics: { energyMin: 0.6, bassMin: 0.5, tempoMin: 0.7 },
    },
};

export class ThemeManager {
    constructor(settings) {
        this.settings = settings;
        this.currentTheme = settings.get('theme') || 'neonCyber';
        this.autoMode = true; // AI auto-theme enabled
        this.isTransitioning = false;

        // Cached theme colours as THREE.Color-compatible hex numbers
        this._currentColors = this._parseTheme(this.currentTheme);

        // AI analysis accumulator
        this._analysisBuffer = {
            avgEnergy: 0,
            avgBass: 0,
            avgMids: 0,
            avgHighs: 0,
            sampleCount: 0,
            lastClassification: null,
            lastSwitchTime: 0,
            switchCooldown: 8000, // ms — don't switch themes too often
        };

        /** @type {Set<Function>} Theme change listeners */
        this._listeners = new Set();
    }

    /**
     * Get the current theme data
     * @returns {Object}
     */
    getTheme() {
        return THEMES[this.currentTheme] || THEMES.neonCyber;
    }

    /**
     * Get parsed colour values for Three.js
     * @returns {Object}
     */
    getColors() {
        return this._currentColors;
    }

    /**
     * Get all available theme names and labels
     * @returns {Array<{id: string, label: string}>}
     */
    getThemeList() {
        return Object.entries(THEMES).map(([id, t]) => ({ id, label: t.label }));
    }

    /**
     * Set theme manually (disables AI auto for this session)
     * @param {string} themeId
     */
    setTheme(themeId) {
        if (!THEMES[themeId]) return;
        this.autoMode = false;
        this._transitionTo(themeId);
    }

    /**
     * Enable AI auto-theme selection
     */
    enableAutoTheme() {
        this.autoMode = true;
        this._analysisBuffer.sampleCount = 0;
    }

    /**
     * Update AI analysis — call each frame when audio is playing
     * @param {Object} analysis - from AudioEngine
     */
    updateAI(analysis) {
        if (!this.autoMode) return;

        const buf = this._analysisBuffer;
        const alpha = 0.02; // Smoothing factor

        buf.avgEnergy = buf.avgEnergy * (1 - alpha) + analysis.energy * alpha;
        buf.avgBass = buf.avgBass * (1 - alpha) + analysis.bass * alpha;
        buf.avgMids = buf.avgMids * (1 - alpha) + analysis.mids * alpha;
        buf.avgHighs = buf.avgHighs * (1 - alpha) + analysis.highs * alpha;
        buf.sampleCount++;

        // Only classify after accumulating enough data, and respect cooldown
        const now = performance.now();
        if (buf.sampleCount > 120 && (now - buf.lastSwitchTime) > buf.switchCooldown) {
            const classified = this._classifyAudio(buf);
            if (classified && classified !== buf.lastClassification) {
                buf.lastClassification = classified;
                buf.lastSwitchTime = now;
                const profile = AUDIO_PROFILES[classified];
                if (profile) {
                    // Pick a theme from the profile that isn't current
                    const candidates = profile.themes.filter(t => t !== this.currentTheme);
                    const pick = candidates.length > 0 ? candidates[0] : profile.themes[0];
                    this._transitionTo(pick);
                }
            }
        }
    }

    /**
     * Classify audio into a profile
     * @param {Object} buf - accumulated analysis
     * @returns {string|null}
     */
    _classifyAudio(buf) {
        const { avgEnergy, avgBass, avgMids, avgHighs } = buf;

        // Simple rule-based classification
        if (avgEnergy < 0.2 && avgBass < 0.2) return 'ambient';
        if (avgEnergy < 0.4 && avgBass > 0.15 && avgBass < 0.45) return 'lofi';
        if (avgEnergy > 0.55 && avgBass > 0.45 && avgHighs > 0.35) return 'industrial';
        if (avgEnergy > 0.55 && avgBass > 0.4) return 'dnb';
        if (avgEnergy > 0.4 && avgMids > 0.3) return 'dance';
        if (avgMids > 0.25 && avgEnergy > 0.25) return 'synthwave';

        return null;
    }

    /**
     * Smoothly transition to a new theme using CSS custom properties and GSAP
     * @param {string} themeId
     */
    _transitionTo(themeId) {
        if (themeId === this.currentTheme || this.isTransitioning) return;
        if (!THEMES[themeId]) return;

        this.isTransitioning = true;
        const oldTheme = THEMES[this.currentTheme];
        const newTheme = THEMES[themeId];
        this.currentTheme = themeId;
        this.settings.set('theme', themeId);

        // Update CSS custom properties with transition
        const root = document.documentElement;
        const duration = 1.5;

        // Use GSAP to animate a proxy object, then apply colours
        const proxy = { t: 0 };

        if (typeof gsap !== 'undefined') {
            gsap.to(proxy, {
                t: 1,
                duration,
                ease: 'power2.inOut',
                onUpdate: () => {
                    const t = proxy.t;
                    root.style.setProperty('--primary', this._lerpColor(oldTheme.primary, newTheme.primary, t));
                    root.style.setProperty('--secondary', this._lerpColor(oldTheme.secondary, newTheme.secondary, t));
                    root.style.setProperty('--accent', this._lerpColor(oldTheme.accent, newTheme.accent, t));
                    root.style.setProperty('--bg-deep', this._lerpColor(oldTheme.background, newTheme.background, t));
                },
                onComplete: () => {
                    this._currentColors = this._parseTheme(themeId);
                    this.isTransitioning = false;
                    this._notify(themeId, this._currentColors);
                },
            });
        } else {
            // Fallback: instant switch
            root.style.setProperty('--primary', newTheme.primary);
            root.style.setProperty('--secondary', newTheme.secondary);
            root.style.setProperty('--accent', newTheme.accent);
            root.style.setProperty('--bg-deep', newTheme.background);
            this._currentColors = this._parseTheme(themeId);
            this.isTransitioning = false;
            this._notify(themeId, this._currentColors);
        }
    }

    /**
     * Register a theme change listener
     * @param {Function} fn - (themeId, colors) => void
     */
    onThemeChange(fn) {
        this._listeners.add(fn);
    }

    /**
     * Unregister a theme change listener
     * @param {Function} fn
     */
    offThemeChange(fn) {
        this._listeners.delete(fn);
    }

    _notify(themeId, colors) {
        this._listeners.forEach(fn => {
            try { fn(themeId, colors); } catch (e) { console.error('[ThemeManager] Listener error:', e); }
        });
    }

    /**
     * Parse theme hex colours into numeric values
     * @param {string} themeId
     * @returns {Object}
     */
    _parseTheme(themeId) {
        const t = THEMES[themeId] || THEMES.neonCyber;
        return {
            primary: parseInt(t.primary.slice(1), 16),
            secondary: parseInt(t.secondary.slice(1), 16),
            accent: parseInt(t.accent.slice(1), 16),
            background: parseInt(t.background.slice(1), 16),
            particleGlow: parseInt(t.particleGlow.slice(1), 16),
            bloomTint: parseInt(t.bloomTint.slice(1), 16),
            gridColor: parseInt(t.gridColor.slice(1), 16),
            starColor: parseInt(t.starColor.slice(1), 16),
            fogColor: parseInt(t.fogColor.slice(1), 16),
            // Also keep hex strings
            primaryHex: t.primary,
            secondaryHex: t.secondary,
            accentHex: t.accent,
        };
    }

    /**
     * Lerp between two hex colour strings
     * @param {string} a - '#rrggbb'
     * @param {string} b - '#rrggbb'
     * @param {number} t - 0-1
     * @returns {string}
     */
    _lerpColor(a, b, t) {
        const ar = parseInt(a.slice(1, 3), 16);
        const ag = parseInt(a.slice(3, 5), 16);
        const ab = parseInt(a.slice(5, 7), 16);
        const br = parseInt(b.slice(1, 3), 16);
        const bg = parseInt(b.slice(3, 5), 16);
        const bb = parseInt(b.slice(5, 7), 16);
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl = Math.round(ab + (bb - ab) * t);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
    }
}
