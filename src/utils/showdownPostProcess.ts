import * as THREE from 'three';

function createCircleTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 16; // Reduced texture size to save memory
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

export class ShowdownEffectSystem {
    private container: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;

    private particleSystem: THREE.Points | null = null;
    private particleCount = 1000; // Reduced from 2500 to 1000 for mobile/low-end GPU performance
    
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

    constructor(container: HTMLDivElement, canvas: HTMLCanvasElement) {
        this.container = container;
        this.canvas = canvas;
        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        this.camera.position.z = 12;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(1.0); // Hardcoded to 1.0 to prevent massive resolution scaling on Retina displays

        this.initParticleEngine();

        this.lastTime = performance.now();
        this.setupResize();
        this.animate();
    }

    private initParticleEngine(): void {
        const geometry = new THREE.BufferGeometry();

        this.positions = new Float32Array(this.particleCount * 3);
        this.velocities = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.sizes = new Float32Array(this.particleCount);
        this.lifespans = new Float32Array(this.particleCount);
        this.maxLifespans = new Float32Array(this.particleCount);

        for (let i = 0; i < this.particleCount; i++) {
            this.lifespans[i] = 0;
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;
            this.colors[i * 3] = 0;
            this.colors[i * 3 + 1] = 0;
            this.colors[i * 3 + 2] = 0;
            this.sizes[i] = 0;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 2.2, // Slightly larger particles to compensate for no bloom glow
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: createCircleTexture()
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }

    public triggerExplosion(winner: 'p1' | 'p2' | 'draw' | string, intensity = 1.0): void {
        let colorPalette: THREE.Color[];
        if (winner === 'p1') {
            colorPalette = [
                new THREE.Color('#00f2fe'),
                new THREE.Color('#4facfe'),
                new THREE.Color('#ffd700'),
                new THREE.Color('#ffffff')
            ];
        } else if (winner === 'p2') {
            colorPalette = [
                new THREE.Color('#ff0844'),
                new THREE.Color('#ffb199'),
                new THREE.Color('#ffd700'),
                new THREE.Color('#ffffff')
            ];
        } else {
            colorPalette = [
                new THREE.Color('#b300ff'),
                new THREE.Color('#00ffcc'),
                new THREE.Color('#ffd700'),
                new THREE.Color('#ffffff')
            ];
        }

        const posAttr = this.particleSystem!.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colorAttr = this.particleSystem!.geometry.getAttribute('color') as THREE.BufferAttribute;
        const sizeAttr = this.particleSystem!.geometry.getAttribute('size') as THREE.BufferAttribute;

        for (let i = 0; i < this.particleCount; i++) {
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = (0.04 + Math.random() * 0.22) * intensity;

            this.velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
            this.velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            this.velocities[i * 3 + 2] = Math.cos(phi) * speed * 0.2;

            const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            this.colors[i * 3] = col.r;
            this.colors[i * 3 + 1] = col.g;
            this.colors[i * 3 + 2] = col.b;

            this.maxLifespans[i] = 600 + Math.random() * 1200; // Shorter lifetime to reduce overlapping rendering load
            this.lifespans[i] = this.maxLifespans[i];
            
            this.sizes[i] = (0.3 + Math.random() * 0.7) * intensity;
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

        const friction = Math.pow(0.95, deltaTime / 16.6);

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

                this.velocities[i * 3] *= friction;
                this.velocities[i * 3 + 1] *= friction;
                this.velocities[i * 3 + 2] *= friction;

                this.velocities[i * 3 + 1] -= 0.0005 * (deltaTime / 16.6); // Gravity

                this.positions[i * 3] += this.velocities[i * 3] * (deltaTime / 16.6);
                this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * (deltaTime / 16.6);
                this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * (deltaTime / 16.6);

                const lifeRatio = this.lifespans[i] / this.maxLifespans[i];
                sizeAttr.setX(i, this.sizes[i] * Math.sin(lifeRatio * Math.PI));
                
                colorAttr.setXYZ(
                    i, 
                    this.colors[i * 3] * lifeRatio, 
                    this.colors[i * 3 + 1] * (lifeRatio * lifeRatio), 
                    this.colors[i * 3 + 2] * (lifeRatio * lifeRatio * lifeRatio)
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
        const deltaTime = Math.min(now - this.lastTime, 100);
        this.lastTime = now;

        this.updateParticles(deltaTime);

        // Render directly to bypass heavy Bloom and Post-Processing shaders
        this.renderer.render(this.scene, this.camera);
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
    }

    public destroy(): void {
        this.isDestroyed = true;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem.geometry.dispose();
            (this.particleSystem.material as THREE.Material).dispose();
        }
        this.renderer.dispose();
    }
}
