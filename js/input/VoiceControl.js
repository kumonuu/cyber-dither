/**
 * VoiceControl.js — Speech recognition commands for Cyber-Dither
 * 
 * Uses the browser SpeechRecognition API (Chrome/Edge) for hands-free
 * voice control with graceful fallback when unavailable.
 */

const COMMANDS = {
    'play':             'play',
    'pause':            'pause',
    'stop':             'pause',
    'next':             'next',
    'next track':       'next',
    'previous':         'previous',
    'previous track':   'previous',
    'warp':             'warp',
    'warp speed':       'warp',
    'hyperspace':       'warp',
    'change theme':     'changeTheme',
    'switch theme':     'changeTheme',
    'next theme':       'changeTheme',
    'increase intensity': 'increaseIntensity',
    'more intensity':   'increaseIntensity',
    'decrease intensity': 'decreaseIntensity',
    'less intensity':   'decreaseIntensity',
    'fullscreen':       'fullscreen',
    'full screen':      'fullscreen',
    'switch mode':      'switchMode',
    'next mode':        'switchMode',
    'change mode':      'switchMode',
    'visual mode':      'switchMode',
    'mute':             'mute',
    'unmute':           'mute',
    'beat storm':       'modeBeatStorm',
    'neon rain':        'modeNeonRain',
    'galaxy':           'modeGalaxy',
    'matrix':           'modeMatrix',
    'tunnel':           'modeTunnel',
    'minimal':          'modeMinimal',
};

export class VoiceControl {
    /**
     * @param {Object} deps - { audioEngine, warpController, visualModeManager, 
     *                          themeManager, hudController, settings }
     */
    constructor(deps) {
        this.audio = deps.audioEngine;
        this.warp = deps.warpController;
        this.visualMode = deps.visualModeManager;
        this.theme = deps.themeManager;
        this.hud = deps.hudController;
        this.settings = deps.settings;

        this.isAvailable = false;
        this.isListening = false;
        this.recognition = null;

        // Check availability
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.isAvailable = true;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => this._handleResult(event);
            this.recognition.onerror = (event) => {
                console.warn('[VoiceControl] Error:', event.error);
                if (event.error === 'not-allowed') {
                    this.hud.showToast('Microphone access denied', 'error');
                }
            };
            this.recognition.onend = () => {
                // Restart if still supposed to be listening
                if (this.isListening) {
                    try { this.recognition.start(); } catch (e) {}
                }
            };
        }

        // Set up UI button
        this._setupButton();
    }

    /**
     * Set up the voice button (hide if unavailable)
     */
    _setupButton() {
        const btn = document.getElementById('btn-voice');
        if (!btn) return;

        if (!this.isAvailable) {
            btn.style.display = 'none';
            return;
        }

        btn.addEventListener('click', () => this.toggle());
    }

    /**
     * Toggle voice listening
     */
    toggle() {
        if (!this.isAvailable) return;

        if (this.isListening) {
            this.stop();
        } else {
            this.start();
        }
    }

    /**
     * Start listening
     */
    start() {
        if (!this.isAvailable || this.isListening) return;

        try {
            this.recognition.start();
            this.isListening = true;
            const btn = document.getElementById('btn-voice');
            if (btn) {
                btn.classList.add('active');
                btn.title = 'Voice Control (listening...)';
            }
            this.hud.showToast('Voice control active — try "play", "next track", "warp speed"', 'info');
        } catch (e) {
            console.error('[VoiceControl] Start failed:', e);
        }
    }

    /**
     * Stop listening
     */
    stop() {
        if (!this.recognition) return;

        this.isListening = false;
        try { this.recognition.stop(); } catch (e) {}
        const btn = document.getElementById('btn-voice');
        if (btn) {
            btn.classList.remove('active');
            btn.title = 'Voice Control (off)';
        }
    }

    /**
     * Handle speech recognition result
     */
    _handleResult(event) {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) continue;

            const transcript = event.results[i][0].transcript.toLowerCase().trim();

            // Try to match command
            const action = this._matchCommand(transcript);
            if (action) {
                this._executeAction(action);
                this.hud.showToast(`Voice: "${transcript}"`, 'info');
            }
        }
    }

    /**
     * Match transcript to a command with fuzzy tolerance
     */
    _matchCommand(transcript) {
        // Exact match first
        if (COMMANDS[transcript]) return COMMANDS[transcript];

        // Partial match
        for (const [phrase, action] of Object.entries(COMMANDS)) {
            if (transcript.includes(phrase)) return action;
        }

        return null;
    }

    /**
     * Execute a matched voice action
     */
    _executeAction(action) {
        switch (action) {
            case 'play':
                if (!this.audio.isPlaying) this.audio.play();
                this.hud._updatePlayButton();
                break;
            case 'pause':
                this.audio.pause();
                this.hud._updatePlayButton();
                break;
            case 'next':
                this.hud._onNextTrack();
                break;
            case 'previous':
                this.hud._onPrevTrack();
                break;
            case 'warp':
                this.warp.toggle();
                this.hud._updateWarpDisplay();
                break;
            case 'changeTheme':
                const themes = this.theme.getThemeList();
                const currentIdx = themes.findIndex(t => t.id === this.theme.currentTheme);
                const nextIdx = (currentIdx + 1) % themes.length;
                this.theme.setTheme(themes[nextIdx].id);
                break;
            case 'increaseIntensity':
                const currentMotion = this.settings.get('mixer.motionIntensity') || 0.5;
                this.settings.set('mixer.motionIntensity', Math.min(1, currentMotion + 0.15));
                break;
            case 'decreaseIntensity':
                const curMotion = this.settings.get('mixer.motionIntensity') || 0.5;
                this.settings.set('mixer.motionIntensity', Math.max(0, curMotion - 0.15));
                break;
            case 'fullscreen':
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.();
                } else {
                    document.exitFullscreen?.();
                }
                break;
            case 'switchMode':
                this.visualMode.nextMode();
                break;
            case 'mute':
                this.audio.toggleMute();
                break;
            case 'modeBeatStorm': this.visualMode.setMode('beatStorm'); break;
            case 'modeNeonRain': this.visualMode.setMode('neonRain'); break;
            case 'modeGalaxy': this.visualMode.setMode('galaxy'); break;
            case 'modeMatrix': this.visualMode.setMode('matrix'); break;
            case 'modeTunnel': this.visualMode.setMode('tunnel'); break;
            case 'modeMinimal': this.visualMode.setMode('minimal'); break;
        }
    }

    /**
     * Dispose
     */
    dispose() {
        this.stop();
    }
}
