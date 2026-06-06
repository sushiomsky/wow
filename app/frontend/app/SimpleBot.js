/**
 * Simple Bot Player for Wizard of Wor
 * 
 * This is a minimal, deterministic bot that proves the automation system works.
 * NOT designed to be smart - designed to be RELIABLE.
 * 
 * Strategy:
 * - Random movement (with wall avoidance if possible)
 * - Random shooting (20% chance per tick)
 * - Continuous play until death
 * 
 * Usage:
 *   const bot = new SimpleBot();
 *   bot.start();
 *   // Later: bot.stop();
 */

export class SimpleBot {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.tickRate = 50; // 20 ticks per second
        this.shootChance = 0.2; // 20% chance to shoot per tick
        this.moveChance = 0.3; // 30% chance to change direction per tick
        this.currentDirection = null;
        this.directionHoldTicks = 0;
        this.minHoldTicks = 10; // Hold direction for at least 10 ticks (~500ms)
        this.maxHoldTicks = 40; // Change direction after at most 40 ticks (~2s)
    }
    
    /**
     * Start the bot (begins playing automatically)
     */
    start() {
        if (this.isRunning) {
            console.log('[Bot] Already running');
            return;
        }
        
        console.log('[Bot] Starting...');
        this.isRunning = true;
        
        // Start bot loop
        this.intervalId = setInterval(() => this.tick(), this.tickRate);
        console.log('[Bot] Started with tick rate:', this.tickRate, 'ms');
    }
    
    /**
     * Stop the bot
     */
    stop() {
        if (!this.isRunning) return;
        
        console.log('[Bot] Stopping...');
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // Release all held keys
        if (window.swowDebug) {
            window.swowDebug.releaseAll();
        }
        
        this.currentDirection = null;
        this.directionHoldTicks = 0;
        
        console.log('[Bot] Stopped');
    }
    
    /**
     * Main bot tick (called 20x per second)
     */
    tick() {
        // Check if we should be running
        const state = window.swowDebug?.getState();
        
        if (!state || !state.ready) {
            return; // Engine not ready
        }

        if (state.state === 'gameover' || state.scene === 'gameOver') {
            console.log('[Bot] Game over detected');
            this.stop();
            return;
        }

        if (state.state === 'menu' || state.state === 'error') {
            this.stop();
            return;
        }
         
        if (state.state !== 'playing') {
            return; // Not in gameplay
        }
        
        // Bot AI logic
        this.updateMovement();
        this.updateShooting();
    }
    
    /**
     * Movement logic
     */
    updateMovement() {
        const directions = ['up', 'down', 'left', 'right'];
        
        // Check if we should change direction
        const shouldChange = 
            this.currentDirection === null || // No current direction
            this.directionHoldTicks >= this.maxHoldTicks || // Held too long
            (this.directionHoldTicks >= this.minHoldTicks && Math.random() < this.moveChance); // Random change
        
        if (shouldChange) {
            // Pick random direction
            const newDirection = directions[Math.floor(Math.random() * directions.length)];
            
            // Only change if different (or first move)
            if (newDirection !== this.currentDirection) {
                this.currentDirection = newDirection;
                this.directionHoldTicks = 0;
                
                // Press the new direction
                window.swowDebug.move(this.currentDirection);
            }
        }
        
        // Increment hold counter
        this.directionHoldTicks++;
        
        // Keep pressing current direction (to maintain movement)
        if (this.currentDirection && this.directionHoldTicks % 5 === 0) {
            window.swowDebug.move(this.currentDirection);
        }
    }
    
    /**
     * Shooting logic
     */
    updateShooting() {
        // Random shooting
        if (Math.random() < this.shootChance) {
            window.swowDebug.shoot();
        }
    }
    
    /**
     * Get bot status (for debugging)
     */
    getStatus() {
        return {
            running: this.isRunning,
            direction: this.currentDirection,
            holdTicks: this.directionHoldTicks,
            tickRate: this.tickRate,
        };
    }
}

/**
 * Global bot instance (for easy console access)
 */
if (typeof window !== 'undefined') {
    window.SimpleBot = SimpleBot;
    
    // Convenience: window.bot for quick access
    window.createBot = () => {
        if (window.bot) {
            window.bot.stop();
        }
        window.bot = new SimpleBot();
        return window.bot;
    };
}

export default SimpleBot;
