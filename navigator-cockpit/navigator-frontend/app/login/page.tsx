'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// --- ASSETS ---

const MonolithLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M25 85 L35 15 L48 15 L48 85 Z" opacity="0.9" />
    <path d="M75 85 L65 15 L52 15 L52 85 Z" opacity="0.9" />
    <rect x="49" y="45" width="2" height="10" opacity="0.8" />
  </svg>
);

// --- GEMINI 3 STYLE PARTICLE SYSTEM ---

const GeminiParticleSystem = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let width = canvas.width = window.innerWidth / 2; // Right half only
    let height = canvas.height = window.innerHeight;
    
    // 1. Define the Target Shape (The Monolith)
    // We draw the shape on an offscreen canvas to "scan" for pixel positions
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = height;
    const tCtx = targetCanvas.getContext('2d');
    if (!tCtx) return;

    const initTarget = () => {
        tCtx.clearRect(0, 0, width, height);
        // Draw the Monolith shape (Two Pillars) in the center
        const cx = width / 2;
        const cy = height / 2;
        const scale = Math.min(width, height) * 0.4; // Size of logo

        tCtx.fillStyle = '#FFFFFF';
        tCtx.beginPath();
        
        // Left Pillar
        tCtx.moveTo(cx - scale * 0.25, cy + scale * 0.5); // Bottom Left
        tCtx.lineTo(cx - scale * 0.15, cy - scale * 0.5); // Top Left
        tCtx.lineTo(cx - scale * 0.02, cy - scale * 0.5); // Top Right (Gap)
        tCtx.lineTo(cx - scale * 0.02, cy + scale * 0.5); // Bottom Right (Gap)
        
        // Right Pillar
        tCtx.moveTo(cx + scale * 0.25, cy + scale * 0.5);
        tCtx.lineTo(cx + scale * 0.15, cy - scale * 0.5);
        tCtx.lineTo(cx + scale * 0.02, cy - scale * 0.5);
        tCtx.lineTo(cx + scale * 0.02, cy + scale * 0.5);

        tCtx.fill();
    };

    // 2. Particle Class
    class Particle {
        x: number;
        y: number;
        originX: number;
        originY: number;
        vx: number;
        vy: number;
        size: number;
        color: string;
        
        constructor(targetX: number, targetY: number) {
            this.originX = targetX; // The goal position (Logo shape)
            this.originY = targetY;
            this.x = Math.random() * width; // Start random
            this.y = Math.random() * height;
            this.vx = 0;
            this.vy = 0;
            this.size = Math.random() * 1.5 + 0.5; // Small dots

            // GEMINI GRADIENT COLOR MAPPING
            // Map Y position to Blue -> Red -> Yellow gradient
            const percentY = (targetY - (height/2 - 200)) / 400; // Approx height of logo
            
            if (percentY < 0.33) {
                // Top: Blue
                this.color = `rgba(59, 130, 246, ${Math.random() * 0.5 + 0.5})`; // Blue-500
            } else if (percentY < 0.66) {
                // Middle: Red/Pink
                this.color = `rgba(239, 68, 68, ${Math.random() * 0.5 + 0.5})`; // Red-500
            } else {
                // Bottom: Yellow/Amber
                this.color = `rgba(245, 158, 11, ${Math.random() * 0.5 + 0.5})`; // Amber-500
            }
        }

        update(mouse: {x: number, y: number}) {
            // Physics: Spring to origin
            const dx = this.originX - this.x;
            const dy = this.originY - this.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Mouse Interaction (Disperse)
            const mDx = mouse.x - this.x;
            const mDy = mouse.y - this.y;
            const mDist = Math.sqrt(mDx*mDx + mDy*mDy);
            let force = 0;
            
            if (mDist < 100) {
                force = (100 - mDist) / 100;
                const angle = Math.atan2(mDy, mDx);
                this.vx -= Math.cos(angle) * force * 2;
                this.vy -= Math.sin(angle) * force * 2;
            }

            // Homing force
            const speed = 0.05;
            this.vx += dx * speed * 0.05;
            this.vy += dy * speed * 0.05;

            // Friction
            this.vx *= 0.9;
            this.vy *= 0.9;

            this.x += this.vx;
            this.y += this.vy;
        }

        draw() {
            if (!ctx) return;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    let particles: Particle[] = [];
    const mouse = { x: 0, y: 0 };

    const initParticles = () => {
        initTarget();
        const pixels = tCtx!.getImageData(0, 0, width, height).data;
        particles = [];
        
        // Scan for non-transparent pixels (Gap of 4 for density)
        for (let y = 0; y < height; y += 6) {
            for (let x = 0; x < width; x += 6) {
                const alpha = pixels[(y * width + x) * 4 + 3];
                if (alpha > 0) {
                    particles.push(new Particle(x, y));
                }
            }
        }
        
        // Add some ambient background dust
        for(let i=0; i<100; i++){
             const p = new Particle(Math.random()*width, Math.random()*height);
             p.color = 'rgba(255,255,255,0.1)'; // Faint dust
             particles.push(p);
        }
    };

    const animate = () => {
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, width, height);
        
        particles.forEach(p => {
            p.update(mouse);
            p.draw();
        });
        requestAnimationFrame(animate);
    };

    // Events
    const handleResize = () => {
        width = canvas.width = window.innerWidth / 2;
        height = canvas.height = window.innerHeight;
        initParticles();
    };
    const handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    
    initParticles();
    animate();

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};

// --- MAIN PAGE ---

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
        setIsLoading(false);
        window.location.href = '/'; 
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full flex bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* LEFT SECTION (Login Form) */}
      <motion.section 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full lg:w-1/2 flex flex-col p-12 lg:p-24 relative z-10"
      >
        <header className="mb-20 flex items-center gap-4">
          <div className="text-white w-8 h-8">
            <MonolithLogo />
          </div>
          <span className="text-sm font-bold tracking-[0.2em] uppercase text-zinc-300">Yantraksh</span>
        </header>

        <main className="flex-grow flex flex-col justify-center max-w-lg">
          <h1 className="text-5xl lg:text-6xl font-medium tracking-tight leading-[1.1] mb-8 text-white">
            Solving agency. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-red-400 to-amber-400 animate-pulse">
                Automating the web.
            </span>
          </h1>
          
          <p className="text-lg text-zinc-400 leading-relaxed mb-12 font-light">
            Yantraksh is an advanced Large Action Model (LAM) designed to navigate, reason, and execute complex tasks across the digital ecosystem. 
          </p>

          <form onSubmit={handleLogin} className="flex flex-col gap-8">
            <div className="group relative">
              <label className="block text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 group-focus-within:text-blue-400 transition-colors">
                Authorized Identity
              </label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-b border-zinc-700 py-3 text-lg text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-zinc-700"
                placeholder="operator@yantraksh.ai"
              />
            </div>
            
            <div className="group relative">
              <label className="block text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 group-focus-within:text-blue-400 transition-colors">
                Access Key
              </label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border-b border-zinc-700 py-3 text-lg text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-zinc-700"
                placeholder="••••••••••••"
              />
            </div>

            <div className="pt-6 flex items-center gap-6">
              <button 
                type="submit" 
                disabled={isLoading}
                className="group relative px-8 py-4 bg-zinc-100 text-black font-bold text-sm tracking-wider uppercase rounded hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Initializing
                    </span>
                ) : (
                    <span className="relative z-10">Initialize Core</span>
                )}
                {/* Gemini Gradient Hover Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-red-500 to-amber-500 opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
              </button>
              
              <a href="#" className="text-xs font-mono text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">
                Request Access
              </a>
            </div>
          </form>
        </main>

        <footer className="mt-20 text-[10px] text-zinc-600 font-mono flex gap-6 uppercase tracking-widest">
          <span>v2.0.4-Obsidian</span>
          <span>© 2026 Cisai Research</span>
        </footer>
      </motion.section>

      {/* RIGHT SECTION: GEMINI STYLE PARTICLE SYSTEM */}
      <section className="hidden lg:block w-1/2 relative bg-[#09090b] overflow-hidden border-l border-zinc-900/50">
        
        <div className="absolute inset-0">
           <GeminiParticleSystem />
        </div>

        {/* Floating Status */}
        <div className="absolute bottom-12 right-12 text-right pointer-events-none z-20">
             <div className="text-[10px] font-mono text-blue-400 uppercase tracking-[0.3em] mb-2 animate-pulse">
                Neural Core Active
             </div>
             <div className="text-3xl font-light text-zinc-200">
                Awaiting Command
             </div>
        </div>
      </section>

    </div>
  );
}