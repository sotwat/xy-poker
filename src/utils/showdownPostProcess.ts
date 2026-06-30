import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Custom Chromatic Aberration (RGB Shift) Shader
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        uAmount: { value: 0.0 }
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
        uniform float uAmount;
        varying vec2 vUv;
        void main() {
            vec2 uv = vUv;
            // Shift Red and Blue channels in opposite horizontal directions
            vec4 cr = texture2D(tDiffuse, uv + vec2(uAmount, 0.0));
            vec4 cg = texture2D(tDiffuse, uv);
            vec4 cb = texture2D(tDiffuse, uv - vec2(uAmount, 0.0));
            gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
        }
    `
};

function createCircleTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

export class ShowdownEffectSystem {
    private container: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private composer!: EffectComposer;
    private bloomPass!: UnrealBloomPass;
    private chromaticAberrationPass!: ShaderPass;

    private particleSystem: THREE.Points | null = null;
    private particleCount = 2500;
    
    // Arrays to manage particle physics in CPU, then push to BufferAttribute
    private positions!: Float32Array;
    private velocities!: Float32Array;
    private colors!: Float32Array;
    private sizes!: Float32Array;
    private lifespans!: Float32Array;
    private maxLifespans!: Float32Array;

    private width: number;
    private height: number;
    private animationFrameId: number | null = null;
    private lastTime = 0;
    private isDestroyed = false;

    // Shake and chromatic aberration animation state
    private chromaticAberrationTarget = 0.0;
    private chromaticAberrationCurrent = 0.0;

    constructor(container: HTMLDivElement, canvas: HTMLCanvasElement) {
        this.container = container;
        this.canvas = canvas;
        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        // 1. Scene & Camera Setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        this.camera.position.z = 12;

        // 2. WebGL Renderer Setup
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: false, // Turned off for performance since postprocess adds bloom
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // 3. Post-Processing Setup
        this.initPostProcessing();

        // 4. Initialize Particle Engine
        this.initParticleEngine();

        this.lastTime = performance.now();
        this.setupResize();
        this.animate();
    }

    private initPostProcessing(): void {
        const renderPass = new RenderPass(this.scene, this.camera);
        
        // UnrealBloomPass parameters: (resolution, strength, radius, threshold)
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            1.5,  // Strength
            0.6,  // Radius
            0.15  // Threshold (lower = glowing more objects)
        );

        this.chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderPass);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.chromaticAberrationPass);
    }

    private initParticleEngine(): void {
        const geometry = new THREE.BufferGeometry();

        this.positions = new Float32Array(this.particleCount * 3);
        this.velocities = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.sizes = new Float32Array(this.particleCount);
        this.lifespans = new Float32Array(this.particleCount);
        this.maxLifespans = new Float32Array(this.particleCount);

        // Initialize all particles as dead (lifespan = 0)
        for (let i = 0; i < this.particleCount; i++) {
            this.lifespans[i] = 0;
            
            // Default position at origin
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;
            
            // Transparent colors
            this.colors[i * 3] = 0;
            this.colors[i * 3 + 1] = 0;
            this.colors[i * 3 + 2] = 0;
            
            this.sizes[i] = 0;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        // Create Particle Material with canvas glow texture
        const material = new THREE.PointsMaterial({
            size: 1.0,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending, // 加算合成で光らせる
            depthWrite: false,
            map: createCircleTexture()
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }

    /**
     * Triggers a Pachinko-style dynamic particle explosion from the center
     */
    public triggerExplosion(winner: 'p1' | 'p2' | 'draw' | string, intensity = 1.0): void {
        // Set colors based on winner
        let colorPalette: THREE.Color[];
        if (winner === 'p1') {
            // Blue/Gold theme
            colorPalette = [
                new THREE.Color('#4facfe'), // neon blue
                new THREE.Color('#00f2fe'), // cyan
                new THREE.Color('#ffd700'), // gold
                new THREE.Color('#ffffff')  // white spark
            ];
        } else if (winner === 'p2') {
            // Red/Gold theme
            colorPalette = [
                new THREE.Color('#ff0844'), // neon red
                new THREE.Color('#ffb199'), // hot peach
                new THREE.Color('#ffd700'), // gold
                new THREE.Color('#ffffff')  // white spark
            ];
        } else {
            // Rainbow / Purple / Gold for Draw or premium states
            colorPalette = [
                new THREE.Color('#b300ff'), // neon purple
                new THREE.Color('#00ffcc'), // mint
                new THREE.Color('#ffd700'), // gold
                new THREE.Color('#ffffff')
            ];
        }

        // Trigger chromatic aberration pop
        this.chromaticAberrationTarget = 0.018 * intensity;
        this.chromaticAberrationCurrent = 0.018 * intensity;
        
        // Instantly dim the bloom threshold and push strength high
        this.bloomPass.strength = 2.8 * intensity;

        // Wake up particles
        const posAttr = this.particleSystem!.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colorAttr = this.particleSystem!.geometry.getAttribute('color') as THREE.BufferAttribute;
        const sizeAttr = this.particleSystem!.geometry.getAttribute('size') as THREE.BufferAttribute;

        for (let i = 0; i < this.particleCount; i++) {
            // Re-spawn particles
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;

            // Hyperbolic explosion distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = (0.05 + Math.random() * 0.28) * intensity;

            this.velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
            this.velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            this.velocities[i * 3 + 2] = Math.cos(phi) * speed * 0.3; // flatter Z plane

            // Add slight rotational vortex velocity
            const radius = 0.02;
            this.velocities[i * 3] += -Math.sin(theta) * radius;
            this.velocities[i * 3 + 1] += Math.cos(theta) * radius;

            // Pick a random color from the palette
            const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            this.colors[i * 3] = col.r;
            this.colors[i * 3 + 1] = col.g;
            this.colors[i * 3 + 2] = col.b;

            // Lifespan: between 0.8s and 2.5s
            this.maxLifespans[i] = 800 + Math.random() * 1700;
            this.lifespans[i] = this.maxLifespans[i];
            
            // Size: 0.15 to 0.7
            this.sizes[i] = (0.2 + Math.random() * 0.6) * intensity;
        }

        posAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
    }

    private updateParticles(deltaTime: number): void {
        if (!this.particleSystem) return;

        const posAttr = this.particleSystem.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colorAttr = this.particleSystem.geometry.getAttribute('color') as THREE.BufferAttribute;
        const sizeAttr = this.particleSystem.geometry.getAttribute('size') as THREE.BufferAttribute;

        let needsPosUpdate = false;
        let needsColorUpdate = false;
        let needsSizeUpdate = false;

        const friction = Math.pow(0.965, deltaTime / 16.6); // Scale friction by time

        for (let i = 0; i < this.particleCount; i++) {
            if (this.lifespans[i] > 0) {
                this.lifespans[i] -= deltaTime;

                if (this.lifespans[i] <= 0) {
                    this.lifespans[i] = 0;
                    this.sizes[i] = 0;
                    this.colors[i * 3] = 0;
                    this.colors[i * 3 + 1] = 0;
                    this.colors[i * 3 + 2] = 0;
                    
                    needsSizeUpdate = true;
                    needsColorUpdate = true;
                    continue;
                }

                // Apply velocity and drag
                this.velocities[i * 3] *= friction;
                this.velocities[i * 3 + 1] *= friction;
                this.velocities[i * 3 + 2] *= friction;

                // Add minor gravity pull down
                this.velocities[i * 3 + 1] -= 0.0006 * (deltaTime / 16.6);

                // Add spiral/vortex expansion force
                const x = this.positions[i * 3];
                const y = this.positions[i * 3 + 1];
                const dist = Math.sqrt(x*x + y*y) || 0.001;
                this.velocities[i * 3] += (x / dist) * 0.001 * (deltaTime / 16.6);
                this.velocities[i * 3 + 1] += (y / dist) * 0.001 * (deltaTime / 16.6);

                this.positions[i * 3] += this.velocities[i * 3] * (deltaTime / 16.6);
                this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * (deltaTime / 16.6);
                this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * (deltaTime / 16.6);

                // Size fadeout
                const lifeRatio = this.lifespans[i] / this.maxLifespans[i];
                sizeAttr.setX(i, this.sizes[i] * Math.sin(lifeRatio * Math.PI)); // Fade in and out smoothly
                
                // Color fadeout / burning effect
                colorAttr.setXYZ(
                    i, 
                    this.colors[i * 3] * lifeRatio, 
                    this.colors[i * 3 + 1] * (lifeRatio * lifeRatio), // Greens fade faster (creating color transitions)
                    this.colors[i * 3 + 2] * (lifeRatio * lifeRatio * lifeRatio) // Blues fade fastest
                );

                posAttr.setXYZ(i, this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);

                needsPosUpdate = true;
                needsColorUpdate = true;
                needsSizeUpdate = true;
            }
        }

        if (needsPosUpdate) posAttr.needsUpdate = true;
        if (needsColorUpdate) colorAttr.needsUpdate = true;
        if (needsSizeUpdate) sizeAttr.needsUpdate = true;
    }

    private animate = (): void => {
        if (this.isDestroyed) return;

        this.animationFrameId = requestAnimationFrame(this.animate);

        const now = performance.now();
        const deltaTime = Math.min(now - this.lastTime, 100); // Caps deltaTime at 100ms
        this.lastTime = now;

        // 1. Physics update
        this.updateParticles(deltaTime);

        // 2. Post-processing value animation (decaying back to normal)
        this.chromaticAberrationCurrent += (this.chromaticAberrationTarget - this.chromaticAberrationCurrent) * 0.08 * (deltaTime / 16.6);
        this.chromaticAberrationPass.uniforms.uAmount.value = this.chromaticAberrationCurrent;
        
        // Decay target to 0
        this.chromaticAberrationTarget *= Math.pow(0.85, deltaTime / 16.6);

        // Decay bloom strength back to standard
        this.bloomPass.strength += (1.4 - this.bloomPass.strength) * 0.05 * (deltaTime / 16.6);

        // 3. Render
        this.composer.render();
    };

    private setupResize(): void {
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                this.resize(width, height);
            }
        });
        resizeObserver.observe(this.container);
    }

    private resize(width: number, height: number): void {
        this.width = width || window.innerWidth;
        this.height = height || window.innerHeight;

        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);
        this.composer.setSize(this.width, this.height);
    }

    public destroy(): void {
        this.isDestroyed = true;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Clean up WebGL resources
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem.geometry.dispose();
            (this.particleSystem.material as THREE.Material).dispose();
        }
        this.renderer.dispose();
        this.composer.dispose();
    }
}
