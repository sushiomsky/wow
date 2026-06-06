/**
 * SitNGoQueue — Tournament-style Battle Royale queue
 * 
 * Behavior:
 * - Players queue up and wait for minimum threshold
 * - When MIN_PLAYERS reached, start countdown timer
 * - When timer expires OR MAX_PLAYERS reached, launch game
 * - All players start simultaneously in connected dungeons
 * - Fill remaining slots with bots
 * 
 * This is classic "sit and go" tournament style.
 */

'use strict';

const MIN_PLAYERS = 2;  // Minimum to start countdown
const MAX_PLAYERS = 8;  // Maximum before instant start
const COUNTDOWN_MS = 15000;  // 15 seconds after MIN_PLAYERS
const MATCH_STARTING_EVENT = 'match_starting';
const CONFIG = Object.freeze({
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    countdownMs: COUNTDOWN_MS,
});

class SitNGoQueue {
    constructor(gameServer) {
        this.gameServer = gameServer;
        this.waitingPlayers = new Map(); // playerId → { conn, joinedAt }
        this.countdownTimer = null;
        this.countdownStartedAt = null;
        this.metrics = {
            launches: 0,
            launch_failures: 0,
            players_launched: 0,
            total_wait_ms: 0,
        };
        console.log('[SitNGoQueue] Initialized');
    }
    
    /**
     * Add player to sit-n-go queue
     */
    addPlayer(playerId, conn) {
        if (this.waitingPlayers.has(playerId)) {
            console.warn('[SitNGoQueue] Player already in queue:', playerId);
            return;
        }
        
        console.log('[SitNGoQueue] Player joining queue:', playerId);
        
        this.waitingPlayers.set(playerId, {
            conn,
            joinedAt: Date.now()
        });
        
        // Send queue status
        this._broadcastQueueStatus();
        
        // Check if we should start countdown
        if (this.waitingPlayers.size >= CONFIG.minPlayers && !this.countdownTimer) {
            this._startCountdown();
        }
        
        // Check if we hit max players (instant start)
        if (this.waitingPlayers.size >= CONFIG.maxPlayers) {
            console.log('[SitNGoQueue] Max players reached, starting immediately');
            this._launchGame();
        }
    }
    
    /**
     * Remove player from queue
     */
    removePlayer(playerId) {
        if (!this.waitingPlayers.has(playerId)) {
            return;
        }
        
        console.log('[SitNGoQueue] Player left queue:', playerId);
        this.waitingPlayers.delete(playerId);
        
        // Cancel countdown if we drop below minimum
        if (this.waitingPlayers.size < CONFIG.minPlayers && this.countdownTimer) {
            this._cancelCountdown();
        }
        
        this._broadcastQueueStatus();
    }
    
    /**
     * Start countdown timer
     */
    _startCountdown() {
        if (this.countdownTimer) return;
        
        console.log(`[SitNGoQueue] Starting countdown: ${CONFIG.countdownMs}ms`);
        this.countdownStartedAt = Date.now();
        
        this.countdownTimer = setTimeout(() => {
            this._launchGame();
        }, CONFIG.countdownMs);
        
        this._broadcastQueueStatus();
    }
    
    /**
     * Cancel countdown
     */
    _cancelCountdown() {
        if (!this.countdownTimer) return;
        
        console.log('[SitNGoQueue] Countdown cancelled');
        clearTimeout(this.countdownTimer);
        this.countdownTimer = null;
        this.countdownStartedAt = null;
        
        this._broadcastQueueStatus();
    }
    
    /**
     * Launch the game with all queued players
     */
    _launchGame() {
        if (this.waitingPlayers.size === 0) {
            console.warn('[SitNGoQueue] Cannot launch game: no players');
            this.metrics.launch_failures += 1;
            return;
        }
        
        console.log(`[SitNGoQueue] Launching game with ${this.waitingPlayers.size} players`);
        
        // Cancel countdown
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
            this.countdownStartedAt = null;
        }
        
        const ServerPlayer = require('./ServerPlayer').ServerPlayer;
        const players = Array.from(this.waitingPlayers.entries());

        this._notifyMatchStarting();
        
        // Create dungeon for each player
        players.forEach(([playerId, { conn }]) => {
            if (!this._isConnectionOpen(conn)) {
                console.log(`[SitNGoQueue] Skipping disconnected player before init: ${playerId}`);
                return;
            }
            const dungeon = this.gameServer._createDungeon();
            dungeon.matchMode = 'sitngo_br';
            
            // Add real player in slot 0
            const player = new ServerPlayer(0, dungeon, playerId, dungeon.id);
            player.homeSlot = 0;
            conn.player = player;
            conn.dungeonId = dungeon.id;
            conn.sessionId = playerId;
            conn.mode = 'sitngo_br';
            dungeon.addPlayer(player);
            
            // Spawn bot in slot 1
            this.gameServer.spawnBot(dungeon.id, 1);
            
            // Start game
            dungeon.startGame();

            if (!this._isConnectionOpen(conn)) {
                console.log(`[SitNGoQueue] Player disconnected after match_starting: ${playerId}`);
                return;
            }
            
            // Send init
            this.gameServer._sendInit(conn, dungeon);
            
            console.log(`[SitNGoQueue] Player ${playerId} → dungeon ${dungeon.id}`);
        });
        
        const now = Date.now();
        for (const [, { joinedAt }] of players) {
            this.metrics.total_wait_ms += Math.max(0, now - joinedAt);
        }
        this.metrics.launches += 1;
        this.metrics.players_launched += players.length;

        // Clear queue
        this.waitingPlayers.clear();
        
        console.log('[SitNGoQueue] Game launched successfully');
    }

    _notifyMatchStarting() {
        const payload = {
            type: MATCH_STARTING_EVENT,
            message: 'Match found, launching…',
            expires_ms: 4000,
        };

        for (const { conn } of this.waitingPlayers.values()) {
            this.gameServer._send(conn.ws, payload);
        }
    }

    _sendMatchStarting(conn) {
        this.gameServer._send(conn.ws, {
            type: MATCH_STARTING_EVENT,
            message: 'Match found, launching…',
            expires_ms: 4000,
        });
    }

    _isConnectionOpen(conn) {
        return conn?.ws?.readyState === 1;
    }

    launchWithBots() {
        if (this.waitingPlayers.size === 0) return false;
        console.log('[SitNGoQueue] Launching queued players with bot fill');
        this._launchGame();
        return true;
    }
    
    /**
     * Broadcast queue status to all waiting players
     */
    _broadcastQueueStatus() {
        const status = {
            type: 'sitngo_queue_status',
            players_waiting: this.waitingPlayers.size,
            min_players: CONFIG.minPlayers,
            max_players: CONFIG.maxPlayers,
            countdown_active: !!this.countdownTimer,
            countdown_remaining: this.countdownTimer ? 
                Math.max(0, CONFIG.countdownMs - (Date.now() - this.countdownStartedAt)) : null
        };
        
        for (const { conn } of this.waitingPlayers.values()) {
            this.gameServer._send(conn.ws, status);
        }
    }
    
    /**
     * Get queue snapshot for API
     */
    getSnapshot() {
        const avgWaitMs = this.metrics.players_launched > 0
            ? Math.round(this.metrics.total_wait_ms / this.metrics.players_launched)
            : 0;
        const successRate = (this.metrics.launches + this.metrics.launch_failures) > 0
            ? Math.round((this.metrics.launches / (this.metrics.launches + this.metrics.launch_failures)) * 100)
            : 0;
        return {
            mode: 'sitngo',
            players_waiting: this.waitingPlayers.size,
            countdown_active: !!this.countdownTimer,
            countdown_remaining: this.countdownTimer ? 
                Math.max(0, CONFIG.countdownMs - (Date.now() - this.countdownStartedAt)) : null,
            metrics: {
                launches: this.metrics.launches,
                launch_failures: this.metrics.launch_failures,
                players_launched: this.metrics.players_launched,
                total_wait_ms: this.metrics.total_wait_ms,
                avg_wait_ms: avgWaitMs,
                launch_success_rate_pct: successRate,
            },
        };
    }

    getWaitingCount() {
        return this.waitingPlayers.size;
    }
}

module.exports = { SitNGoQueue };
