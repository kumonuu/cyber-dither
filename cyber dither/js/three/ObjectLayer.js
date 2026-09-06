/**
 * ObjectLayer.js — Audio-reactive 3D objects for Cyber-Dither
 * 
 * Renders holographic spheres, crystalline structures, toruses, waveform ribbons,
 * and geometric sculptures that deform and pulse with live audio analysis.
 */

import * as THREE from 'three';

export class ObjectLayer {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} themeManager
     */
    constructor(scene, themeManager) {
        this.scene = scene;
        this.themeManager = themeManager;
        this._time = 0;

        const colors = themeManager.getColors();

        // ── Holographic Sphere ──
        this.sphereGroup = new THREE.Group();
        const sphereGeo = new THREE.IcosahedronGeometry(5, 3);
        this.sphereWire = new THREE.Mesh(
            sphereGeo,
            new THREE.MeshBasicMaterial({
                color: colors.primary,
                wireframe: true,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending,
            })
        );
        this.sphereSolid = new THREE.Mesh(
            new THREE.IcosahedronGeometry(4.8, 3),
            new THREE.MeshBasicMaterial({
                color: colors.secondary,
                transparent: true,
                opacity: 0.05,
                blending: THREE.AdditiveBlending,
            })
        );
        this.sphereGroup.add(this.sphereWire);
        this.sphereGroup.add(this.sphereSolid);
        this.scene.add(this.sphereGroup);

        // Store original vertices for displacement
        this._sphereOriginalPositions = sphereGeo.attributes.position.array.slice();

        // ── Torus Knot ──
        this.torusKnot = new THREE.Mesh(
            new THREE.TorusKnotGeometry(3, 0.4, 80, 12, 2, 3),
            new THREE.MeshBasicMaterial({
                color: colors.accent,
                wireframe: true,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending,
            })
        );
        this.torusKnot.position.set(0, 0, 0);
        this.scene.add(this.torusKnot);

        // ── Waveform Ribbon ──
        this.waveformPoints = 128;
        const wavePositions = new Float32Array(this.waveformPoints * 3);
        for (let i = 0; i < this.waveformPoints; i++) {
            wavePositions[i * 3] = (i / this.waveformPoints - 0.5) * 40;
            wavePositions[i * 3 + 1] = 0;
            wavePositions[i * 3 + 2] = 0;
        }
        this.waveformGeometry = new THREE.BufferGeometry();
        this.waveformGeometry.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
        this.waveformLine = new THREE.Line(
            this.waveformGeometry,
            new THREE.LineBasicMaterial({
                color: colors.primary,
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending,
            })
        );
        this.waveformLine.position.y = -5;
        this.scene.add(this.waveformLine);

        // ── Outer Ring ──
        this.outerRing = new THREE.Mesh(
            new THREE.TorusGeometry(12, 0.15, 8, 64),
            new THREE.MeshBasicMaterial({
                color: colors.secondary,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending,
            })
        );
        this.scene.add(this.outerRing);
    }

    /**
     * Update objects — call once per frame
     * @param {Object} analysis - audio analysis
     * @param {number} dt
     */
    update(analysis, dt) {
        this._time += dt;

        const bass = analysis.bass;
        const mids = analysis.mids;
        const highs = analysis.highs;
        const energy = analysis.energy;
        const volume = analysis.volume;

        // ── Sphere: scale pulse + vertex displacement ──
        const sphereScale = 1 + bass * 0.4;
        this.sphereGroup.scale.set(sphereScale, sphereScale, sphereScale);
        this.sphereGroup.rotation.y += (0.005 + mids * 0.02) * 60 * dt;
        this.sphereGroup.rotation.x += 0.002 * 60 * dt;

        // Vertex displacement from audio
        const positions = this.sphereWire.geometry.attributes.position.array;
        const original = this._sphereOriginalPositions;
        for (let i = 0; i < positions.length; i += 3) {
            const ox = original[i], oy = original[i + 1], oz = original[i + 2];
            const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
            const norm = dist > 0 ? 1 / dist : 0;

            // Displace along normal based on audio
            const displacement = (
                Math.sin(this._time * 3 + i * 0.1) * highs * 0.3 +
                bass * 0.2 +
                Math.sin(this._time * 1.5 + i * 0.05) * mids * 0.15
            );

            positions[i] = ox + ox * norm * displacement;
            positions[i + 1] = oy + oy * norm * displacement;
            positions[i + 2] = oz + oz * norm * displacement;
        }
        this.sphereWire.geometry.attributes.position.needsUpdate = true;

        // Sphere opacity
        this.sphereWire.material.opacity = 0.2 + energy * 0.4;
        this.sphereSolid.material.opacity = 0.03 + energy * 0.07;

        // ── Torus Knot: rotation + scale ──
        this.torusKnot.rotation.y += (0.01 + mids * 0.03) * 60 * dt;
        this.torusKnot.rotation.x += (0.005 + bass * 0.01) * 60 * dt;
        const torusScale = 0.8 + energy * 0.5;
        this.torusKnot.scale.set(torusScale, torusScale, torusScale);
        this.torusKnot.material.opacity = 0.1 + energy * 0.2;

        // ── Waveform Ribbon ──
        if (analysis.waveform) {
            const wavePositions = this.waveformGeometry.attributes.position.array;
            const step = Math.max(1, Math.floor(analysis.waveform.length / this.waveformPoints));

            for (let i = 0; i < this.waveformPoints; i++) {
                const dataIndex = i * step;
                const value = dataIndex < analysis.waveform.length ? analysis.waveform[dataIndex] : 0;
                wavePositions[i * 3 + 1] = value * 8 * (0.5 + volume * 2);
            }
            this.waveformGeometry.attributes.position.needsUpdate = true;
        }
        this.waveformLine.material.opacity = 0.3 + volume * 0.5;

        // ── Outer Ring ──
        this.outerRing.rotation.x = Math.PI / 2 + Math.sin(this._time * 0.3) * 0.1;
        this.outerRing.rotation.z += 0.003 * 60 * dt;
        const ringScale = 1 + bass * 0.15;
        this.outerRing.scale.set(ringScale, ringScale, ringScale);
        this.outerRing.material.opacity = 0.15 + energy * 0.15;
    }

    /**
     * Update theme colours
     */
    updateColors() {
        const colors = this.themeManager.getColors();
        this.sphereWire.material.color.setHex(colors.primary);
        this.sphereSolid.material.color.setHex(colors.secondary);
        this.torusKnot.material.color.setHex(colors.accent);
        this.waveformLine.material.color.setHex(colors.primary);
        this.outerRing.material.color.setHex(colors.secondary);
    }

    /**
     * Dispose
     */
    dispose() {
        this.scene.remove(this.sphereGroup);
        this.scene.remove(this.torusKnot);
        this.scene.remove(this.waveformLine);
        this.scene.remove(this.outerRing);
        // Dispose geometries and materials
        [this.sphereWire, this.sphereSolid, this.torusKnot, this.waveformLine, this.outerRing].forEach(obj => {
            obj.geometry.dispose();
            obj.material.dispose();
        });
    }
}
