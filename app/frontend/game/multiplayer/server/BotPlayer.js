/**
 * BotPlayer.js
 * 
 * AI player that generates random inputs to fill empty slots in BR modes.
 * Simple random behavior - moves randomly and shoots occasionally.
 */

const BOT_NAMES = [
    'BotWarrior', 'CyberGuard', 'PixelHunter', 'RetroBot',
    'NeonScout', 'GridRunner', 'ByteKnight', 'CodeFighter',
    'DungeonAI', 'MazeBot', 'WorriorBot', 'LaserBot',
    'SteelSentry', 'VaultRunner', 'MazeGhost', 'CodeCrusher'
];

class BotPlayer {
    constructor(dungeonId, playerSlot) {
        this.id = `bot-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        this.dungeonId = dungeonId;
        this.playerSlot = playerSlot;
        this.isBot = true;
        this.name = this._generateName();
        
        // Input state
        this.tickCounter = 0;
        this.currentDirection = null;
        this.directionTimer = 0;
        this.lastKeys = {};
    }
    
    _generateName() {
        return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    }
    
    /**
     * Generate input for this tick
     * Called by GameServer every tick
     */
    generateInput() {
        this.tickCounter++;
        const keys = {};
        
        // Change direction every 20-30 ticks (random for variety)
        if (this.directionTimer <= 0) {
            const directions = ['up', 'down', 'left', 'right', null];
            this.currentDirection = directions[Math.floor(Math.random() * directions.length)];
            this.directionTimer = 20 + Math.floor(Math.random() * 10); // 20-30 ticks
        }
        
        this.directionTimer--;
        
        // Apply current direction
        keys.up = this.currentDirection === 'up';
        keys.down = this.currentDirection === 'down';
        keys.left = this.currentDirection === 'left';
        keys.right = this.currentDirection === 'right';
        
        // Random shooting (20% chance per tick)
        keys.fire = Math.random() < 0.2;
        
        this.lastKeys = keys;
        return keys;
    }
    
    /**
     * Get bot info for client display
     */
    getInfo() {
        return {
            id: this.id,
            name: `[BOT] ${this.name}`,
            isBot: true,
            dungeonId: this.dungeonId,
            playerSlot: this.playerSlot
        };
    }
}

module.exports = { BotPlayer };
