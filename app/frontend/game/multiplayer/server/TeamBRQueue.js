/**
 * TeamBRQueue — Team-based Battle Royale queue
 * 
 * Behavior:
 * - Players queue individually or as pre-formed teams
 * - System creates balanced teams (2 players per team)
 * - Teams share a dungeon (slot 0 + slot 1)
 * - Dungeons are connected via graph
 * - Fill incomplete teams with bots
 * 
 * Modes:
 * - team-endless: Instant start, fill with bots
 * - team-sitngo: Wait for min teams, then launch
 */

'use strict';

const MIN_TEAMS_SITNGO = 2;
const COUNTDOWN_MS = 20000;  // 20 seconds for team mode
const MATCH_STARTING_EVENT = 'match_starting';
const CONFIG = Object.freeze({
    minTeamsSitNGo: MIN_TEAMS_SITNGO,
    countdownMs: COUNTDOWN_MS,
});

class TeamBRQueue {
    constructor(gameServer, mode = 'team-endless') {
        this.gameServer = gameServer;
        this.mode = mode; // 'team-endless' or 'team-sitngo'
        this.waitingPlayers = new Map(); // playerId → { conn, joinedAt }
        this.teams = []; // Array of [player1Id, player2Id]
        this.countdownTimer = null;
        this.countdownStartedAt = null;
        this.metrics = {
            launches: 0,
            launch_failures: 0,
            players_launched: 0,
            total_wait_ms: 0,
        };
        console.log(`[TeamBRQueue] Initialized (${mode})`);
    }
    
    /**
     * Add player to team queue
     */
    addPlayer(playerId, conn) {
        if (this.waitingPlayers.has(playerId)) {
            console.warn('[TeamBRQueue] Player already in queue:', playerId);
            return;
        }
        
        console.log(`[TeamBRQueue] Player joining (${this.mode}):`, playerId);
        
        this.waitingPlayers.set(playerId, {
            conn,
            joinedAt: Date.now()
        });
        
        if (this.mode === 'team-endless') {
            // Instant start: create team immediately
            this._createTeamInstant(playerId, conn);
        } else {
            // Sit-n-go: queue and wait
            this._handleSitNGoQueue();
        }
    }
    
    /**
     * Remove player from queue
     */
    removePlayer(playerId) {
        if (!this.waitingPlayers.has(playerId)) {
            return;
        }
        
        console.log('[TeamBRQueue] Player left queue:', playerId);
        this.waitingPlayers.delete(playerId);
        
        if (this.mode === 'team-sitngo') {
            this._handleSitNGoQueue();
        }
    }
    
    /**
     * Create team instantly (endless mode)
     */
    _createTeamInstant(playerId, conn) {
        const ServerPlayer = require('./ServerPlayer').ServerPlayer;
        const queued = this.waitingPlayers.get(playerId);
        
        // Create dungeon for this team
        const dungeon = this.gameServer._createDungeon();
        dungeon.matchMode = 'team_endless_br';
        
        // Add real player in slot 0
        const player = new ServerPlayer(0, dungeon, playerId, dungeon.id);
        player.homeSlot = 0;
        conn.player = player;
        conn.dungeonId = dungeon.id;
        conn.sessionId = playerId;
        conn.mode = 'team_endless_br';
        dungeon.addPlayer(player);
        
        // Fill slot 1 with bot teammate
        this.gameServer.spawnBot(dungeon.id, 1);
        
        // Start game
        dungeon.startGame();
        
        // Send init
        this.gameServer._sendInit(conn, dungeon);
        
        console.log(`[TeamBRQueue] Team created: player ${playerId} + bot in dungeon ${dungeon.id}`);

        if (queued?.joinedAt) {
            this.metrics.total_wait_ms += Math.max(0, Date.now() - queued.joinedAt);
        }
        this.metrics.launches += 1;
        this.metrics.players_launched += 1;
        
        // Remove from waiting
        this.waitingPlayers.delete(playerId);
    }
    
    /**
     * Handle sit-n-go team queue
     */
    _handleSitNGoQueue() {
        const waiting = this.waitingPlayers.size;
        
        // Check if we can form teams (need at least 2 players per team, min 2 teams)
        const minPlayers = CONFIG.minTeamsSitNGo * 2;
        
        if (waiting >= minPlayers && !this.countdownTimer) {
            this._startCountdown();
        }
        
        if (waiting < minPlayers && this.countdownTimer) {
            this._cancelCountdown();
        }
        
        this._broadcastQueueStatus();
    }
    
    /**
     * Start countdown
     */
    _startCountdown() {
        if (this.countdownTimer) return;
        
        console.log(`[TeamBRQueue] Starting countdown: ${CONFIG.countdownMs}ms`);
        this.countdownStartedAt = Date.now();
        
        this.countdownTimer = setTimeout(() => {
            this._launchTeamGame();
        }, CONFIG.countdownMs);
        
        this._broadcastQueueStatus();
    }
    
    /**
     * Cancel countdown
     */
    _cancelCountdown() {
        if (!this.countdownTimer) return;
        
        console.log('[TeamBRQueue] Countdown cancelled');
        clearTimeout(this.countdownTimer);
        this.countdownTimer = null;
        this.countdownStartedAt = null;
        
        this._broadcastQueueStatus();
    }
    
    /**
     * Launch team game
     */
    _launchTeamGame() {
        const players = Array.from(this.waitingPlayers.entries());
        
        if (players.length < CONFIG.minTeamsSitNGo * 2) {
            console.warn('[TeamBRQueue] Not enough players to launch');
            this.metrics.launch_failures += 1;
            return;
        }
        
        console.log(`[TeamBRQueue] Launching team game with ${players.length} players`);
        
        // Cancel countdown
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
            this.countdownStartedAt = null;
        }
        
        const ServerPlayer = require('./ServerPlayer').ServerPlayer;
        this._notifyMatchStarting();
        
        // Form teams of 2
        for (let i = 0; i < players.length; i += 2) {
            const [player1Id, { conn: conn1 }] = players[i];
            const player2Data = players[i + 1];
            if (!this._isConnectionOpen(conn1)) {
                console.log(`[TeamBRQueue] Skipping disconnected player before init: ${player1Id}`);
                continue;
            }
            
            // Create dungeon for this team
            const dungeon = this.gameServer._createDungeon();
            dungeon.matchMode = 'team_sitngo_br';
            
            // Add player 1 (slot 0)
            const p1 = new ServerPlayer(0, dungeon, player1Id, dungeon.id);
            p1.homeSlot = 0;
            conn1.player = p1;
            conn1.dungeonId = dungeon.id;
            conn1.sessionId = player1Id;
            conn1.mode = 'team_sitngo_br';
            dungeon.addPlayer(p1);
            
            if (player2Data) {
                // Add player 2 (slot 1)
                const [player2Id, { conn: conn2 }] = player2Data;
                const p2 = new ServerPlayer(1, dungeon, player2Id, dungeon.id);
                p2.homeSlot = 1;
                conn2.player = p2;
                conn2.dungeonId = dungeon.id;
                conn2.sessionId = player1Id; // Same session as teammate
                conn2.mode = 'team_sitngo_br';
                dungeon.addPlayer(p2);
                
                console.log(`[TeamBRQueue] Team: ${player1Id} + ${player2Id} → dungeon ${dungeon.id}`);
            } else {
                // Fill with bot
                this.gameServer.spawnBot(dungeon.id, 1);
                console.log(`[TeamBRQueue] Team: ${player1Id} + bot → dungeon ${dungeon.id}`);
            }
            
            // Start game
            dungeon.startGame();
            
            // Send init to both players
            if (this._isConnectionOpen(conn1)) {
                this.gameServer._sendInit(conn1, dungeon);
            } else {
                console.log(`[TeamBRQueue] Player disconnected after match_starting: ${player1Id}`);
            }
            if (player2Data) {
                const conn2 = player2Data[1].conn;
                if (this._isConnectionOpen(conn2)) {
                    this.gameServer._sendInit(conn2, dungeon);
                } else {
                    console.log(`[TeamBRQueue] Skipping disconnected teammate before init: ${player2Data[0]}`);
                }
            }
        }
        
        const now = Date.now();
        for (const [, { joinedAt }] of players) {
            this.metrics.total_wait_ms += Math.max(0, now - joinedAt);
        }
        this.metrics.launches += 1;
        this.metrics.players_launched += players.length;

        // Clear queue
        this.waitingPlayers.clear();
        
        console.log('[TeamBRQueue] Team game launched');
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
    
    /**
     * Broadcast queue status
     */
    _broadcastQueueStatus() {
        const status = {
            type: 'team_queue_status',
            mode: this.mode,
            players_waiting: this.waitingPlayers.size,
            teams_possible: Math.floor(this.waitingPlayers.size / 2),
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
            mode: this.mode,
            players_waiting: this.waitingPlayers.size,
            teams_possible: Math.floor(this.waitingPlayers.size / 2),
            countdown_active: !!this.countdownTimer,
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
}

module.exports = { TeamBRQueue };
