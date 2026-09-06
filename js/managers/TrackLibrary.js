/**
 * TrackLibrary.js — Track library, genre presets, and file upload for Cyber-Dither
 * 
 * Manages the built-in genre library (visual presets without bundled audio),
 * user-uploaded tracks, playlist navigation, and drag-and-drop handling.
 */

// Genre visual presets — each defines a visual identity for that genre
const GENRE_PRESETS = {
    pop: {
        label: 'Pop',
        description: 'Bright, energetic, colourful',
        theme: 'neonCyber',
        particleShape: 'points',
        visualMode: 'beatStorm',
        cameraStyle: 'orbit',
        motionIntensity: 0.7,
        bassResponse: 0.6,
        trebleResponse: 0.7,
    },
    dance: {
        label: 'Dance',
        description: 'High-energy neon bursts',
        theme: 'neonCyber',
        particleShape: 'cubes',
        visualMode: 'beatStorm',
        cameraStyle: 'dynamic',
        motionIntensity: 0.9,
        bassResponse: 0.9,
        trebleResponse: 0.6,
    },
    lofi: {
        label: 'Lo-fi',
        description: 'Dreamy, warm, relaxed',
        theme: 'midnight',
        particleShape: 'points',
        visualMode: 'minimal',
        cameraStyle: 'slow',
        motionIntensity: 0.3,
        bassResponse: 0.4,
        trebleResponse: 0.3,
    },
    industrial: {
        label: 'Industrial',
        description: 'Aggressive, mechanical, harsh',
        theme: 'solar',
        particleShape: 'shards',
        visualMode: 'tunnel',
        cameraStyle: 'aggressive',
        motionIntensity: 1.0,
        bassResponse: 1.0,
        trebleResponse: 0.8,
    },
    synthwave: {
        label: 'Synthwave',
        description: 'Retro-futuristic neon grid',
        theme: 'neonCyber',
        particleShape: 'diamonds',
        visualMode: 'galaxy',
        cameraStyle: 'cinematic',
        motionIntensity: 0.6,
        bassResponse: 0.7,
        trebleResponse: 0.5,
    },
    ambient: {
        label: 'Ambient',
        description: 'Smooth cosmic motion',
        theme: 'arctic',
        particleShape: 'points',
        visualMode: 'galaxy',
        cameraStyle: 'slow',
        motionIntensity: 0.2,
        bassResponse: 0.3,
        trebleResponse: 0.2,
    },
    dnb: {
        label: 'Drum & Bass',
        description: 'Fast, punchy, intense',
        theme: 'toxic',
        particleShape: 'hexagons',
        visualMode: 'tunnel',
        cameraStyle: 'dynamic',
        motionIntensity: 0.95,
        bassResponse: 1.0,
        trebleResponse: 0.7,
    },
};

// Supported audio MIME types
const SUPPORTED_TYPES = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'audio/flac', 'audio/aac', 'audio/webm', 'audio/mp4',
    'audio/x-m4a',
];

const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.webm', '.m4a', '.mp4'];

export class TrackLibrary {
    constructor() {
        /** @type {Array<Object>} Playlist of tracks */
        this.playlist = [];

        /** @type {number} Current track index */
        this.currentIndex = -1;

        /** @type {Object|null} Current track */
        this.currentTrack = null;

        // Callbacks
        this._onTrackChange = null;
        this._onError = null;
    }

    /**
     * Get all genre presets
     * @returns {Object}
     */
    getGenrePresets() {
        return GENRE_PRESETS;
    }

    /**
     * Get a specific genre preset
     * @param {string} genre
     * @returns {Object|null}
     */
    getGenrePreset(genre) {
        return GENRE_PRESETS[genre] || null;
    }

    /**
     * Add a track from a File object
     * @param {File} file
     * @returns {Object|null} track or null if unsupported
     */
    addFile(file) {
        // Validate file type
        if (!this._isSupported(file)) {
            if (this._onError) {
                this._onError(`Unsupported file format: ${file.name}. Supported: MP3, WAV, OGG, FLAC, AAC, WebM, M4A`);
            }
            return null;
        }

        const url = URL.createObjectURL(file);
        const title = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

        const track = {
            url,
            title,
            artist: 'Local File',
            genre: 'unknown',
            isBlobUrl: true,
            fileName: file.name,
            fileSize: file.size,
        };

        this.playlist.push(track);
        return track;
    }

    /**
     * Add multiple files
     * @param {FileList|File[]} files
     * @returns {Array<Object>} added tracks
     */
    addFiles(files) {
        const added = [];
        for (const file of files) {
            const track = this.addFile(file);
            if (track) added.push(track);
        }
        return added;
    }

    /**
     * Get current track
     * @returns {Object|null}
     */
    getCurrent() {
        return this.currentTrack;
    }

    /**
     * Select and return the next track
     * @returns {Object|null}
     */
    next() {
        if (this.playlist.length === 0) return null;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        this.currentTrack = this.playlist[this.currentIndex];
        if (this._onTrackChange) this._onTrackChange(this.currentTrack, this.currentIndex);
        return this.currentTrack;
    }

    /**
     * Select and return the previous track
     * @returns {Object|null}
     */
    previous() {
        if (this.playlist.length === 0) return null;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.currentTrack = this.playlist[this.currentIndex];
        if (this._onTrackChange) this._onTrackChange(this.currentTrack, this.currentIndex);
        return this.currentTrack;
    }

    /**
     * Select a track by index
     * @param {number} index
     * @returns {Object|null}
     */
    selectTrack(index) {
        if (index < 0 || index >= this.playlist.length) return null;
        this.currentIndex = index;
        this.currentTrack = this.playlist[index];
        if (this._onTrackChange) this._onTrackChange(this.currentTrack, this.currentIndex);
        return this.currentTrack;
    }

    /**
     * Get playlist length
     * @returns {number}
     */
    get length() {
        return this.playlist.length;
    }

    /**
     * Check if a file is a supported audio format
     * @param {File} file
     * @returns {boolean}
     */
    _isSupported(file) {
        // Check MIME type
        if (file.type && SUPPORTED_TYPES.some(t => file.type.startsWith(t.split('/')[0]) && file.type.includes(t.split('/')[1]))) {
            return true;
        }
        // Fallback: check extension
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return SUPPORTED_EXTENSIONS.includes(ext);
    }

    /**
     * Set track change callback
     * @param {Function} cb - (track, index) => void
     */
    onTrackChange(cb) {
        this._onTrackChange = cb;
    }

    /**
     * Set error callback
     * @param {Function} cb - (message) => void
     */
    onError(cb) {
        this._onError = cb;
    }

    /**
     * Remove a track and clean up blob URL
     * @param {number} index
     */
    removeTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;
        const track = this.playlist[index];
        if (track.isBlobUrl && track.url) {
            URL.revokeObjectURL(track.url);
        }
        this.playlist.splice(index, 1);
        if (this.currentIndex >= this.playlist.length) {
            this.currentIndex = Math.max(0, this.playlist.length - 1);
        }
    }

    /**
     * Clean up all blob URLs
     */
    dispose() {
        for (const track of this.playlist) {
            if (track.isBlobUrl && track.url) {
                URL.revokeObjectURL(track.url);
            }
        }
        this.playlist = [];
    }
}
