/**
 * WelcomeScreen.js — Loading/welcome screen for Cyber-Dither
 * 
 * Full-screen overlay with animated logo, dither transition,
 * and "Enter Experience" button that initialises AudioContext.
 */

export class WelcomeScreen {
    /**
     * @param {Function} onEnter - callback when user enters the experience
     */
    constructor(onEnter) {
        this.onEnter = onEnter;
        this.element = document.getElementById('welcome-screen');
        this.enterBtn = document.getElementById('btn-enter');
        this.isVisible = true;

        if (this.enterBtn) {
            this.enterBtn.addEventListener('click', () => this._enter());
        }

        // Also allow Enter key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.isVisible) {
                this._enter();
            }
        });
    }

    /**
     * Transition out and enter the experience
     */
    _enter() {
        if (!this.isVisible) return;
        this.isVisible = false;

        if (this.element && typeof gsap !== 'undefined') {
            gsap.to(this.element, {
                opacity: 0,
                scale: 1.1,
                filter: 'blur(20px)',
                duration: 1.2,
                ease: 'power3.inOut',
                onComplete: () => {
                    this.element.style.display = 'none';
                    this.element.style.pointerEvents = 'none';
                    if (this.onEnter) this.onEnter();
                },
            });
        } else if (this.element) {
            this.element.style.display = 'none';
            if (this.onEnter) this.onEnter();
        }
    }

    /**
     * Show welcome screen
     */
    show() {
        if (this.element) {
            this.element.style.display = 'flex';
            this.element.style.opacity = '1';
            this.element.style.filter = 'none';
            this.element.style.pointerEvents = 'auto';
            this.isVisible = true;
        }
    }
}
