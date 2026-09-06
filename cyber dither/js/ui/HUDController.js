/**
 * HUDController.js — Holographic HUD interface for Cyber-Dither
 * 
 * Manages all UI elements: transport controls, progress bar, spectrum bars,
 * waveform display, beat indicator, audio meters, settings panels,
 * tooltips, preset management, playlist view, and visual feedback.
 */

export class HUDController {
    /**
     * @param {Object} audioEngineOrDeps
     * @param {Object} [settings]
     * @param {Object} [themeManager]
     * @param {Object} [warpController]
     * @param {Object} [visualModeManager]
     * @param {Object} [trackLibrary]
     * @param {Object} [particleEngine]
     * @param {Object} [cameraController]
     */
    constructor(audioEngineOrDeps, settings, themeManager, warpController, visualModeManager, trackLibrary, particleEngine, cameraController) {
        if (audioEngineOrDeps && audioEngineOrDeps.audioEngine) {
            const deps = audioEngineOrDeps;
            this.audio = deps.audioEngine;
            this.settings = deps.settings;
            this.theme = deps.themeManager;
            this.warp = deps.warpController;
            this.visualMode = deps.visualModeManager;
            this.library = deps.trackLibrary;
            this.particleEngine = deps.particleEngine || null;
            this.camera = deps.cameraController || null;
        } else {
            this.audio = audioEngineOrDeps;
            this.settings = settings;
            this.theme = themeManager;
            this.warp = warpController;
            this.visualMode = visualModeManager;
            this.library = trackLibrary;
            this.particleEngine = particleEngine || null;
            this.camera = cameraController || null;
        }

        // State
        this._fpsFrames = 0;
        this._fpsTime = 0;
        this._fpsDisplay = 0;
        this._hudHidden = false;

        // Canvases
        this.spectrumCanvas = document.getElementById('spectrum-canvas');
        this.spectrumCtx = this.spectrumCanvas?.getContext('2d');
        this.waveformCanvas = document.getElementById('waveform-canvas');
        this.waveformCtx = this.waveformCanvas?.getContext('2d');

        // Cache elements
        this._cacheElements();

        // Bind events
        this._bindEvents();

        // Initial setup
        this._updateTrackInfo();
        this._updatePlayButton();
        this._updateWarpDisplay();
    }

    setEngineReferences({ particleEngine, cameraController }) {
        if (particleEngine) this.particleEngine = particleEngine;
        if (cameraController) this.camera = cameraController;
    }

    /**
     * Cache all HUD DOM element references
     */
    _cacheElements() {
        this.els = {
            // Track info
            trackTitle: document.getElementById('track-title'),
            trackArtist: document.getElementById('track-artist'),
            playStatus: document.getElementById('play-status'),

            // Transport
            btnPlay: document.getElementById('btn-play'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            btnMute: document.getElementById('btn-mute'),
            volumeSlider: document.getElementById('volume-slider'),
            progressBar: document.getElementById('progress-bar'),
            progressFill: document.getElementById('progress-fill'),
            timeElapsed: document.getElementById('time-elapsed'),
            timeRemaining: document.getElementById('time-remaining'),

            // Controls
            btnWarp: document.getElementById('btn-warp'),
            warpLabel: document.getElementById('warp-label'),
            btnVisualMode: document.getElementById('btn-visual-mode'),
            visualModeLabel: document.getElementById('visual-mode-label'),
            btnTheme: document.getElementById('btn-theme'),
            themeLabel: document.getElementById('theme-label'),
            btnFullscreen: document.getElementById('btn-fullscreen'),
            btnSettings: document.getElementById('btn-settings'),
            btnLibrary: document.getElementById('btn-library'),
            btnVoice: document.getElementById('btn-voice'),
            btnUpload: document.getElementById('btn-upload'),
            fileInput: document.getElementById('file-input'),

            // Camera & View controls
            btnCameraLock: document.getElementById('btn-camera-lock'),
            btnCameraReset: document.getElementById('btn-camera-reset'),
            btnHudToggle: document.getElementById('btn-hud-toggle'),
            btnShortcuts: document.getElementById('btn-shortcuts'),
            shortcutsModal: document.getElementById('shortcuts-modal'),
            btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),

            // Panels
            settingsPanel: document.getElementById('settings-panel'),
            libraryPanel: document.getElementById('library-panel'),
            visualModePanel: document.getElementById('visual-mode-panel'),
            themePanel: document.getElementById('theme-panel'),

            // Meters
            bassMeter: document.getElementById('bass-meter'),
            midsMeter: document.getElementById('mids-meter'),
            highsMeter: document.getElementById('highs-meter'),
            beatIndicator: document.getElementById('beat-indicator'),

            // FPS
            fpsCounter: document.getElementById('fps-counter'),

            // Drag-drop overlay
            dropOverlay: document.getElementById('drop-overlay'),

            // Toasts
            toastContainer: document.getElementById('toast-container'),
        };
    }

    /**
     * Bind all UI event handlers
     */
    _bindEvents() {
        // Play/Pause
        this.els.btnPlay?.addEventListener('click', () => {
            if (this.library.playlist.length === 0) {
                this.showToast('No tracks loaded. Select a genre or upload music!', 'info');
                return;
            }
            this.audio.togglePlay();
            this._updatePlayButton();
        });

        // Previous / Next
        this.els.btnPrev?.addEventListener('click', () => this._onPrevTrack());
        this.els.btnNext?.addEventListener('click', () => this._onNextTrack());

        // Mute
        this.els.btnMute?.addEventListener('click', () => {
            this.audio.toggleMute();
            this.els.btnMute.textContent = this.audio.isMuted ? '🔇' : '🔊';
            this.els.btnMute.title = this.audio.isMuted ? 'Unmute (M)' : 'Mute (M)';
        });

        // Volume
        this.els.volumeSlider?.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            this.audio.setVolume(vol);
            this.settings.set('volume', vol);
        });

        // Progress bar seek
        this.els.progressBar?.addEventListener('click', (e) => {
            const rect = this.els.progressBar.getBoundingClientRect();
            const fraction = (e.clientX - rect.left) / rect.width;
            this.audio.seek(Math.max(0, Math.min(1, fraction)));
        });

        // Warp
        this.els.btnWarp?.addEventListener('click', () => {
            this.warp.toggle();
            this._updateWarpDisplay();
        });

        // Visual mode panel toggle
        this.els.btnVisualMode?.addEventListener('click', () => {
            this._togglePanel('visualModePanel');
        });

        // Theme panel toggle
        this.els.btnTheme?.addEventListener('click', () => {
            this._togglePanel('themePanel');
        });

        // Library panel toggle
        this.els.btnLibrary?.addEventListener('click', () => {
            this._togglePanel('libraryPanel');
            this.buildLibraryPanel();
        });

        // Settings panel toggle
        this.els.btnSettings?.addEventListener('click', () => {
            this._togglePanel('settingsPanel');
            this.buildSettingsPanel();
        });

        // Fullscreen
        this.els.btnFullscreen?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.();
            } else {
                document.exitFullscreen?.();
            }
        });
        document.addEventListener('fullscreenchange', () => {
            if (this.els.btnFullscreen) {
                this.els.btnFullscreen.textContent = document.fullscreenElement ? '🗗' : '⛶';
                this.els.btnFullscreen.title = document.fullscreenElement ? 'Exit Fullscreen (F)' : 'Fullscreen (F)';
            }
        });

        // Camera lock & reset
        this.els.btnCameraLock?.addEventListener('click', () => {
            if (this.camera) {
                const locked = this.camera.toggleLock();
                this.els.btnCameraLock.classList.toggle('active', locked);
                this.showToast(`Camera ${locked ? 'Locked' : 'Unlocked'}`, 'info');
            }
        });

        this.els.btnCameraReset?.addEventListener('click', () => {
            if (this.camera) {
                this.camera.reset();
                if (this.els.btnCameraLock) this.els.btnCameraLock.classList.remove('active');
                this.showToast('Camera Reset', 'info');
            }
        });

        // HUD Visibility toggle
        this.els.btnHudToggle?.addEventListener('click', () => this.toggleHUD());

        // Shortcuts modal
        this.els.btnShortcuts?.addEventListener('click', () => {
            this.els.shortcutsModal?.classList.add('open');
        });
        this.els.btnCloseShortcuts?.addEventListener('click', () => {
            this.els.shortcutsModal?.classList.remove('open');
        });

        // Upload
        this.els.btnUpload?.addEventListener('click', () => {
            this.els.fileInput?.click();
        });

        this.els.fileInput?.addEventListener('change', (e) => {
            this._handleFileUpload(e.target.files);
            e.target.value = '';
        });

        // Drag & drop
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.els.dropOverlay?.classList.add('visible');
        });
        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) {
                this.els.dropOverlay?.classList.remove('visible');
            }
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            this.els.dropOverlay?.classList.remove('visible');
            if (e.dataTransfer?.files?.length > 0) {
                this._handleFileUpload(e.dataTransfer.files);
            }
        });

        // Audio callbacks
        this.audio.onTimeUpdate((time, duration) => {
            this._updateProgress(time, duration);
        });

        this.audio.onTrackEnd(() => {
            this._onNextTrack();
        });

        // Close panels on outside click
        document.addEventListener('click', (e) => {
            const panels = ['settingsPanel', 'libraryPanel', 'visualModePanel', 'themePanel'];
            const btnMap = {
                settingsPanel: 'btnSettings',
                libraryPanel: 'btnLibrary',
                visualModePanel: 'btnVisualMode',
                themePanel: 'btnTheme',
            };
            for (const panel of panels) {
                if (this.els[panel]?.classList.contains('open') && !this.els[panel].contains(e.target)) {
                    if (btnMap[panel] && this.els[btnMap[panel]]?.contains(e.target)) continue;
                    this.els[panel].classList.remove('open');
                }
            }

            if (this.els.shortcutsModal?.classList.contains('open') && e.target === this.els.shortcutsModal) {
                this.els.shortcutsModal.classList.remove('open');
            }
        });
    }

    /**
     * Toggle HUD visibility for cinema mode
     */
    toggleHUD() {
        this._hudHidden = !this._hudHidden;
        document.body.classList.toggle('hud-hidden', this._hudHidden);
        this.showToast(`HUD ${this._hudHidden ? 'Hidden (Press H to restore)' : 'Visible'}`, 'info');
    }

    /**
     * Build visual mode selector panel
     */
    buildVisualModePanel() {
        const panel = this.els.visualModePanel;
        if (!panel) return;

        const modes = this.visualMode.getModeList();
        const curMode = this.visualMode.currentMode;
        let html = '<div class="panel-header"><h3 class="panel-title">Visual Modes</h3><button class="panel-close" data-close="visualModePanel">✕</button></div>';
        html += '<div class="mode-grid">';
        for (const mode of modes) {
            const isActive = mode.id === curMode;
            html += `<button class="mode-card ${isActive ? 'active' : ''}" data-mode="${mode.id}">
                <div class="mode-card-header">
                    <span class="mode-icon">${mode.icon}</span>
                    <span class="mode-label">${mode.label}</span>
                </div>
                <div class="mode-desc">${mode.description}</div>
            </button>`;
        }
        html += '</div>';
        panel.innerHTML = html;

        panel.querySelector('[data-close="visualModePanel"]')?.addEventListener('click', () => {
            panel.classList.remove('open');
        });

        panel.querySelectorAll('.mode-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const modeId = btn.dataset.mode;
                this.visualMode.setMode(modeId);
                const modeCfg = this.visualMode.getModeById(modeId);
                if (modeCfg?.cameraPreset && this.camera) {
                    this.camera.setPreset(modeCfg.cameraPreset);
                }
                if (this.els.visualModeLabel) {
                    this.els.visualModeLabel.textContent = modeCfg?.label || modeId;
                }
                panel.classList.remove('open');
                this.showToast(`Mode: ${modeCfg?.label}`, 'info');
                this.buildVisualModePanel();
            });
        });
    }

    /**
     * Build theme selector panel
     */
    buildThemePanel() {
        const panel = this.els.themePanel;
        if (!panel) return;

        const themes = this.theme.getThemeList();
        const curTheme = this.theme.currentTheme;
        const isAuto = this.theme.autoMode;

        let html = '<div class="panel-header"><h3 class="panel-title">Themes</h3><button class="panel-close" data-close="themePanel">✕</button></div>';
        html += '<div class="theme-grid">';
        html += `<button class="theme-card theme-auto ${isAuto ? 'active' : ''}" data-theme="auto" title="AI automatically selects theme from live audio energy and timbre">
            <div class="theme-swatch auto-swatch">🤖</div>
            <div class="theme-info">
                <span class="theme-name">AI Auto-Detect</span>
                <span class="theme-sub">Reactive AI classifier</span>
            </div>
        </button>`;

        for (const t of themes) {
            const themeData = this.theme.getTheme();
            const isActive = !isAuto && t.id === curTheme;
            html += `<button class="theme-card ${isActive ? 'active' : ''}" data-theme="${t.id}">
                <div class="theme-swatch" data-theme-swatch="${t.id}">◆</div>
                <div class="theme-info">
                    <span class="theme-name">${t.label}</span>
                </div>
            </button>`;
        }
        html += '</div>';
        panel.innerHTML = html;

        panel.querySelector('[data-close="themePanel"]')?.addEventListener('click', () => {
            panel.classList.remove('open');
        });

        panel.querySelectorAll('.theme-card').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.theme === 'auto') {
                    this.theme.enableAutoTheme();
                    if (this.els.themeLabel) this.els.themeLabel.textContent = 'AI Auto';
                    this.showToast('AI Theme Mode activated', 'info');
                } else {
                    this.theme.setTheme(btn.dataset.theme);
                    const t = themes.find(x => x.id === btn.dataset.theme);
                    if (this.els.themeLabel) this.els.themeLabel.textContent = t?.label || btn.dataset.theme;
                    this.showToast(`Theme: ${t?.label}`, 'info');
                }
                panel.classList.remove('open');
                this.buildThemePanel();
            });
        });
    }

    /**
     * Build genre library and playlist panel
     */
    buildLibraryPanel() {
        const panel = this.els.libraryPanel;
        if (!panel) return;

        const genres = this.library.getGenrePresets();
        let html = '<div class="panel-header"><h3 class="panel-title">Genre & Music Library</h3><button class="panel-close" data-close="libraryPanel">✕</button></div>';

        // Built-in Genre Presets
        html += '<div class="panel-section-title">BUILT-IN GENRES</div>';
        html += '<div class="genre-grid">';
        for (const [id, genre] of Object.entries(genres)) {
            const track = this.library.playlist.find(t => t.id === id || t.genre.toLowerCase() === genre.label.toLowerCase());
            const isPlayingThis = track && this.library.getCurrent() === track && this.audio.isPlaying;

            html += `<button class="genre-card ${isPlayingThis ? 'playing' : ''}" data-genre="${id}">
                <div class="genre-card-header">
                    <span class="genre-card-title">${genre.label}</span>
                    <span class="genre-card-status">${isPlayingThis ? 'PLAYING' : 'READY'}</span>
                </div>
                <div class="genre-card-desc">${genre.description}</div>
                <div class="genre-card-meta">
                    <span>${genre.theme}</span> • <span>${genre.visualMode}</span> • <span>${genre.particleShape}</span>
                </div>
            </button>`;
        }
        html += '</div>';

        // Active Playlist
        html += `<div class="panel-section-title" style="margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
            <span>ACTIVE PLAYLIST (${this.library.playlist.length})</span>
            <button class="small-action-btn" id="btn-library-upload-trigger">📁 Upload Files</button>
        </div>`;
        html += '<div class="playlist-container">';
        this.library.playlist.forEach((track, idx) => {
            const isCurrent = this.library.currentIndex === idx;
            html += `<div class="playlist-item ${isCurrent ? 'active' : ''}" data-index="${idx}">
                <div class="playlist-item-left">
                    <button class="playlist-btn-play" data-index="${idx}">${isCurrent && this.audio.isPlaying ? '⏸' : '▶'}</button>
                    <div class="playlist-item-info">
                        <span class="playlist-item-title">${track.title}</span>
                        <span class="playlist-item-artist">${track.artist} • ${track.genre}</span>
                    </div>
                </div>
                <div class="playlist-item-actions">
                    ${track.isBuiltIn ? '<span class="built-in-badge">BUILT-IN</span>' : `<button class="playlist-btn-remove" data-index="${idx}" title="Remove track">✕</button>`}
                </div>
            </div>`;
        });
        html += '</div>';

        panel.innerHTML = html;

        panel.querySelector('[data-close="libraryPanel"]')?.addEventListener('click', () => {
            panel.classList.remove('open');
        });

        panel.querySelector('#btn-library-upload-trigger')?.addEventListener('click', () => {
            this.els.fileInput?.click();
        });

        // Genre card clicks
        panel.querySelectorAll('.genre-card').forEach(btn => {
            btn.addEventListener('click', async () => {
                const genreId = btn.dataset.genre;
                const preset = genres[genreId];
                if (!preset) return;

                // Apply visual parameters
                this.theme.setTheme(preset.theme);
                this.visualMode.setMode(preset.visualMode);
                if (preset.particleShape && this.particleEngine) {
                    this.particleEngine.setShape(preset.particleShape);
                }
                if (preset.cameraStyle && this.camera) {
                    this.camera.setPreset(preset.cameraStyle);
                }
                if (preset.motionIntensity !== undefined) {
                    this.settings.set('mixer.motionIntensity', preset.motionIntensity);
                }
                if (preset.bassResponse !== undefined) {
                    this.settings.set('mixer.bassResponse', preset.bassResponse);
                }

                // Switch and play corresponding genre track
                const trackIdx = this.library.playlist.findIndex(t => t.id === genreId || t.genre.toLowerCase() === preset.label.toLowerCase());
                if (trackIdx !== -1) {
                    this.library.selectTrack(trackIdx);
                    const track = this.library.getCurrent();
                    if (track) {
                        await this.audio.loadTrack(track);
                        await this.audio.play();
                        this._updateTrackInfo();
                        this._updatePlayButton();
                    }
                }

                if (this.els.visualModeLabel) this.els.visualModeLabel.textContent = this.visualMode.getMode().label;
                if (this.els.themeLabel) this.els.themeLabel.textContent = this.theme.getTheme().label;

                this.showToast(`Genre: ${preset.label} loaded`, 'success');
                this.buildLibraryPanel();
            });
        });

        // Playlist play/pause
        panel.querySelectorAll('.playlist-btn-play').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (this.library.currentIndex === idx) {
                    this.audio.togglePlay();
                    this._updatePlayButton();
                } else {
                    this.library.selectTrack(idx);
                    const track = this.library.getCurrent();
                    if (track) {
                        await this.audio.loadTrack(track);
                        await this.audio.play();
                        this._updateTrackInfo();
                        this._updatePlayButton();
                    }
                }
                this.buildLibraryPanel();
            });
        });

        // Playlist remove
        panel.querySelectorAll('.playlist-btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                this.library.removeTrack(idx);
                this.buildLibraryPanel();
                this.showToast('Track removed', 'info');
            });
        });
    }

    /**
     * Build Settings / Visual Mixer panel
     */
    buildSettingsPanel() {
        const panel = this.els.settingsPanel;
        if (!panel) return;

        const mixer = this.settings.get('mixer') || {};
        const qualityTiers = this.settings.getQualityTiers();
        const curQuality = this.settings.get('quality') || 'high';
        const curShape = this.settings.get('mixer.particleShape') || 'points';
        const reducedMotion = this.settings.get('reducedMotion') || false;
        const shapes = ['points', 'cubes', 'diamonds', 'rings', 'shards', 'hexagons', 'crystals'];
        const presets = this.settings.getPresetNames();

        let html = '<div class="panel-header"><h3 class="panel-title">Visual Mixer & Settings</h3><button class="panel-close" data-close="settingsPanel">✕</button></div>';

        // Quality Tier
        html += '<div class="settings-group">';
        html += '<label class="setting-label">PERFORMANCE / QUALITY TIER</label>';
        html += '<div class="tier-buttons">';
        for (const tier of qualityTiers) {
            html += `<button class="tier-btn ${tier === curQuality ? 'active' : ''}" data-quality="${tier}">${tier.toUpperCase()}</button>`;
        }
        html += '</div></div>';

        // Particle Shapes
        html += '<div class="settings-group">';
        html += '<label class="setting-label">PARTICLE GEOMETRY SHAPE</label>';
        html += '<div class="shape-buttons">';
        for (const shape of shapes) {
            html += `<button class="shape-btn ${shape === curShape ? 'active' : ''}" data-shape="${shape}">${shape.toUpperCase()}</button>`;
        }
        html += '</div></div>';

        // Particle Count Slider
        html += `<div class="settings-group">
            <div class="slider-header">
                <label class="setting-label">PARTICLE COUNT</label>
                <span class="slider-value" id="val-particle-count">${mixer.particleCount || 10000}</span>
            </div>
            <input type="range" class="hud-slider" id="cfg-particle-count" min="1000" max="25000" step="500" value="${mixer.particleCount || 10000}">
        </div>`;

        // Mixer Sliders
        const sliders = [
            { id: 'cfg-motion', path: 'mixer.motionIntensity', label: 'MOTION INTENSITY', min: 0, max: 1, step: 0.05, val: mixer.motionIntensity ?? 0.7 },
            { id: 'cfg-bass', path: 'mixer.bassResponse', label: 'BASS REACTION', min: 0, max: 1, step: 0.05, val: mixer.bassResponse ?? 0.8 },
            { id: 'cfg-treble', path: 'mixer.trebleResponse', label: 'TREBLE / HIGH RESPONSE', min: 0, max: 1, step: 0.05, val: mixer.trebleResponse ?? 0.6 },
            { id: 'cfg-glow', path: 'mixer.bloomStrength', label: 'BLOOM & NEON GLOW', min: 0, max: 3, step: 0.1, val: mixer.bloomStrength ?? 1.5 },
            { id: 'cfg-dither', path: 'mixer.ditherAmount', label: 'CYBER DITHER AMOUNT', min: 0, max: 1, step: 0.05, val: mixer.ditherAmount ?? 0.3 },
            { id: 'cfg-glitch', path: 'mixer.glitchIntensity', label: 'GLITCH INTENSITY', min: 0, max: 1, step: 0.05, val: mixer.glitchIntensity ?? 0.2 },
            { id: 'cfg-camera', path: 'mixer.cameraSpeed', label: 'CAMERA ORBIT SPEED', min: 0, max: 1, step: 0.05, val: mixer.cameraSpeed ?? 0.5 },
        ];

        for (const s of sliders) {
            html += `<div class="settings-group">
                <div class="slider-header">
                    <label class="setting-label">${s.label}</label>
                    <span class="slider-value" id="val-${s.id}">${s.val.toFixed(2)}</span>
                </div>
                <input type="range" class="hud-slider" id="${s.id}" data-path="${s.path}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.val}">
            </div>`;
        }

        // Reduced Motion Toggle
        html += `<div class="settings-group checkbox-group">
            <label class="setting-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="cfg-reduced-motion" ${reducedMotion ? 'checked' : ''}>
                <span>ACCESSIBILITY: REDUCED MOTION</span>
            </label>
        </div>`;

        // User Presets
        html += '<div class="settings-group" style="margin-top:16px;">';
        html += '<label class="setting-label">CUSTOM PRESETS</label>';
        html += `<div class="preset-input-row">
            <input type="text" class="hud-input" id="preset-name-input" placeholder="New Preset Name" maxlength="20">
            <button class="action-btn" id="btn-save-preset">SAVE</button>
        </div>`;
        if (presets.length > 0) {
            html += '<div class="preset-list">';
            for (const name of presets) {
                html += `<div class="preset-item">
                    <span>${name}</span>
                    <div class="preset-actions">
                        <button class="preset-btn-load" data-preset="${name}">LOAD</button>
                        <button class="preset-btn-del" data-preset="${name}">✕</button>
                    </div>
                </div>`;
            }
            html += '</div>';
        }
        html += '</div>';

        // Reset to Defaults
        html += '<div class="panel-actions" style="margin-top:20px;">';
        html += '<button class="action-btn danger-btn" id="btn-reset-settings">RESET TO DEFAULTS</button>';
        html += '</div>';

        panel.innerHTML = html;

        // Close button
        panel.querySelector('[data-close="settingsPanel"]')?.addEventListener('click', () => {
            panel.classList.remove('open');
        });

        // Quality buttons
        panel.querySelectorAll('.tier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tier = btn.dataset.quality;
                this.settings.setQuality(tier);
                this.showToast(`Quality set to ${tier.toUpperCase()}`, 'info');
                this.buildSettingsPanel();
            });
        });

        // Shape buttons
        panel.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const shape = btn.dataset.shape;
                this.settings.set('mixer.particleShape', shape);
                if (this.particleEngine) {
                    this.particleEngine.setShape(shape);
                }
                this.showToast(`Particle Shape: ${shape.toUpperCase()}`, 'info');
                this.buildSettingsPanel();
            });
        });

        // Particle Count Slider
        const pcSlider = panel.querySelector('#cfg-particle-count');
        const pcVal = panel.querySelector('#val-particle-count');
        pcSlider?.addEventListener('input', (e) => {
            const count = parseInt(e.target.value);
            if (pcVal) pcVal.textContent = count;
            this.settings.set('mixer.particleCount', count);
            if (this.particleEngine) {
                this.particleEngine.resize(count);
            }
        });

        // Sliders binding
        for (const s of sliders) {
            const el = panel.querySelector(`#${s.id}`);
            const valDisplay = panel.querySelector(`#val-${s.id}`);
            el?.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                if (valDisplay) valDisplay.textContent = v.toFixed(2);
                this.settings.set(s.path, v);
            });
        }

        // Reduced motion
        const rmToggle = panel.querySelector('#cfg-reduced-motion');
        rmToggle?.addEventListener('change', (e) => {
            this.settings.set('reducedMotion', e.target.checked);
            this.showToast(`Reduced Motion ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
        });

        // Save preset
        panel.querySelector('#btn-save-preset')?.addEventListener('click', () => {
            const input = panel.querySelector('#preset-name-input');
            const name = input?.value?.trim();
            if (name) {
                this.settings.savePreset(name);
                this.showToast(`Preset "${name}" saved!`, 'success');
                this.buildSettingsPanel();
            }
        });

        // Load preset
        panel.querySelectorAll('.preset-btn-load').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.preset;
                this.settings.loadPreset(name);
                const newShape = this.settings.get('mixer.particleShape');
                if (newShape && this.particleEngine) this.particleEngine.setShape(newShape);
                const newCount = this.settings.get('mixer.particleCount');
                if (newCount && this.particleEngine) this.particleEngine.resize(newCount);
                this.showToast(`Preset "${name}" loaded!`, 'success');
                this.buildSettingsPanel();
            });
        });

        // Delete preset
        panel.querySelectorAll('.preset-btn-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.preset;
                this.settings.deletePreset(name);
                this.showToast(`Preset "${name}" deleted`, 'info');
                this.buildSettingsPanel();
            });
        });

        // Reset
        panel.querySelector('#btn-reset-settings')?.addEventListener('click', () => {
            this.settings.reset();
            const resetShape = this.settings.get('mixer.particleShape');
            if (this.particleEngine && resetShape) this.particleEngine.setShape(resetShape);
            const resetCount = this.settings.get('mixer.particleCount');
            if (this.particleEngine && resetCount) this.particleEngine.resize(resetCount);
            this.showToast('Settings reset to defaults', 'info');
            this.buildSettingsPanel();
        });
    }

    _togglePanel(panelKey) {
        const panel = this.els[panelKey];
        if (!panel) return;

        ['settingsPanel', 'libraryPanel', 'visualModePanel', 'themePanel'].forEach(key => {
            if (key !== panelKey && this.els[key]) {
                this.els[key].classList.remove('open');
            }
        });

        panel.classList.toggle('open');
    }

    async _handleFileUpload(files) {
        const added = this.library.addFiles(files);
        if (added.length > 0) {
            // Auto-select first uploaded track if nothing is playing
            if (!this.audio.isPlaying || !this.audio.currentTrack) {
                this.library.selectTrack(this.library.playlist.length - added.length);
                const track = this.library.getCurrent();
                if (track) {
                    await this.audio.loadTrack(track);
                    await this.audio.play();
                    this._updateTrackInfo();
                    this._updatePlayButton();
                }
            }
            this.showToast(`Added ${added.length} track${added.length > 1 ? 's' : ''}`, 'success');
            this.buildLibraryPanel();
        }
    }

    async _onNextTrack() {
        const track = this.library.next();
        if (track) {
            await this.audio.loadTrack(track);
            await this.audio.play();
            this._updateTrackInfo();
            this._updatePlayButton();
            this.buildLibraryPanel();
        }
    }

    async _onPrevTrack() {
        if (this.audio.currentTime > 3) {
            this.audio.seek(0);
        } else {
            const track = this.library.previous();
            if (track) {
                await this.audio.loadTrack(track);
                await this.audio.play();
                this._updateTrackInfo();
                this._updatePlayButton();
                this.buildLibraryPanel();
            }
        }
    }

    _updateTrackInfo() {
        const track = this.library.getCurrent() || this.audio.currentTrack;
        if (this.els.trackTitle) {
            this.els.trackTitle.textContent = track?.title || 'No Track Loaded';
        }
        if (this.els.trackArtist) {
            this.els.trackArtist.textContent = track ? `${track.artist} • ${track.genre}` : 'Select genre or upload music';
        }
    }

    _updatePlayButton() {
        if (this.els.btnPlay) {
            this.els.btnPlay.textContent = this.audio.isPlaying ? '⏸' : '▶';
            this.els.btnPlay.title = this.audio.isPlaying ? 'Pause (Space)' : 'Play (Space)';
        }
        if (this.els.playStatus) {
            this.els.playStatus.textContent = this.audio.isPlaying ? 'PLAYING' : 'PAUSED';
            this.els.playStatus.className = `play-status ${this.audio.isPlaying ? 'playing' : 'paused'}`;
        }
    }

    _updateProgress(time, duration) {
        if (this.els.progressFill && duration > 0) {
            this.els.progressFill.style.width = `${(time / duration) * 100}%`;
        }
        if (this.els.timeElapsed) {
            this.els.timeElapsed.textContent = this._formatTime(time);
        }
        if (this.els.timeRemaining) {
            this.els.timeRemaining.textContent = `-${this._formatTime(Math.max(0, duration - time))}`;
        }
    }

    _updateWarpDisplay() {
        const level = this.warp.getLevel();
        if (this.els.warpLabel) {
            this.els.warpLabel.textContent = level.label;
        }
        if (this.els.btnWarp) {
            this.els.btnWarp.classList.toggle('active', this.warp.currentLevel > 0);
        }
    }

    _formatTime(seconds) {
        if (!isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Update HUD visuals — call once per frame
     * @param {Object} analysis
     * @param {number} dt
     */
    update(analysis, dt) {
        // FPS counter
        this._fpsFrames++;
        this._fpsTime += dt;
        if (this._fpsTime >= 0.5) {
            this._fpsDisplay = Math.round(this._fpsFrames / this._fpsTime);
            this._fpsFrames = 0;
            this._fpsTime = 0;
            if (this.els.fpsCounter) {
                this.els.fpsCounter.textContent = `${this._fpsDisplay} FPS`;
            }
        }

        // Audio meters
        if (this.els.bassMeter) {
            this.els.bassMeter.style.height = `${Math.min(100, analysis.bass * 100)}%`;
        }
        if (this.els.midsMeter) {
            this.els.midsMeter.style.height = `${Math.min(100, analysis.mids * 100)}%`;
        }
        if (this.els.highsMeter) {
            this.els.highsMeter.style.height = `${Math.min(100, analysis.highs * 100)}%`;
        }

        // Beat indicator
        if (this.els.beatIndicator) {
            if (analysis.isBeat) {
                this.els.beatIndicator.classList.add('beat');
                setTimeout(() => this.els.beatIndicator?.classList.remove('beat'), 140);
            }
        }

        // Spectrum bars & Waveform
        this._drawSpectrum(analysis);
        this._drawWaveform(analysis);
    }

    /**
     * Draw frequency spectrum bars
     */
    _drawSpectrum(analysis) {
        if (!this.spectrumCtx || !this.spectrumCanvas || !analysis.spectrum) return;

        const ctx = this.spectrumCtx;
        const w = this.spectrumCanvas.width;
        const h = this.spectrumCanvas.height;

        ctx.clearRect(0, 0, w, h);

        const bars = 28;
        const barWidth = Math.floor(w / bars) - 1;
        const step = Math.floor(analysis.spectrum.length / bars);
        const theme = this.theme.getTheme();

        for (let i = 0; i < bars; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += analysis.spectrum[i * step + j];
            }
            const avg = sum / step / 255;
            const barHeight = Math.max(2, avg * h);

            const t = i / bars;
            ctx.fillStyle = t < 0.35 ? theme.primary : t < 0.7 ? theme.secondary : theme.accent;
            ctx.globalAlpha = 0.7 + avg * 0.3;
            ctx.fillRect(i * (barWidth + 1), h - barHeight, barWidth, barHeight);
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Draw waveform oscilloscope
     */
    _drawWaveform(analysis) {
        if (!this.waveformCtx || !this.waveformCanvas || !analysis.waveform) return;

        const ctx = this.waveformCtx;
        const w = this.waveformCanvas.width;
        const h = this.waveformCanvas.height;

        ctx.clearRect(0, 0, w, h);

        const theme = this.theme.getTheme();
        ctx.strokeStyle = theme.secondary;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();

        const step = Math.floor(analysis.waveform.length / w);
        for (let i = 0; i < w; i++) {
            const idx = i * step;
            const value = idx < analysis.waveform.length ? analysis.waveform[idx] : 0;
            const y = (value * 0.45 + 0.5) * h;

            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }

        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    /**
     * Show a toast notification
     * @param {string} message
     * @param {string} type - 'info', 'success', 'error'
     */
    showToast(message, type = 'info') {
        const container = this.els.toastContainer;
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('visible'));

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 3200);
    }
}
