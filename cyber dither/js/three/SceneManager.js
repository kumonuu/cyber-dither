/**
 * SceneManager.js — Three.js scene, renderer, and camera setup for Cyber-Dither
 * 
 * Creates the WebGL renderer, scene, perspective camera, handles window
 * resizing, and provides renderer performance info.
 */

import * as THREE from 'three';

export class SceneManager {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} qualityConfig - from SettingsManager
     */
    constructor(canvas, qualityConfig) {
        this.canvas = canvas;
        this.qualityConfig = qualityConfig;

        // Renderer
        const maxPixelRatio = qualityConfig.maxPixelRatio || 2;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            65,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        this.camera.position.set(0, 2, 30);
        this.camera.lookAt(0, 0, 0);

        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0x111122, 0.5);
        this.scene.add(this.ambientLight);

        // Composer reference (set externally by ShaderEffects)
        this.composer = null;

        // Resize handler
        this._onResize = this._handleResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    /**
     * Set the post-processing composer
     * @param {EffectComposer} composer
     */
    setComposer(composer) {
        this.composer = composer;
    }

    /**
     * Render one frame
     */
    render() {
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Get renderer info for performance monitoring
     * @returns {Object}
     */
    getInfo() {
        return this.renderer.info;
    }

    /**
     * Update background colour
     * @param {number} color - hex number
     */
    setBackground(color) {
        this.scene.background.setHex(color);
    }

    /**
     * Handle window resize
     */
    _handleResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(w, h);

        if (this.composer) {
            this.composer.setSize(w, h);
        }
    }

    /**
     * Update quality config (e.g., when user changes quality tier)
     * @param {Object} config
     */
    updateQuality(config) {
        this.qualityConfig = config;
        const maxPixelRatio = config.maxPixelRatio || 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    }

    /**
     * Clean up
     */
    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }
}
