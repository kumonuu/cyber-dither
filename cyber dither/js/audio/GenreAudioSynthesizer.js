/**
 * GenreAudioSynthesizer.js — Procedural Audio Generator for Cyber-Dither
 * 
 * Generates authentic, high-quality looping music tracks for multiple genres
 * entirely in client-side code using algorithmic sound synthesis and exports
 * them as standard 16-bit 44.1kHz stereo WAV Blob URLs.
 */

export class GenreAudioSynthesizer {
    /**
     * Generate all built-in genre tracks
     * @returns {Array<Object>} array of track objects ready for TrackLibrary
     */
    static generateAllTracks() {
        const sampleRate = 44100;
        const genres = [
            { id: 'synthwave', title: 'Neon Highway', artist: 'Cyber-Dither Synth', genre: 'Synthwave', bpm: 120, bars: 8 },
            { id: 'dance', title: 'Cybernetic Pulse', artist: 'Cyber-Dither Techno', genre: 'Dance', bpm: 128, bars: 8 },
            { id: 'lofi', title: 'Midnight Rain', artist: 'Cyber-Dither Chill', genre: 'Lo-Fi', bpm: 85, bars: 6 },
            { id: 'industrial', title: 'Overdrive Protocol', artist: 'Cyber-Dither Heavy', genre: 'Industrial', bpm: 136, bars: 8 },
            { id: 'dnb', title: 'Quantum Velocity', artist: 'Cyber-Dither Breaks', genre: 'Drum & Bass', bpm: 172, bars: 12 },
            { id: 'ambient', title: 'Stardust Drift', artist: 'Cyber-Dither Cosmos', genre: 'Ambient', bpm: 60, bars: 4 },
        ];

        return genres.map(g => {
            const url = this.generateGenreTrack(g.id, g.bpm, g.bars, sampleRate);
            return {
                id: g.id,
                title: g.title,
                artist: g.artist,
                genre: g.genre,
                bpm: g.bpm,
                url,
                isBlobUrl: true,
                isBuiltIn: true,
            };
        });
    }

    /**
     * Synthesize audio for a specific genre and return a Blob URL
     * @param {string} genre
     * @param {number} bpm
     * @param {number} bars
     * @param {number} sampleRate
     * @returns {string} Object URL
     */
    static generateGenreTrack(genre, bpm, bars, sampleRate = 44100) {
        const beatsPerBar = 4;
        const totalBeats = bars * beatsPerBar;
        const secondsPerBeat = 60 / bpm;
        const totalSeconds = totalBeats * secondsPerBeat;
        const numSamples = Math.floor(totalSeconds * sampleRate);

        const left = new Float32Array(numSamples);
        const right = new Float32Array(numSamples);

        switch (genre) {
            case 'synthwave':
                this._synthwave(left, right, numSamples, sampleRate, secondsPerBeat, totalSeconds);
                break;
            case 'dance':
                this._dance(left, right, numSamples, sampleRate, secondsPerBeat, totalSeconds);
                break;
            case 'lofi':
                this._lofi(left, right, numSamples, sampleRate, secondsPerBeat, totalSeconds);
                break;
            case 'industrial':
                this._industrial(left, right, numSamples, sampleRate, secondsPerBeat, totalSeconds);
                break;
            case 'dnb':
                this._dnb(left, right, numSamples, sampleRate, secondsPerBeat, totalSeconds);
                break;
            case 'ambient':
            default:
                this._ambient(left, right, numSamples, sampleRate, secondsPerBeat, totalSeconds);
                break;
        }

        // Apply master limiter and normalization
        this._master(left, right, numSamples);

        // Encode to WAV Blob
        const wavBuffer = this._encodeWAV(left, right, sampleRate);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    }

    // ────────────────── GENRE SYNTHESIZERS ──────────────────

    /**
     * Synthwave: 120 BPM, punchy kick, gated snare, rolling 16th saw bass, retro pads, neon arp
     */
    static _synthwave(L, R, len, sr, spb, dur) {
        const step16 = spb / 4;
        const bassNotes = [55, 55, 65.4, 65.4, 73.4, 73.4, 87.3, 82.4];
        const arpNotes = [220, 261.6, 293.7, 329.6, 392.0, 440, 523.2, 659.2];

        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const beatPos = (t / spb) % 4;
            const beatFrac = beatPos % 1;

            // 1. Kick (beats 0, 1, 2, 3)
            const kickEnv = Math.exp(-beatFrac * 28);
            const kickFreq = 120 * Math.exp(-beatFrac * 35) + 45;
            const kick = Math.sin(2 * Math.PI * kickFreq * beatFrac * spb) * kickEnv * 0.7;

            // 2. Snare (beats 1 and 3)
            let snare = 0;
            const snareBeat = (beatPos >= 1 && beatPos < 2) ? beatPos - 1 : (beatPos >= 3) ? beatPos - 3 : -1;
            if (snareBeat >= 0) {
                const snareEnv = Math.exp(-snareBeat * 14);
                const noise = (Math.random() * 2 - 1) * snareEnv * 0.35;
                const tone = Math.sin(2 * Math.PI * 180 * snareBeat * spb) * Math.exp(-snareBeat * 25) * 0.3;
                snare = noise + tone;
            }

            // 3. Hi-hat (every 16th)
            const sixteenthPos = (t / step16) % 1;
            const hatEnv = Math.exp(-sixteenthPos * 45);
            const hat = (Math.random() * 2 - 1) * hatEnv * 0.12;

            // 4. Rolling 16th Sawtooth Bass
            const bassStep = Math.floor(t / step16) % bassNotes.length;
            const bFreq = bassNotes[bassStep];
            const bPhase = (t * bFreq) % 1;
            const saw = (bPhase * 2 - 1) * 0.3;
            const sub = Math.sin(2 * Math.PI * (bFreq * 0.5) * t) * 0.25;
            const bassEnv = Math.exp(-sixteenthPos * 6);
            const bass = (saw + sub) * bassEnv;

            // 5. Arpeggio Lead (16th notes)
            const arpStep = Math.floor(t / step16) % arpNotes.length;
            const aFreq = arpNotes[arpStep];
            const aPhase = (t * aFreq) % 1;
            const aSaw = (aPhase > 0.5 ? 1 : -1) * 0.12;
            const aEnv = Math.exp(-sixteenthPos * 10);
            const arp = aSaw * aEnv;

            // 6. Lush Pad (A minor -> F major -> G major chords)
            const chordT = (t / (spb * 8)) % 3;
            let p1 = 220, p2 = 261.6, p3 = 329.6;
            if (chordT >= 1 && chordT < 2) { p1 = 174.6; p2 = 220; p3 = 261.6; }
            else if (chordT >= 2) { p1 = 196.0; p2 = 246.9; p3 = 293.7; }
            const pad = (
                Math.sin(2 * Math.PI * p1 * t) +
                Math.sin(2 * Math.PI * p2 * t * 1.002) +
                Math.sin(2 * Math.PI * p3 * t * 0.998)
            ) * 0.08;

            L[i] += kick + snare * 0.9 + hat * 0.7 + bass * 0.8 + arp * 0.7 + pad;
            R[i] += kick + snare * 0.9 + hat * 1.1 + bass * 0.8 + arp * 0.9 + pad;
        }
    }

    /**
     * Dance/Techno: 128 BPM, four-on-floor punchy kick, rolling acid 303 bass, offbeat hats, rave stabs
     */
    static _dance(L, R, len, sr, spb, dur) {
        const step16 = spb / 4;
        const acidNotes = [58.27, 58.27, 116.54, 58.27, 69.3, 58.27, 87.3, 77.78];

        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const beatFrac = (t / spb) % 1;

            // 1. 909-style Punchy Kick
            const kickEnv = Math.exp(-beatFrac * 22);
            const kickFreq = 140 * Math.exp(-beatFrac * 40) + 48;
            const kick = Math.sin(2 * Math.PI * kickFreq * beatFrac * spb) * kickEnv * 0.8;

            // 2. Offbeat Open Hi-hat (at beatFrac 0.5)
            const hatOffset = (beatFrac + 0.5) % 1;
            const oHatEnv = Math.exp(-hatOffset * 18);
            const oHat = (Math.random() * 2 - 1) * oHatEnv * 0.22;

            // 3. 16th Closed Hi-hat
            const s16 = (t / step16) % 1;
            const cHat = (Math.random() * 2 - 1) * Math.exp(-s16 * 50) * 0.08;

            // 4. Claps on 2 and 4
            const beatPos = (t / spb) % 4;
            let clap = 0;
            const clapBeat = (beatPos >= 1 && beatPos < 2) ? beatPos - 1 : (beatPos >= 3) ? beatPos - 3 : -1;
            if (clapBeat >= 0) {
                const cEnv = Math.exp(-clapBeat * 16);
                clap = (Math.random() * 2 - 1) * cEnv * 0.28;
            }

            // 5. Acid Bass
            const stepIndex = Math.floor(t / step16) % acidNotes.length;
            const freq = acidNotes[stepIndex];
            const saw = ((t * freq) % 1) * 2 - 1;
            const squ = Math.sin(2 * Math.PI * freq * t);
            const acid = (saw * 0.6 + squ * 0.4) * Math.exp(-s16 * 7) * 0.35;

            // 6. Rave Synth Stab (every 4 beats)
            const stabPos = (t / (spb * 2)) % 1;
            const stabEnv = Math.exp(-stabPos * 12);
            const stab = (
                Math.sin(2 * Math.PI * 293.66 * t) +
                Math.sin(2 * Math.PI * 349.23 * t) +
                Math.sin(2 * Math.PI * 440.00 * t)
            ) * stabEnv * 0.15;

            L[i] += kick + clap * 0.8 + oHat * 0.9 + cHat * 0.6 + acid * 0.85 + stab * 0.7;
            R[i] += kick + clap * 0.8 + oHat * 1.1 + cHat * 0.8 + acid * 0.85 + stab * 0.9;
        }
    }

    /**
     * Lo-Fi Chill: 85 BPM, warm Rhodes chords, vinyl dust, mellow sub-bass, relaxed hip-hop beat
     */
    static _lofi(L, R, len, sr, spb, dur) {
        const chords = [
            [130.8, 155.6, 196.0, 233.1],
            [174.6, 207.7, 261.6, 311.1],
            [146.8, 174.6, 220.0, 261.6],
            [196.0, 233.1, 293.7, 349.2],
        ];

        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const beatPos = (t / spb) % 4;
            const beatFrac = beatPos % 1;

            // 1. Vinyl Dust / Crackle
            const crackle = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 0.08 : 0;
            const vinylNoise = (Math.random() * 2 - 1) * 0.015;

            // 2. Mellow Boombap Kick
            let kick = 0;
            const k1 = beatFrac;
            const k2 = (beatPos >= 2.5 && beatPos < 3.5) ? (beatPos - 2.5) : -1;
            if (k1 < 0.5) kick += Math.sin(2 * Math.PI * (70 * Math.exp(-k1 * 15) + 38) * k1 * spb) * Math.exp(-k1 * 12) * 0.6;
            if (k2 >= 0 && k2 < 0.5) kick += Math.sin(2 * Math.PI * (70 * Math.exp(-k2 * 15) + 38) * k2 * spb) * Math.exp(-k2 * 12) * 0.5;

            // 3. Rimshot / Snare
            let rim = 0;
            const rimBeat = (beatPos >= 1 && beatPos < 2) ? beatPos - 1 : (beatPos >= 3) ? beatPos - 3 : -1;
            if (rimBeat >= 0) {
                rim = ((Math.random() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 320 * rimBeat * spb) * 0.5) * Math.exp(-rimBeat * 20) * 0.25;
            }

            // 4. Relaxed Hi-hat
            const swingFrac = (beatFrac * 2) % 1;
            const hat = (Math.random() * 2 - 1) * Math.exp(-swingFrac * 30) * 0.06;

            // 5. Electric Piano / Rhodes chords
            const chordIndex = Math.floor(t / (spb * 4)) % chords.length;
            const chord = chords[chordIndex];
            const vibrato = 1 + 0.004 * Math.sin(t * 8);
            let rhodes = 0;
            for (const f of chord) {
                rhodes += (
                    Math.sin(2 * Math.PI * f * vibrato * t) * 0.6 +
                    Math.sin(2 * Math.PI * f * 2 * vibrato * t) * 0.25 +
                    Math.sin(2 * Math.PI * f * 3 * vibrato * t) * 0.1
                );
            }
            const chordEnv = Math.exp(-beatFrac * 1.5) * 0.12;
            rhodes *= chordEnv;

            // 6. Deep Warm Sub Bass
            const rootFreq = chord[0] * 0.5;
            const sub = Math.sin(2 * Math.PI * rootFreq * t) * 0.28;

            L[i] += kick + rim * 0.85 + hat * 0.7 + rhodes * 0.9 + sub + crackle + vinylNoise;
            R[i] += kick + rim * 0.85 + hat * 1.1 + rhodes * 1.1 + sub + crackle + vinylNoise;
        }
    }

    /**
     * Dark Industrial: 136 BPM, distorted heavy kick, metallic noise clangs, dark saw bass, cyber sirens
     */
    static _industrial(L, R, len, sr, spb, dur) {
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const beatFrac = (t / spb) % 1;

            // 1. Distorted Overdriven Kick
            const kickEnv = Math.exp(-beatFrac * 18);
            const kickFreq = 160 * Math.exp(-beatFrac * 35) + 40;
            let kickRaw = Math.sin(2 * Math.PI * kickFreq * beatFrac * spb) * kickEnv * 1.2;
            const kick = Math.tanh(kickRaw * 2.5) * 0.7;

            // 2. Metallic Clang / Snare
            const beatPos = (t / spb) % 4;
            let clang = 0;
            const clangBeat = (beatPos >= 1 && beatPos < 2) ? beatPos - 1 : (beatPos >= 3) ? beatPos - 3 : -1;
            if (clangBeat >= 0) {
                const fm = Math.sin(2 * Math.PI * 480 * clangBeat * spb + Math.sin(2 * Math.PI * 720 * clangBeat * spb) * 4);
                const noise = (Math.random() * 2 - 1) * 0.4;
                clang = (fm + noise) * Math.exp(-clangBeat * 16) * 0.35;
            }

            // 3. Gritty Industrial Saw Bass in E minor (41.2 Hz)
            const bStep = Math.floor(t / (spb / 2)) % 4;
            const bFreqs = [41.2, 41.2, 49.0, 43.6];
            const f = bFreqs[bStep];
            const saw1 = ((t * f) % 1) * 2 - 1;
            const saw2 = ((t * f * 1.01) % 1) * 2 - 1;
            const bass = Math.tanh((saw1 + saw2) * 1.8) * 0.3;

            // 4. Cyber Siren
            const sirenSweep = 400 + 300 * Math.sin(t * 1.2);
            const siren = Math.sin(2 * Math.PI * sirenSweep * t) * 0.08 * (0.5 + 0.5 * Math.sin(t * 0.5));

            // 5. Harsh 16th Hi-hat
            const s16 = (t / (spb / 4)) % 1;
            const hat = (Math.random() * 2 - 1) * Math.exp(-s16 * 40) * 0.1;

            L[i] += kick + clang * 0.9 + bass * 0.85 + siren * 0.7 + hat * 0.7;
            R[i] += kick + clang * 0.9 + bass * 0.85 + siren * 0.9 + hat * 1.1;
        }
    }

    /**
     * Drum & Bass: 172 BPM, energetic 2-step breakbeat, reese bass glide, soaring synth pads
     */
    static _dnb(L, R, len, sr, spb, dur) {
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const beatPos = (t / spb) % 4;

            // 1. Fast Breakbeat
            let kick = 0;
            const k1 = beatPos % 1;
            const k2 = (beatPos >= 2.5 && beatPos < 3.5) ? (beatPos - 2.5) : -1;
            if (k1 < 0.35) kick += Math.sin(2 * Math.PI * (160 * Math.exp(-k1 * 28) + 48) * k1 * spb) * Math.exp(-k1 * 18) * 0.75;
            if (k2 >= 0 && k2 < 0.35) kick += Math.sin(2 * Math.PI * (160 * Math.exp(-k2 * 28) + 48) * k2 * spb) * Math.exp(-k2 * 18) * 0.65;

            // 2. Snappy DnB Snare
            let snare = 0;
            const sBeat = (beatPos >= 1 && beatPos < 2) ? beatPos - 1 : (beatPos >= 3) ? beatPos - 3 : -1;
            if (sBeat >= 0) {
                const sTone = Math.sin(2 * Math.PI * 210 * sBeat * spb) * Math.exp(-sBeat * 30);
                const sNoise = (Math.random() * 2 - 1) * Math.exp(-sBeat * 20);
                snare = (sTone * 0.5 + sNoise * 0.5) * 0.38;
            }

            // 3. Fast Shuffling 16th Hi-hats
            const s16 = (t / (spb / 4)) % 1;
            const hat = (Math.random() * 2 - 1) * Math.exp(-s16 * 35) * 0.09;

            // 4. Reese Bass (detuned oscillating saw waves in F: 43.65 Hz)
            const reeseF = 43.65 + Math.sin(t * 0.8) * 4;
            const sawA = ((t * reeseF) % 1) * 2 - 1;
            const sawB = ((t * (reeseF * 1.015)) % 1) * 2 - 1;
            const sawC = ((t * (reeseF * 0.985)) % 1) * 2 - 1;
            const sub = Math.sin(2 * Math.PI * reeseF * t);
            const reese = (sawA + sawB + sawC + sub) * 0.16;

            // 5. Soaring High Lead Pad (F minor 9th)
            const pad = (
                Math.sin(2 * Math.PI * 349.23 * t) +
                Math.sin(2 * Math.PI * 415.30 * t) +
                Math.sin(2 * Math.PI * 523.25 * t)
            ) * 0.06 * (0.7 + 0.3 * Math.sin(t * 2));

            L[i] += kick + snare * 0.9 + hat * 0.8 + reese * 0.9 + pad * 0.7;
            R[i] += kick + snare * 0.9 + hat * 1.1 + reese * 0.9 + pad * 1.0;
        }
    }

    /**
     * Cosmic Ambient: 60 BPM, deep sub drone, shimmering pentatonic crystal bells, spatial evolving pads
     */
    static _ambient(L, R, len, sr, spb, dur) {
        const bells = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25];

        for (let i = 0; i < len; i++) {
            const t = i / sr;

            // 1. Deep Cosmic Drone in C
            const drone = (
                Math.sin(2 * Math.PI * 32.7 * t) * 0.35 +
                Math.sin(2 * Math.PI * 65.41 * t * 1.001) * 0.2 +
                Math.sin(2 * Math.PI * 98.11 * t) * 0.1
            );

            // 2. Slow Evolving Pad
            const padPhase = Math.sin(t * 0.3);
            const pad = (
                Math.sin(2 * Math.PI * 130.81 * t) +
                Math.sin(2 * Math.PI * 196.00 * t * (1 + 0.002 * padPhase)) +
                Math.sin(2 * Math.PI * 261.63 * t * (1 - 0.002 * padPhase)) +
                Math.sin(2 * Math.PI * 392.00 * t)
            ) * 0.07;

            // 3. Shimmering FM Crystal Bells
            const bellPeriod = 2.5;
            const bellIdx = Math.floor(t / bellPeriod) % bells.length;
            const bellFrac = (t % bellPeriod);
            const bellF = bells[bellIdx];
            const bellEnv = Math.exp(-bellFrac * 3.5);
            const bellMod = Math.sin(2 * Math.PI * bellF * 2.7 * bellFrac) * 3 * bellEnv;
            const bell = Math.sin(2 * Math.PI * bellF * bellFrac + bellMod) * bellEnv * 0.15;

            // 4. Subtle Cosmic Pulse
            const pulse = Math.sin(2 * Math.PI * 55 * t) * Math.pow(Math.sin(t * Math.PI * 0.5), 4) * 0.15;

            L[i] += drone + pad * 0.8 + bell * 0.9 + pulse;
            R[i] += drone + pad * 1.1 + bell * 0.7 + pulse;
        }
    }

    // ────────────────── MASTERING & WAV ENCODING ──────────────────

    /**
     * Master limiter and normalization
     */
    static _master(L, R, len) {
        let maxPeak = 0;
        for (let i = 0; i < len; i++) {
            const peak = Math.max(Math.abs(L[i]), Math.abs(R[i]));
            if (peak > maxPeak) maxPeak = peak;
        }

        const targetPeak = 0.95;
        const gain = maxPeak > 0 ? (targetPeak / maxPeak) : 1;

        for (let i = 0; i < len; i++) {
            L[i] = Math.tanh(L[i] * gain);
            R[i] = Math.tanh(R[i] * gain);
        }
    }

    /**
     * Encode 32-bit float stereo arrays to 16-bit 44.1kHz Stereo WAV ArrayBuffer
     */
    static _encodeWAV(left, right, sampleRate) {
        const numChannels = 2;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const numSamples = left.length;
        const dataSize = numSamples * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this._writeString(view, 8, 'WAVE');
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
            const sL = Math.max(-1, Math.min(1, left[i]));
            view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
            offset += 2;

            const sR = Math.max(-1, Math.min(1, right[i]));
            view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
            offset += 2;
        }

        return buffer;
    }

    static _writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}
