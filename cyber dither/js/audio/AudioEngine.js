/**
 * AudioEngine.js — Web Audio API core for Cyber-Dither
 * 
 * Handles audio playback, real-time frequency analysis, beat detection,
 * volume/RMS calculation, and waveform extraction. All processing is
 * done locally in the browser via the Web Audio API.
 */

export class AudioEngine {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        /** @type {AnalyserNode|null} */
        this.analyser = null;
        /** @type {GainNode|null} */
        this.gainNode = null;
        /** @type {HTMLAudioElement} */
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = 'anonymous';
        /** @type {MediaElementAudioSourceNode|null} */
        this.sourceNode = null;

        // FFT config
        this.fftSize = 2048;
        this.smoothing = 0.8;

        // Analysis data buffers
        this.frequencyData = null;
        this.timeDomainData = null;

        // Processed analysis output (updated each frame)
        this.analysis = {
            bass: 0,          // 0-1 normalised bass energy
            mids: 0,          // 0-1 normalised mids energy
            highs: 0,         // 0-1 normalised highs energy
            volume: 0,        // 0-1 RMS volume
            isBeat: false,    // true on detected beat frame
            beatIntensity: 0, // 0-1 beat strength
            waveform: null,   // Float32Array of time-domain data
            spectrum: null,   // Uint8Array of frequency data
            energy: 0,        // 0-1 overall energy
        };

        // Beat detection state
        this._beatThreshold = 1.3;
        this._beatDecay = 0.98;
        this._beatMin = 0.15;
        this._lastBeatTime = 0;
        this._beatCooldown = 150; // ms between beats
        this._energyHistory = new Float32Array(60);
        this._energyIndex = 0;
        this._averageEnergy = 0;

        // Playback state
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.volume = 0.75;
        this.playbackRate = 1.0;
        this.isMuted = false;

        // Track info
        this.currentTrack = null;

        // Callbacks
        this._onTrackEnd = null;
        this._onTimeUpdate = null;

        this._setupAudioElement();
    }

    /**
     * Initialise the AudioContext (must be called from a user gesture)
     */
    async init() {
        if (this.ctx) return;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Create analyser
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = this.smoothing;

        // Create gain node for volume control
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = this.volume;

        // Connect: source → gain → analyser → destination
        this.gainNode.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Allocate data buffers
        const bufferLength = this.analyser.frequencyBinCount;
        this.frequencyData = new Uint8Array(bufferLength);
        this.timeDomainData = new Float32Array(bufferLength);
        this.analysis.waveform = new Float32Array(bufferLength);
        this.analysis.spectrum = new Uint8Array(bufferLength);

        // Connect audio element source
        this.sourceNode = this.ctx.createMediaElementSource(this.audioElement);
        this.sourceNode.connect(this.gainNode);

        // Resume context if suspended
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    /**
     * Set up audio element event listeners
     */
    _setupAudioElement() {
        this.audioElement.addEventListener('ended', () => {
            this.isPlaying = false;
            if (this._onTrackEnd) this._onTrackEnd();
        });

        this.audioElement.addEventListener('timeupdate', () => {
            this.currentTime = this.audioElement.currentTime;
            this.duration = this.audioElement.duration || 0;
            if (this._onTimeUpdate) this._onTimeUpdate(this.currentTime, this.duration);
        });

        this.audioElement.addEventListener('loadedmetadata', () => {
            this.duration = this.audioElement.duration || 0;
        });

        this.audioElement.addEventListener('error', (e) => {
            console.error('[AudioEngine] Audio error:', e);
            this.isPlaying = false;
        });
    }

    /**
     * Load and play a track from URL or object URL
     * @param {Object} track - { url, title, artist, genre }
     */
    async loadTrack(track) {
        // Revoke previous object URL if it was a blob
        if (this.currentTrack?.isBlobUrl && this.currentTrack.url) {
            URL.revokeObjectURL(this.currentTrack.url);
        }

        this.currentTrack = track;
        this.audioElement.src = track.url;
        this.audioElement.playbackRate = this.playbackRate;

        try {
            await this.audioElement.load();
        } catch (err) {
            console.error('[AudioEngine] Failed to load track:', err);
        }
    }

    /**
     * Load audio from a File object (user upload)
     * @param {File} file
     * @returns {Object} track info
     */
    loadFile(file) {
        const url = URL.createObjectURL(file);
        // Extract title from filename
        const title = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const track = {
            url,
            title,
            artist: 'Local File',
            genre: 'Unknown',
            isBlobUrl: true,
        };
        return track;
    }

    /**
     * Play or resume playback
     */
    async play() {
        if (!this.ctx) await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        try {
            await this.audioElement.play();
            this.isPlaying = true;
        } catch (err) {
            console.error('[AudioEngine] Play failed:', err);
        }
    }

    /**
     * Pause playback
     */
    pause() {
        this.audioElement.pause();
        this.isPlaying = false;
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Seek to a position (0-1 normalised)
     * @param {number} fraction
     */
    seek(fraction) {
        if (this.duration > 0) {
            this.audioElement.currentTime = fraction * this.duration;
        }
    }

    /**
     * Set volume (0-1)
     * @param {number} vol
     */
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.gainNode) {
            this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
        }
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.gainNode) {
            this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
        }
    }

    /**
     * Set playback rate
     * @param {number} rate
     */
    setPlaybackRate(rate) {
        this.playbackRate = rate;
        this.audioElement.playbackRate = rate;
    }

    /**
     * Update analysis data — call once per frame
     * @returns {Object} analysis results
     */
    update() {
        if (!this.analyser || !this.isPlaying) {
            // Return zeroed analysis when not playing
            this.analysis.bass = 0;
            this.analysis.mids = 0;
            this.analysis.highs = 0;
            this.analysis.volume = 0;
            this.analysis.isBeat = false;
            this.analysis.beatIntensity *= 0.9;
            this.analysis.energy *= 0.95;
            return this.analysis;
        }

        // Get frequency data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getFloatTimeDomainData(this.timeDomainData);

        // Copy to output buffers
        this.analysis.spectrum.set(this.frequencyData);
        this.analysis.waveform.set(this.timeDomainData);

        // Calculate frequency band energies
        const binCount = this.analyser.frequencyBinCount;
        const sampleRate = this.ctx.sampleRate;
        const binWidth = sampleRate / this.fftSize;

        // Frequency band bin ranges
        const bassEnd = Math.min(Math.floor(250 / binWidth), binCount);
        const midsEnd = Math.min(Math.floor(2000 / binWidth), binCount);
        const highsEnd = Math.min(Math.floor(16000 / binWidth), binCount);

        let bassSum = 0, midsSum = 0, highsSum = 0;
        let bassCount = 0, midsCount = 0, highsCount = 0;

        for (let i = 0; i < binCount; i++) {
            const val = this.frequencyData[i] / 255;
            if (i < bassEnd) {
                bassSum += val;
                bassCount++;
            } else if (i < midsEnd) {
                midsSum += val;
                midsCount++;
            } else if (i < highsEnd) {
                highsSum += val;
                highsCount++;
            }
        }

        this.analysis.bass = bassCount > 0 ? bassSum / bassCount : 0;
        this.analysis.mids = midsCount > 0 ? midsSum / midsCount : 0;
        this.analysis.highs = highsCount > 0 ? highsSum / highsCount : 0;

        // RMS volume from time-domain data
        let rmsSum = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            rmsSum += this.timeDomainData[i] * this.timeDomainData[i];
        }
        this.analysis.volume = Math.sqrt(rmsSum / this.timeDomainData.length);

        // Overall energy
        this.analysis.energy = (this.analysis.bass * 0.5 + this.analysis.mids * 0.3 + this.analysis.highs * 0.2);

        // Beat detection
        this._detectBeat();

        return this.analysis;
    }

    /**
     * Simple energy-threshold beat detection
     */
    _detectBeat() {
        const now = performance.now();
        const currentEnergy = this.analysis.bass * 0.7 + this.analysis.energy * 0.3;

        // Update energy history
        this._energyHistory[this._energyIndex % this._energyHistory.length] = currentEnergy;
        this._energyIndex++;

        // Calculate average energy
        let avgSum = 0;
        const len = Math.min(this._energyIndex, this._energyHistory.length);
        for (let i = 0; i < len; i++) {
            avgSum += this._energyHistory[i];
        }
        this._averageEnergy = avgSum / len;

        // Beat if current energy exceeds threshold * average and cooldown has passed
        const threshold = Math.max(this._averageEnergy * this._beatThreshold, this._beatMin);
        if (currentEnergy > threshold && (now - this._lastBeatTime) > this._beatCooldown) {
            this.analysis.isBeat = true;
            this.analysis.beatIntensity = Math.min(1, currentEnergy / Math.max(threshold, 0.01));
            this._lastBeatTime = now;
        } else {
            this.analysis.isBeat = false;
            this.analysis.beatIntensity *= this._beatDecay;
        }
    }

    /**
     * Set callback for track end
     * @param {Function} cb
     */
    onTrackEnd(cb) {
        this._onTrackEnd = cb;
    }

    /**
     * Set callback for time update
     * @param {Function} cb
     */
    onTimeUpdate(cb) {
        this._onTimeUpdate = cb;
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.pause();
        if (this.currentTrack?.isBlobUrl && this.currentTrack.url) {
            URL.revokeObjectURL(this.currentTrack.url);
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
        }
        if (this.ctx) {
            this.ctx.close();
        }
    }
}
