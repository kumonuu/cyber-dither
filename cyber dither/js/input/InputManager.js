/**
 * InputManager.js — Keyboard, mouse, touch, and gesture handler for Cyber-Dither
 * 
 * Centralises all user input handling: keyboard shortcuts, mouse interactions,
 * touch gestures (drag-to-orbit, pinch-to-zoom, tap), and drag-and-drop.
 */

export class InputManager {
    /**
     * @param {Object} deps - { audioEngine, warpController, visualModeManager, 
     *                          cameraController, hudController, settings }
     */
    constructor(deps) {
        this.audio = deps.audioEngine;
        this.warp = deps.warpController;
        this.visualMode = deps.visualModeManager;
        this.camera = deps.cameraController;
        this.hud = deps.hudController;
        this.settings = deps.settings;

        // Warp hold state
        this._warpHolding = false;
        this._warpHoldTimer = null;

        this._bindKeyboard();
        this._bindTouch();
    }

    /**
     * Bind keyboard shortcuts
     */
    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (this.audio.currentTrack) {
                        this.audio.togglePlay();
                        this.hud._updatePlayButton();
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    this.hud._onPrevTrack();
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    this.hud._onNextTrack();
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    this.audio.setVolume(this.audio.volume + 0.05);
                    this.settings.set('volume', this.audio.volume);
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    this.audio.setVolume(this.audio.volume - 0.05);
                    this.settings.set('volume', this.audio.volume);
                    break;

                case 'KeyF':
                    e.preventDefault();
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen?.();
                    } else {
                        document.exitFullscreen?.();
                    }
                    break;

                case 'KeyM':
                    e.preventDefault();
                    this.audio.toggleMute();
                    break;

                case 'KeyW':
                    e.preventDefault();
                    if (!this._warpHolding) {
                        this._warpHolding = true;
                        this._warpHoldTimer = setTimeout(() => {
                            if (this._warpHolding) {
                                this.warp.startHold();
                                this.hud.showToast('Warp Boost Engaged!', 'info');
                            }
                        }, 220);
                    }
                    break;

                case 'KeyL':
                    e.preventDefault();
                    const locked = this.camera.toggleLock();
                    this.hud.showToast(`Camera ${locked ? 'locked' : 'unlocked'}`, 'info');
                    break;

                case 'KeyR':
                    e.preventDefault();
                    this.camera.reset();
                    this.hud.showToast('Camera reset', 'info');
                    break;

                case 'Digit1': this.visualMode.setMode('beatStorm'); break;
                case 'Digit2': this.visualMode.setMode('neonRain'); break;
                case 'Digit3': this.visualMode.setMode('galaxy'); break;
                case 'Digit4': this.visualMode.setMode('matrix'); break;
                case 'Digit5': this.visualMode.setMode('tunnel'); break;
                case 'Digit6': this.visualMode.setMode('minimal'); break;

                case 'Escape':
                    // Close any open panels
                    document.querySelectorAll('.panel.open').forEach(p => p.classList.remove('open'));
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'KeyW' && this._warpHolding) {
                this._warpHolding = false;
                clearTimeout(this._warpHoldTimer);

                if (this.warp.isHolding) {
                    this.warp.stopHold();
                    this.hud._updateWarpDisplay();
                } else {
                    // Quick press — toggle
                    this.warp.toggle();
                    this.hud._updateWarpDisplay();
                }
            }
        });
    }

    /**
     * Bind touch gestures for mobile
     */
    _bindTouch() {
        let touchStartX = 0;
        let touchStartY = 0;
        let pinchStartDist = 0;
        let isSwiping = false;

        const canvas = document.getElementById('three-canvas');
        if (!canvas) return;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isSwiping = true;
            } else if (e.touches.length === 2) {
                // Pinch start
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pinchStartDist = Math.sqrt(dx * dx + dy * dy);
                isSwiping = false;
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isSwiping) {
                const dx = e.touches[0].clientX - touchStartX;
                const dy = e.touches[0].clientY - touchStartY;

                // Orbit camera
                this.camera.orbitAngle += dx * 0.005;
                this.camera.orbitHeight += dy * 0.02;

                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                // Pinch zoom
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = pinchStartDist / dist;

                this.camera.orbitRadius = Math.max(10, Math.min(80, this.camera.orbitRadius * scale));
                pinchStartDist = dist;
            }
        }, { passive: true });

        canvas.addEventListener('touchend', () => {
            isSwiping = false;
        }, { passive: true });

        // Double-tap for play/pause
        let lastTapTime = 0;
        canvas.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTapTime < 300 && e.changedTouches.length === 1) {
                this.audio.togglePlay();
                this.hud._updatePlayButton();
            }
            lastTapTime = now;
        }, { passive: true });
    }

    /**
     * Update hold-to-boost warp per frame
     * @param {number} dt
     */
    update(dt) {
        if (this._warpHolding && this.warp.isHolding) {
            this.warp.updateHold(dt);
        }
    }
}
