/**
 * EndlessBRQueue — Instant-join Battle Royale queue
 * 
 * Behavior:
 * - Players join instantly (no waiting)
 * - Each player gets their own dungeon
 * - Dungeon is auto-filled with a bot in slot 1
 * - Dungeon is connected to the graph (ring topology)
 * - Game starts immediately
 * 
 * This is the simplest BR mode: no matchmaking, no waiting.
 */

'use strict';

class EndlessBRQueue {
    constructor(gameServer) {
        this.gameServer = gameServer;
        this.activePlayers = new Map(); // playerId → dungeonId
        console.log('[EndlessBRQueue] Initialized');
    }
    
    /**
     * Add player to endless BR
     * Creates dungeon immediately, spawns bot partner, starts game
     */
    addPlayer(playerId, conn) {
        if (this.activePlayers.has(playerId)) {
            console.warn('[EndlessBRQueue] Player already in endless BR:', playerId);
            return;
        }
        
        console.log('[EndlessBRQueue] Player joining:', playerId);
        
        // Create new dungeon
        const dungeon = this.gameServer._createDungeon();
        dungeon.matchMode = 'endless_br';
        
        // Add real player in slot 0
        const ServerPlayer = require('./ServerPlayer').ServerPlayer;
        const player = new ServerPlayer(0, dungeon, playerId, dungeon.id);
        player.homeSlot = 0;
        conn.player = player;
        conn.dungeonId = dungeon.id;
        conn.sessionId = playerId;
        conn.mode = 'endless_br';
        dungeon.addPlayer(player);
        
        // Spawn bot in slot 1
        this.gameServer.spawnBot(dungeon.id, 1);
        
        // Track player
        this.activePlayers.set(playerId, dungeon.id);
        
        // Start game
        dungeon.startGame();
        
        // Send init to player
        this.gameServer._sendInit(conn, dungeon);
        
        console.log(`[EndlessBRQueue] Player ${playerId} started in dungeon ${dungeon.id} with bot partner`);
    }
    
    /**
     * Remove player from endless BR
     */
    removePlayer(playerId) {
        if (!this.activePlayers.has(playerId)) {
            return;
        }
        
        const dungeonId = this.activePlayers.get(playerId);
        console.log(`[EndlessBRQueue] Player ${playerId} left dungeon ${dungeonId}`);
        
        this.activePlayers.delete(playerId);
        
        // Note: Dungeon cleanup is handled by GameServer lifecycle
    }
    
    /**
     * Get queue snapshot for API
     */
    getSnapshot() {
        return {
            mode: 'endless',
            active_players: this.activePlayers.size,
            dungeons_created: this.activePlayers.size
        };
    }
}

module.exports = { EndlessBRQueue };
