/**
 * main.js — Application Coordinator & Entry Point for Cyber-Dither
 * 
 * Initializes and wires Three.js scene, Web Audio engine, procedural genre tracks,
 * post-processing shaders, cinematic camera, holographic HUD, inputs, and the
 * high-performance 60fps render loop.
 */

import { AudioEngine } from './audio/AudioEngine.js';
import { GenreAudioSynthesizer } from './audio/GenreAudioSynthesizer.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { ThemeManager } from './managers/ThemeManager.js';
import { TrackLibrary } from './managers/TrackLibrary.js';
import { VisualModeManager } from './managers/VisualModeManager.js';
import { WarpController } from './managers/WarpController.js';
import { SceneManager } from './three/SceneManager.js';
import { CameraController } from './three/CameraController.js';
import { Environment } from './three/Environment.js';
import { ObjectLayer } from './three/ObjectLayer.js';
import { ParticleEngine } from './three/ParticleEngine.js';
import { ShaderEffects } from './three/ShaderEffects.js';
import { CursorTrail } from './three/CursorTrail.js';
import { HUDController } from './ui/HUDController.js';
import { WelcomeScreen } from './ui/WelcomeScreen.js';
import { InputManager } from './input/InputManager.js';
import { VoiceControl } from './input/VoiceControl.js';

class CyberDitherApp {
    constructor() {
        this.isRunning = false;
        this.lastTime = performance.now();
        this.animationFrameId = null;

        this._init();
    }

    async _init() {
        // 1. Settings & Quality detection
        this.settings = new SettingsManager();
        const detectedQuality = this.settings.autoDetectQuality();
        if (!localStorage.getItem('cyberDither_settings')) {
            this.settings.setQuality(detectedQuality);
        }
        const qualityConfig = this.settings.getQualityConfig();

        // 2. Theme Manager
        this.themeManager = new ThemeManager(this.settings);

        // 3. Three.js Scene, Camera, Renderer
        const canvas = document.getElementById('three-canvas');
        this.sceneManager = new SceneManager(canvas, qualityConfig);
        const colors = this.themeManager.getColors();
        this.sceneManager.setBackground(colors.background);

        // 4. Post-processing Shaders
        this.shaderEffects = new ShaderEffects(
            this.sceneManager.renderer,
            this.sceneManager.scene,
            this.sceneManager.camera,
            this.settings
        );
        this.sceneManager.setComposer(this.shaderEffects.getComposer());

        // Handle resize across renderer & composer
        this._setupResizeHandler();

        // 5. 3D Scene Components
        this.cameraController = new CameraController(this.sceneManager.camera, this.settings);
        this.environment = new Environment(this.sceneManager.scene, this.settings, this.themeManager);
        this.objectLayer = new ObjectLayer(this.sceneManager.scene, this.themeManager);
        this.particleEngine = new ParticleEngine(this.sceneManager.scene, this.settings, this.themeManager);
        this.cursorTrail = new CursorTrail(this.sceneManager.scene, this.sceneManager.camera, this.themeManager);

        // 6. Audio Engine & Library
        this.audioEngine = new AudioEngine();
        this.warpController = new WarpController(this.audioEngine, this.settings);
        this.visualModeManager = new VisualModeManager(this.settings);
        this.trackLibrary = new TrackLibrary();

        // Generate built-in genre audio tracks (16-bit 44.1kHz Stereo WAV blobs)
        const builtInTracks = GenreAudioSynthesizer.generateAllTracks();
        for (const track of builtInTracks) {
            this.trackLibrary.playlist.push(track);
        }

        // Preload the first track (Synthwave)
        if (this.trackLibrary.playlist.length > 0) {
            this.trackLibrary.selectTrack(0);
            const initialTrack = this.trackLibrary.getCurrent();
            if (initialTrack) {
                this.audioEngine.loadTrack(initialTrack);
            }
        }

        // 7. HUD & User Interface
        this.hudController = new HUDController({
            audioEngine: this.audioEngine,
            settings: this.settings,
            themeManager: this.themeManager,
            warpController: this.warpController,
            visualModeManager: this.visualModeManager,
            trackLibrary: this.trackLibrary,
            particleEngine: this.particleEngine,
            cameraController: this.cameraController,
        });

        // Build all HUD panels
        this.hudController.buildVisualModePanel();
        this.hudController.buildThemePanel();
        this.hudController.buildLibraryPanel();
        this.hudController.buildSettingsPanel();

        // 8. Input & Gesture Managers
        this.inputManager = new InputManager({
            audioEngine: this.audioEngine,
            warpController: this.warpController,
            visualModeManager: this.visualModeManager,
            cameraController: this.cameraController,
            hudController: this.hudController,
            settings: this.settings,
        });

        // 9. Voice Control
        this.voiceControl = new VoiceControl({
            audioEngine: this.audioEngine,
            warpController: this.warpController,
            visualModeManager: this.visualModeManager,
            themeManager: this.themeManager,
            hudController: this.hudController,
            settings: this.settings,
        });

        // 10. Wire cross-module event listeners
        this._bindEventListeners();

        // 11. Welcome Screen
        this.welcomeScreen = new WelcomeScreen(async () => {
            await this.audioEngine.init();
            await this.audioEngine.play();
            this.hudController._updatePlayButton();
            this.hudController.buildLibraryPanel();
            this.hudController.showToast('System Online. Welcome to Cyber-Dither.', 'success');
        });

        // Start render loop
        this.isRunning = true;
        this.lastTime = performance.now();
        this._loop();
    }

    _setupResizeHandler() {
        const handleResize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.shaderEffects.resize(w, h);

            // Resize spectrum & waveform canvases
            const sCanvas = document.getElementById('spectrum-canvas');
            if (sCanvas) {
                sCanvas.width = sCanvas.clientWidth || 240;
                sCanvas.height = sCanvas.clientHeight || 50;
            }
            const wCanvas = document.getElementById('waveform-canvas');
            if (wCanvas) {
                wCanvas.width = wCanvas.clientWidth || 240;
                wCanvas.height = wCanvas.clientHeight || 50;
            }
        };
        window.addEventListener('resize', handleResize);
        // Trigger once initially
        setTimeout(handleResize, 100);
    }

    _bindEventListeners() {
        // Theme updates across Three.js materials
        this.themeManager.onThemeChange((themeId, colors) => {
            this.sceneManager.setBackground(colors.background);
            this.environment.updateColors();
            this.particleEngine.updateColors();
            this.objectLayer.updateColors();
            this.cursorTrail.updateColors();
            this.hudController.buildThemePanel();
        });

        // Visual mode updates camera preset
        this.visualModeManager.onModeChange((modeId) => {
            const mode = this.visualModeManager.getModeById(modeId);
            if (mode?.cameraPreset) {
                this.cameraController.setPreset(mode.cameraPreset);
            }
            this.hudController.buildVisualModePanel();
        });

        // Quality updates
        this.settings.onChange((path, val) => {
            if (path === 'quality') {
                const qCfg = this.settings.getQualityConfig();
                this.sceneManager.updateQuality(qCfg);
                this.shaderEffects.updateQuality(qCfg);
            }
        });

        // Key H to toggle HUD
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'KeyH') {
                e.preventDefault();
                this.hudController.toggleHUD();
            }
        });

        // Resource cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.dispose();
        });
    }

    _loop() {
        if (!this.isRunning) return;

        const now = performance.now();
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Clamp dt to avoid physics jumps when tab is blurred
        if (dt > 0.1) dt = 0.1;
        if (dt < 0.001) dt = 0.001;

        // 1. Audio frequency, waveform & beat analysis
        const analysis = this.audioEngine.update();

        // 2. AI Theme classification
        if (this.audioEngine.isPlaying) {
            this.themeManager.updateAI(analysis);
        }

        // 3. Inputs (Hold-to-boost warp)
        this.inputManager.update(dt);

        // 4. Warp values
        const warpValues = this.warpController.getValues();

        // 5. Cinematic camera
        this.cameraController.update(analysis, warpValues, dt);

        // 6. 3D Environment (grid, stars, rings, beams, pulses, fog)
        this.environment.update(analysis, warpValues, dt);

        // 7. 3D Objects (wireframe sphere, torus knot, waveform ribbon, rings)
        this.objectLayer.update(analysis, dt);

        // 8. Particle Engine (InstancedMesh particles with mode behavior)
        const currentMode = this.visualModeManager.getMode();
        this.particleEngine.update(analysis, currentMode, warpValues, dt);

        // 9. Cursor Trail & Click explosions
        this.cursorTrail.update(dt);

        // 10. Post-processing shader passes (Bloom, Dither, CRT, Glitch, Chromatic, Grain, Vignette)
        this.shaderEffects.update(analysis, this.visualModeManager.getShaderIntensity(), dt);

        // 11. Render composer
        this.sceneManager.render();

        // 12. Update Holographic HUD (FPS, spectrum bars, waveform oscilloscope, meters, indicators)
        this.hudController.update(analysis, dt);

        this.animationFrameId = requestAnimationFrame(() => this._loop());
    }

    dispose() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.audioEngine?.dispose();
        this.trackLibrary?.dispose();
        this.sceneManager?.dispose();
        this.shaderEffects?.dispose();
        this.environment?.dispose();
        this.objectLayer?.dispose();
        this.particleEngine?.dispose();
        this.cursorTrail?.dispose();
        this.cameraController?.dispose();
        this.voiceControl?.dispose();
    }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CyberDitherApp();
});
