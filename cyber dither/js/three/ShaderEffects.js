/**
 * ShaderEffects.js — Post-processing pipeline for Cyber-Dither
 * 
 * Creates the EffectComposer with custom shader passes: Bloom, Dither,
 * Scanlines, Chromatic Aberration, Film Grain, Glitch, and Vignette.
 * All pass intensities are configurable and respond to audio/settings.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ── Custom Shader: Dither Pass ──
const DitherShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        intensity: { value: 0.3 },
        time: { value: 0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float intensity;
        uniform float time;
        varying vec2 vUv;

        // 4x4 Bayer dithering matrix
        float bayerMatrix(vec2 coord) {
            vec2 c = floor(mod(coord, 4.0));
            mat4 bayer = mat4(
                0.0, 12.0, 3.0, 15.0,
                8.0, 4.0, 11.0, 7.0,
                2.0, 14.0, 1.0, 13.0,
                10.0, 6.0, 9.0, 5.0
            ) / 16.0;
            int x = int(c.x);
            int y = int(c.y);
            vec4 col = (x == 0) ? bayer[0] : (x == 1) ? bayer[1] : (x == 2) ? bayer[2] : bayer[3];
            return (y == 0) ? col.x : (y == 1) ? col.y : (y == 2) ? col.z : col.w;
        }

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 pixelCoord = vUv * resolution;

            // Apply Bayer dithering
            float threshold = bayerMatrix(pixelCoord) - 0.5;
            vec3 dithered = texel.rgb + threshold * intensity * 0.15;

            // Quantize colours slightly for retro feel
            float levels = mix(256.0, 16.0, intensity * 0.5);
            dithered = floor(dithered * levels + 0.5) / levels;

            gl_FragColor = vec4(mix(texel.rgb, dithered, intensity), texel.a);
        }
    `,
};

// ── Custom Shader: Scanline Pass ──
const ScanlineShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        intensity: { value: 0.15 },
        time: { value: 0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float intensity;
        uniform float time;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);

            // Scanlines
            float scanline = sin((vUv.y * resolution.y + time * 30.0) * 3.14159) * 0.5 + 0.5;
            scanline = pow(scanline, 1.5);
            float scanEffect = 1.0 - scanline * intensity * 0.3;

            // Subtle CRT curvature darkening at edges
            vec2 center = vUv - 0.5;
            float dist = dot(center, center);
            float crt = 1.0 - dist * intensity * 0.3;

            gl_FragColor = vec4(texel.rgb * scanEffect * crt, texel.a);
        }
    `,
};

// ── Custom Shader: Chromatic Aberration ──
const ChromaticShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.003 },
        time: { value: 0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float time;
        varying vec2 vUv;

        void main() {
            vec2 offset = amount * (vUv - 0.5);
            float r = texture2D(tDiffuse, vUv + offset).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - offset).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `,
};

// ── Custom Shader: Film Grain ──
const GrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.08 },
        time: { value: 0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float time;
        varying vec2 vUv;

        float rand(vec2 co) {
            return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            float noise = (rand(vUv + time) - 0.5) * intensity;
            gl_FragColor = vec4(texel.rgb + noise, texel.a);
        }
    `,
};

// ── Custom Shader: Glitch ──
const GlitchShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.0 },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float time;
        uniform vec2 resolution;
        varying vec2 vUv;

        float rand(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
            if (intensity < 0.01) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }

            vec2 uv = vUv;

            // Horizontal displacement glitch
            float lineJitter = step(0.99 - intensity * 0.15, rand(floor(uv.y * 50.0) + time));
            uv.x += lineJitter * (rand(time + uv.y) - 0.5) * intensity * 0.1;

            // Block glitch
            float blockGlitch = step(0.995 - intensity * 0.01, rand(floor(time * 10.0)));
            if (blockGlitch > 0.5) {
                float blockY = floor(uv.y * 10.0) / 10.0;
                uv.x += (rand(blockY + time) - 0.5) * intensity * 0.15;
            }

            // RGB split on glitch
            float split = intensity * 0.01 * lineJitter;
            float r = texture2D(tDiffuse, uv + vec2(split, 0.0)).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - vec2(split, 0.0)).b;

            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `,
};

// ── Custom Shader: Vignette ──
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.3 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 center = vUv - 0.5;
            float dist = dot(center, center);
            float vignette = 1.0 - dist * intensity * 2.0;
            vignette = clamp(vignette, 0.0, 1.0);
            gl_FragColor = vec4(texel.rgb * vignette, texel.a);
        }
    `,
};

export class ShaderEffects {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {THREE.PerspectiveCamera} camera
     * @param {Object} settings
     */
    constructor(renderer, scene, camera, settings) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.settings = settings;
        this._time = 0;

        const qualityConfig = settings.getQualityConfig();
        const mixer = settings.get('mixer') || {};
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Create composer
        this.composer = new EffectComposer(renderer);

        // Render pass
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);

        // Bloom
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w, h),
            mixer.bloomStrength ?? 1.5,
            mixer.bloomRadius ?? 0.4,
            0.85
        );
        this.bloomPass.enabled = qualityConfig.bloomEnabled;
        this.composer.addPass(this.bloomPass);

        // Dither
        this.ditherPass = new ShaderPass(DitherShader);
        this.ditherPass.uniforms.resolution.value.set(w, h);
        this.ditherPass.uniforms.intensity.value = mixer.ditherAmount ?? 0.3;
        this.ditherPass.enabled = qualityConfig.ditherEnabled;
        this.composer.addPass(this.ditherPass);

        // Scanlines
        this.scanlinePass = new ShaderPass(ScanlineShader);
        this.scanlinePass.uniforms.resolution.value.set(w, h);
        this.scanlinePass.uniforms.intensity.value = mixer.scanlineIntensity ?? 0.15;
        this.scanlinePass.enabled = qualityConfig.scanlineEnabled;
        this.composer.addPass(this.scanlinePass);

        // Chromatic aberration
        this.chromaticPass = new ShaderPass(ChromaticShader);
        this.chromaticPass.uniforms.amount.value = mixer.chromaticAmount ?? 0.003;
        this.chromaticPass.enabled = qualityConfig.chromaticEnabled;
        this.composer.addPass(this.chromaticPass);

        // Film grain
        this.grainPass = new ShaderPass(GrainShader);
        this.grainPass.uniforms.intensity.value = mixer.grainIntensity ?? 0.08;
        this.grainPass.enabled = qualityConfig.grainEnabled;
        this.composer.addPass(this.grainPass);

        // Glitch (disabled by default, triggered on beats)
        this.glitchPass = new ShaderPass(GlitchShader);
        this.glitchPass.uniforms.resolution.value.set(w, h);
        this.glitchPass.uniforms.intensity.value = 0;
        this.glitchPass.enabled = qualityConfig.glitchEnabled;
        this.composer.addPass(this.glitchPass);

        // Vignette
        this.vignettePass = new ShaderPass(VignetteShader);
        this.vignettePass.uniforms.intensity.value = mixer.vignetteIntensity ?? 0.3;
        this.vignettePass.enabled = true; // always lightweight
        this.composer.addPass(this.vignettePass);

        // Output pass (tone mapping)
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        // Glitch state
        this._glitchActive = 0;
    }

    /**
     * Update shader uniforms — call once per frame
     * @param {Object} analysis - audio analysis
     * @param {Object} modeShaderIntensity - from VisualModeManager
     * @param {number} dt - delta time
     */
    update(analysis, modeShaderIntensity, dt) {
        this._time += dt;

        const mixer = this.settings.get('mixer') || {};

        // Update time uniforms
        if (this.ditherPass.enabled) {
            this.ditherPass.uniforms.time.value = this._time;
        }
        if (this.scanlinePass.enabled) {
            this.scanlinePass.uniforms.time.value = this._time;
        }
        if (this.grainPass.enabled) {
            this.grainPass.uniforms.time.value = this._time;
        }
        if (this.glitchPass.enabled) {
            this.glitchPass.uniforms.time.value = this._time;
        }
        if (this.chromaticPass.enabled) {
            this.chromaticPass.uniforms.time.value = this._time;
        }

        // Audio-reactive bloom
        if (this.bloomPass.enabled) {
            const baseStrength = mixer.bloomStrength ?? 1.5;
            const modeBloom = modeShaderIntensity.bloom ?? 1.5;
            this.bloomPass.strength = baseStrength * (modeBloom / 1.5) * (0.8 + analysis.volume * 0.8);
        }

        // Audio-reactive chromatic aberration (intensify on beats)
        if (this.chromaticPass.enabled) {
            const baseAmount = mixer.chromaticAmount ?? 0.003;
            const modeChromatic = modeShaderIntensity.chromatic ?? 0.003;
            let chromatic = baseAmount * (modeChromatic / 0.003);
            if (analysis.isBeat) {
                chromatic += analysis.beatIntensity * 0.01;
            }
            this.chromaticPass.uniforms.amount.value += (chromatic - this.chromaticPass.uniforms.amount.value) * 0.1;
        }

        // Beat-triggered glitch
        if (this.glitchPass.enabled) {
            const baseGlitch = mixer.glitchIntensity ?? 0.2;
            const modeGlitch = modeShaderIntensity.glitch ?? 0.2;

            if (analysis.isBeat && analysis.beatIntensity > 0.6) {
                this._glitchActive = baseGlitch * (modeGlitch / 0.2) * analysis.beatIntensity;
            }
            this._glitchActive *= 0.9; // decay
            this.glitchPass.uniforms.intensity.value = this._glitchActive;
        }

        // Dither from mode
        if (this.ditherPass.enabled) {
            const baseDither = mixer.ditherAmount ?? 0.3;
            const modeDither = modeShaderIntensity.dither ?? baseDither;
            this.ditherPass.uniforms.intensity.value += (modeDither - this.ditherPass.uniforms.intensity.value) * 0.05;
        }
    }

    /**
     * Update pass enabled states from quality config
     * @param {Object} qualityConfig
     */
    updateQuality(qualityConfig) {
        this.bloomPass.enabled = qualityConfig.bloomEnabled;
        this.ditherPass.enabled = qualityConfig.ditherEnabled;
        this.scanlinePass.enabled = qualityConfig.scanlineEnabled;
        this.chromaticPass.enabled = qualityConfig.chromaticEnabled;
        this.grainPass.enabled = qualityConfig.grainEnabled;
        this.glitchPass.enabled = qualityConfig.glitchEnabled;
    }

    /**
     * Handle resize
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
        this.composer.setSize(w, h);
        if (this.bloomPass && typeof this.bloomPass.setSize === 'function') {
            this.bloomPass.setSize(w, h);
        }
        this.ditherPass.uniforms.resolution.value.set(w, h);
        this.scanlinePass.uniforms.resolution.value.set(w, h);
        this.glitchPass.uniforms.resolution.value.set(w, h);
    }

    /**
     * Get the composer for SceneManager
     * @returns {EffectComposer}
     */
    getComposer() {
        return this.composer;
    }

    /**
     * Dispose all passes
     */
    dispose() {
        this.composer.passes.forEach(pass => {
            if (pass.dispose) pass.dispose();
        });
    }
}
