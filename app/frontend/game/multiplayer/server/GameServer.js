/**
 * GameServer — WebSocket server for private 2-player rooms.
 *
 * NOW WITH CONNECTED DUNGEONS: Dungeons can be linked via tunnels
 * for battle royale mode. Players can travel between dungeons.
 * 
 * NOW WITH BR QUEUES: Matchmaking for Endless, Sit-n-Go, and Team modes.
 */
'use strict';

const WebSocket = require('ws');
const { DungeonInstance, STATE } = require('./DungeonInstance');
const { ServerPlayer } = require('./ServerPlayer');
const { DungeonGraph } = require('./DungeonGraph');
const { BotPlayer } = require('./BotPlayer');
const { EndlessBRQueue } = require('./EndlessBRQueue');
const { SitNGoQueue } = require('./SitNGoQueue');
const { TeamBRQueue } = require('./TeamBRQueue');

const SCAN_FPS = 50;
const TICK_MS = 1000 / SCAN_FPS;
const SNAPSHOT_HZ = Number(process.env.SWOW_SNAPSHOT_HZ || 20);
const SNAPSHOT_EVERY_TICKS = Math.max(1, Math.round(SCAN_FPS / SNAPSHOT_HZ));
const BOT_SEED_INITIAL_DELAY_MS = 15 * 1000;
const BOT_SEED_INTERVAL_MS = 60 * 1000;
const TARGET_DUNGEONS_PER_MODE = 4;

let nextPlayerId = 1;

const NAME_ADJECTIVES = ['Neon', 'Cosmic', 'Pixel', 'Turbo', 'Arcade', 'Lucky', 'Brave', 'Mystic', 'Rapid', 'Golden', 'Shadow', 'Electric'];
const NAME_NOUNS = ['Wizard', 'Worrior', 'Dungeoneer', 'Blaster', 'Goblin', 'Hunter', 'Runner', 'Phantom', 'Comet', 'Mage', 'Ranger', 'Spark'];

function makeRandomUsername(playerId) {
    const adj = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
    const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
    return `${adj}${noun}${String(playerId).padStart(2, '0')}`;
}

class GameServer {
    constructor(httpServer) {
        this.wss = new WebSocket.Server({ server: httpServer });
        this.wss.on('error', (err) => {
            console.error('[GameServer] WebSocket server error:', err.message);
        });

        this.connections = new Map();
        this.dungeons = new Map();
        this.privatePairLobbies = new Map();
        
        // NEW: Dungeon graph for battle royale mode
        this.dungeonGraph = new DungeonGraph();
        this.battleRoyaleMode = process.env.BATTLE_ROYALE === 'true'; // Feature flag
        
        // NEW: Bot management
        this.bots = new Map(); // botId -> BotPlayer instance
        
        // NEW: Spectator management
        this.spectators = new Map(); // playerId -> { dungeonId, ws }
        
        // NEW: BR Queue management
        this.endlessBRQueue = new EndlessBRQueue(this);
        this.sitNGoQueue = new SitNGoQueue(this);
        this.teamEndlessQueue = new TeamBRQueue(this, 'team-endless');
        this.teamSitNGoQueue = new TeamBRQueue(this, 'team-sitngo');
        this._backgroundTimers = [];

        this.wss.on('connection', (ws) => this._onConnect(ws));
        this._loop = setInterval(() => this._tick(), TICK_MS);
        if (process.env.SWOW_SEED_BOTS === 'true') this._scheduleBackgroundBattleRoyaleBots();
        console.log(`[GameServer] started at ${TICK_MS}ms/tick`);
        console.log(`[GameServer] Battle Royale mode: ${this.battleRoyaleMode ? 'ENABLED' : 'DISABLED'}`);
        console.log('[GameServer] BR Queues initialized: Endless, Sit-n-Go, Team Endless, Team Sit-n-Go');
    }

    // ─── Connection Lifecycle ─────────────────────────────────────────────────

    _onConnect(ws) {
        try {
            const playerId = String(nextPlayerId++);
            const conn = { ws, player: null, dungeonId: null, inputs: {}, inputSeq: 0, lastInputAt: 0, sessionId: null, username: makeRandomUsername(playerId) };
            this.connections.set(playerId, conn);

            ws.on('message', (msg) => {
                try { this._onMessage(playerId, JSON.parse(msg)); } catch (e) { console.error(`[GameServer] Message error for player ${playerId}:`, e.message); }
            });
            ws.on('close', () => this._onDisconnect(playerId));
            ws.on('error', (err) => {
                console.error(`[GameServer] WebSocket error for player ${playerId}:`, err.message);
                ws.terminate();
            });

            // Send player their assigned id so they know who they are
            this._send(ws, { type: 'connected', playerId, username: conn.username });
            console.log(`[GameServer] player ${playerId} connected`);
        } catch (e) {
            console.error('[GameServer] Error in _onConnect:', e.message, e.stack);
            ws.terminate();
        }
    }

    _leaveCurrentGame(conn) {
        if (!conn.player) return;
        const dungeon = this.dungeons.get(conn.dungeonId);
        if (dungeon) {
            dungeon.removePlayer(conn.player);
            this._checkDungeonEmpty(dungeon);
        }
        conn.player = null;
        conn.dungeonId = null;
        conn.mode = null;
    }

    _onDisconnect(playerId) {
        const conn = this.connections.get(playerId);
        if (!conn) return;
        
        // Remove spectator if exists
        if (this.spectators.has(playerId)) {
            this.spectators.delete(playerId);
            console.log(`[GameServer] spectator ${playerId} disconnected`);
        }
        
        // Remove from BR queues if waiting
        this.endlessBRQueue.removePlayer(playerId);
        this.sitNGoQueue.removePlayer(playerId);
        this.teamEndlessQueue.removePlayer(playerId);
        this.teamSitNGoQueue.removePlayer(playerId);
        
        this._leaveCurrentGame(conn);
        
        for (const [code, lobby] of this.privatePairLobbies.entries()) {
            if (lobby.hostId === playerId) {
                if (lobby.timeoutId) clearTimeout(lobby.timeoutId);
                this.privatePairLobbies.delete(code);
                this._broadcastOpenGames();
            }
        }
        this.connections.delete(playerId);
        console.log(`[GameServer] player ${playerId} disconnected`);
    }

    _onMessage(playerId, msg) {
        const conn = this.connections.get(playerId);
        if (!conn) return;

        switch (msg.type) {
            case 'join_pair':
                this._createPrivatePair(playerId, conn);
                break;
            case 'join_private_pair':
                this._joinPrivatePair(playerId, conn, msg.code);
                break;
            case 'refresh_open_games':
                this._sendOpenGames(conn);
                break;
            case 'spectate':
                this._spectateGame(playerId, conn, msg.dungeonId);
                break;
            case 'join_endless_br':
                this._joinEndlessBR(playerId, conn);
                break;
            case 'join_sitngo_br':
                this._joinSitNGoBR(playerId, conn);
                break;
            case 'join_team_endless_br':
                this._joinTeamEndlessBR(playerId, conn);
                break;
            case 'join_team_sitngo_br':
                this._joinTeamSitNGoBR(playerId, conn);
                break;
            case 'input':
                conn.inputs = msg.keys || {};
                conn.inputSeq = Number.isFinite(Number(msg.seq)) ? Number(msg.seq) : conn.inputSeq;
                conn.lastInputAt = Date.now();
                break;
        }
    }
    
    // ─── BR Queue Handlers ────────────────────────────────────────────────────
    
    _joinEndlessBR(playerId, conn) {
        console.log('[GameServer] Player requesting endless BR:', playerId);
        this._leaveCurrentGame(conn);
        this.endlessBRQueue.addPlayer(playerId, conn);
    }
    
    _joinSitNGoBR(playerId, conn) {
        console.log('[GameServer] Player requesting sit-n-go BR:', playerId);
        this._leaveCurrentGame(conn);
        this.sitNGoQueue.addPlayer(playerId, conn);
    }
    
    _joinTeamEndlessBR(playerId, conn) {
        console.log('[GameServer] Player requesting team endless BR:', playerId);
        this._leaveCurrentGame(conn);
        this.teamEndlessQueue.addPlayer(playerId, conn);
    }
    
    _joinTeamSitNGoBR(playerId, conn) {
        console.log('[GameServer] Player requesting team sit-n-go BR:', playerId);
        this._leaveCurrentGame(conn);
        this.teamSitNGoQueue.addPlayer(playerId, conn);
    }

    // ─── Room Management ──────────────────────────────────────────────────────

    _createPrivatePair(playerId, conn) {
        this._leaveCurrentGame(conn);
        const dungeon = this._createDungeon();
        dungeon.matchMode = 'classic_private_pair';
        const player = new ServerPlayer(0, dungeon, playerId, dungeon.id);
        player.homeSlot = 0;
        conn.player = player;
        conn.dungeonId = dungeon.id;
        conn.sessionId = playerId;
        conn.mode = 'classic_private_pair';
        dungeon.addPlayer(player);

        const code = this._generatePrivateCode();
        
        const timeoutId = setTimeout(() => {
            const lobby = this.privatePairLobbies.get(code);
            if (lobby && lobby.hostConn) {
                this._send(lobby.hostConn.ws, { type: 'join_error', message: 'Room timed out. Please create a new one.' });
                this.privatePairLobbies.delete(code);
                this.onDungeonDestroyed(dungeon.id);
                this._broadcastOpenGames();
            }
        }, 5 * 60 * 1000); // 5 minutes

        this.privatePairLobbies.set(code, { 
            hostConn: conn, 
            hostId: playerId, 
            hostName: conn.username, 
            dungeon, 
            createdAt: Date.now(),
            timeoutId
        });
        const joinUrl = `/?room=${encodeURIComponent(code)}`;
        this._send(conn.ws, { type: 'private_pair_created', code, joinUrl, username: conn.username });
        this._send(conn.ws, { type: 'waiting_for_partner' });
        this._broadcastOpenGames();
        console.log(`[GameServer] private pair host ${playerId} code=${code}`);
    }

    _joinPrivatePair(playerId, conn, rawCode) {
        this._leaveCurrentGame(conn);
        const code = (rawCode || '').toString().trim().toUpperCase();
        const lobby = this.privatePairLobbies.get(code);
        if (!lobby || lobby.hostId === playerId) {
            this._send(conn.ws, { type: 'join_error', message: 'Invalid or expired private link.' });
            return;
        }
        if (lobby.timeoutId) {
            clearTimeout(lobby.timeoutId);
        }
        this.privatePairLobbies.delete(code);
        const sharedDungeon = lobby.dungeon;
        if (!sharedDungeon || sharedDungeon.lifecycleState === STATE.DESTROYED) {
            this._broadcastOpenGames();
            this._send(conn.ws, { type: 'join_error', message: 'Private session is no longer available.' });
            return;
        }
        if (sharedDungeon.players[1] && sharedDungeon.players[1].id !== null) {
            this._broadcastOpenGames();
            this._send(conn.ws, { type: 'join_error', message: 'Private session is already full.' });
            return;
        }
        const player2 = new ServerPlayer(1, sharedDungeon, playerId, sharedDungeon.id);
        player2.homeSlot = 1;
        conn.player = player2;
        conn.dungeonId = sharedDungeon.id;
        conn.sessionId = lobby.hostId;
        conn.mode = 'classic_private_pair';
        sharedDungeon.addPlayer(player2);

        sharedDungeon.startGame();
        this._sendInit(lobby.hostConn, sharedDungeon);
        this._sendInit(conn, sharedDungeon);
        this._broadcastOpenGames();
        console.log(`[GameServer] private pair joined ${lobby.hostId} + ${playerId} code=${code}`);
    }
    
    // ─── Spectator Mode ───────────────────────────────────────────────────────
    
    _spectateGame(playerId, conn, dungeonId) {
        const dungeon = this.dungeons.get(dungeonId);
        if (!dungeon) {
            this._send(conn.ws, { type: 'spectate_error', message: 'Game not found' });
            return;
        }
        
        // Register as spectator
        this.spectators.set(playerId, { dungeonId, ws: conn.ws });
        
        // Send initial state
        const state = dungeon.exportState();
        this._send(conn.ws, {
            type: 'spectate_init',
            dungeonId,
            state
        });
        
        console.log(`[GameServer] player ${playerId} spectating dungeon ${dungeonId}`);
    }

    // ─── Dungeon Management ───────────────────────────────────────────────────

    _createDungeon() {
        const d = new DungeonInstance(this);
        this.dungeons.set(d.id, d);
        
        // NEW: Add to dungeon graph if battle royale mode
        if (this.battleRoyaleMode) {
            this.dungeonGraph.addDungeon(d.id);
            
            // Auto-connect to existing dungeons (ring topology)
            const connected = this.dungeonGraph.autoConnect(d.id, 2, 'ring');
            
            // Create tunnel links for connected dungeons
            connected.forEach((targetId, index) => {
                const side = index === 0 ? 'right' : 'left';
                const entrySide = side === 'right' ? 'left' : 'right';
                
                // Link this dungeon to target
                if (side === 'right') {
                    d.rightTunnelTarget = { dungeonId: targetId, entrySide };
                } else {
                    d.leftTunnelTarget = { dungeonId: targetId, entrySide };
                }
                
                // Link target back to this dungeon
                const targetDungeon = this.dungeons.get(targetId);
                if (targetDungeon) {
                    if (entrySide === 'right') {
                        targetDungeon.rightTunnelTarget = { dungeonId: d.id, entrySide: side };
                    } else {
                        targetDungeon.leftTunnelTarget = { dungeonId: d.id, entrySide: side };
                    }
                }
                
                console.log(`[GameServer] Linked dungeon ${d.id} (${side}) ←→ ${targetId} (${entrySide})`);
            });
            
            // Log graph stats
            const stats = this.dungeonGraph.getStats();
            console.log(`[GameServer] Graph: ${stats.dungeonCount} dungeons, ${stats.uniqueConnections} connections`);
        }
        
        return d;
    }

    _tickDungeon(dungeon) {
        // Do not tick classic private pair dungeons if waiting for the second player
        if (dungeon.matchMode === 'classic_private_pair' && (!dungeon.players[1] || dungeon.players[1].id === null)) {
            dungeon.sounds = []; // Clear any queued sounds
            return false;
        }
        return true;
    }

    _checkDungeonEmpty(dungeon) {
        const hasRealPlayers = dungeon.players.some(p => p.id !== null);
        if (!hasRealPlayers && dungeon.lifecycleState !== STATE.DESTROYED) {
            this._removePrivateLobbyByDungeonId(dungeon.id);
            this.onDungeonDestroyed(dungeon.id);
        }
    }

    onDungeonDestroyed(dungeonId) {
        this.removeBotsFromDungeon(dungeonId);
        this.dungeons.delete(dungeonId);
        
        // NEW: Remove from graph if battle royale mode
        if (this.battleRoyaleMode) {
            this.dungeonGraph.removeDungeon(dungeonId);
        }
        this._clearTunnelTargetsToDungeon(dungeonId);
        
        console.log(`[GameServer] dungeon ${dungeonId} destroyed`);
    }

    _clearTunnelTargetsToDungeon(dungeonId) {
        for (const dungeon of this.dungeons.values()) {
            if (dungeon.leftTunnelTarget?.dungeonId === dungeonId) dungeon.leftTunnelTarget = null;
            if (dungeon.rightTunnelTarget?.dungeonId === dungeonId) dungeon.rightTunnelTarget = null;
        }
    }

    isDungeonEntryBlocked(targetDungeonId, sourceDungeonId = null) {
        const target = this.dungeons.get(targetDungeonId);
        if (!target) return true;
        // Collapse rule: tunnels from a collapsing dungeon remain usable outward,
        // but players outside may not enter the collapsing dungeon.
        return target.lifecycleState === STATE.COLLAPSING && target.id !== sourceDungeonId;
    }

    applyCollapseTimeoutPenalty(collapsingDungeon, player) {
        if (!player || !player.id || player.homeDungeonId === collapsingDungeon.id || player.status === 'out') return;
        player.lives = Math.max(0, (player.lives || 0) - 1);
        if (player.lives <= 0) {
            player.status = 'out';
            this.handlePlayerFinalDeath(player, collapsingDungeon);
            console.log(`[GameServer] collapse timeout eliminated player ${player.id}`);
            return;
        }
        collapsingDungeon.removePlayer(player);
        player.status = 'wait';
        this.respawnPlayerInHome(player);
    }

    handlePlayerFinalDeath(player, sourceDungeon = null) {
        if (!player || !player.id) return;
        const homeDungeon = this.dungeons.get(player.homeDungeonId);
        if (sourceDungeon && sourceDungeon.id !== player.homeDungeonId) {
            sourceDungeon.removePlayer(player);
        }

        const conn = this.connections.get(player.id);
        if (conn) {
            conn.player = player;
            conn.dungeonId = homeDungeon && homeDungeon.lifecycleState !== STATE.DESTROYED ? homeDungeon.id : null;
        }

        if (!homeDungeon || homeDungeon.lifecycleState === STATE.DESTROYED) {
            console.log(`[GameServer] player ${player.id} home dungeon gone — eliminated`);
            return;
        }
        homeDungeon.triggerOwnerEliminated?.(player);
    }

    /**
     * Send match_end message to eliminated players with their final stats.
     * Called by DungeonInstance._checkLifecycle() when home players are eliminated.
     */
    notifyPlayersEliminated(players, dungeon) {
        const duration = Date.now() - new Date(dungeon.createdAt).getTime();
        for (const player of players) {
            if (!player.id) continue;
            // Skip bots
            if (this.bots.has(player.id)) continue;
            const conn = this.connections.get(player.id);
            if (!conn) continue;
            this._send(conn.ws, {
                type: 'match_end',
                stats: {
                    score: player.score,
                    level: dungeon.level,
                    matchMode: dungeon.matchMode,
                    dungeonId: dungeon.id,
                    duration,
                },
            });
        }
    }

    /**
     * Transfer a visiting player back to their home dungeon after dying abroad.
     * Called by DungeonInstance.respawnPlayer() for non-home players.
     */
    respawnPlayerInHome(player) {
        const homeDungeon = this.dungeons.get(player.homeDungeonId);
        if (!homeDungeon || homeDungeon.lifecycleState === STATE.DESTROYED) {
            // Home dungeon already collapsed — player is eliminated
            console.log(`[GameServer] player ${player.id} home dungeon gone — eliminated`);
            return;
        }
        const slot = this._findAvailableSlot(homeDungeon);
        if (slot === null) {
            console.warn(`[GameServer] player ${player.id} home dungeon full`);
            return;
        }
        player.num = slot;
        homeDungeon.addPlayer(player);

        // Update connection to point at home dungeon
        const conn = this.connections.get(player.id);
        if (conn) {
            conn.dungeonId = homeDungeon.id;
            this._sendInit(conn, homeDungeon);
        }
        player.goToStartPosition();
    }
    
    // ─── Cross-Dungeon Transfer ───────────────────────────────────────────────
    
    /**
     * Transfer a player from one dungeon to another via tunnel
     * Called by DungeonInstance.tunnelTransfer()
     * 
     * @param {ServerPlayer} player - The player to transfer
     * @param {DungeonInstance} sourceDungeon - Current dungeon
     * @param {string} targetDungeonId - Destination dungeon ID
     * @param {string} entrySide - 'left' or 'right' (where player enters)
     */
    transferPlayerToDungeon(player, sourceDungeon, targetDungeonId, entrySide) {
        console.log(`[Transfer] Player ${player.id} from ${sourceDungeon.id} → ${targetDungeonId} (${entrySide})`);
        
        // Get target dungeon
        const targetDungeon = this.dungeons.get(targetDungeonId);
        if (!targetDungeon) {
            console.error(`[Transfer] Target dungeon ${targetDungeonId} not found`);
            return false;
        }
        
        // Real BR players may enter a dungeon that was auto-filled with a bot.
        // Evict one bot before giving up so tunnel travel never dead-ends on filler AI.
        const availableSlot = this._findAvailableSlot(targetDungeon) ?? this._releaseBotSlot(targetDungeon);
        if (availableSlot === null) {
            console.warn(`[Transfer] Target dungeon ${targetDungeonId} is full`);
            return false;
        }
        
        // Save player state
        const savedState = {
            score: player.score,
            lives: player.lives,
            status: player.status,
            // Don't save position - spawn at tunnel entrance
        };
        
        // Get connection for this player
        const conn = this.connections.get(player.id);
        if (!conn) {
            console.error(`[Transfer] No connection found for player ${player.id}`);
            return false;
        }
        
        // Remove player from source dungeon
        sourceDungeon.removePlayer(player);
        
        // Broadcast to source dungeon that player left
        this._broadcastToDungeon(sourceDungeon, {
            type: 'player_left_via_tunnel',
            playerId: player.id,
            targetDungeonId: targetDungeonId
        }, player.id);
        
        // Create new player in target dungeon while preserving immutable home
        // identity.  Respawns must still go back to the original home dungeon
        // even after visiting another player's dungeon through a tunnel.
        const newPlayer = new ServerPlayer(availableSlot, targetDungeon, player.id, player.homeDungeonId);
        newPlayer.homeSlot = player.homeSlot ?? player.num;
        newPlayer._homeSlot = player._homeSlot ?? player.homeSlot ?? player.num;
        newPlayer.score = savedState.score;
        newPlayer.lives = savedState.lives;
        newPlayer.status = savedState.status;
        
        // Spawn at tunnel entrance position
        if (entrySide === 'right') {
            newPlayer.d = 'right';
            newPlayer.col = 1;
            newPlayer.x = 34; // Right side entrance
        } else {
            newPlayer.d = 'left';
            newPlayer.col = 11;
            newPlayer.x = 274; // Left side entrance
        }
        newPlayer.row = 3;
        newPlayer.y = 3 + 24 * (newPlayer.row - 1);
        newPlayer.frameCounters = { justShoot: 0, entering: 0, dead: 0 };
        newPlayer.animationSequence = 0;
        
        targetDungeon.addPlayer(newPlayer);
        
        // Update connection
        conn.player = newPlayer;
        conn.dungeonId = targetDungeon.id;
        
        // Send full dungeon init to transferred player
        this._sendInit(conn, targetDungeon);
        
        // Broadcast to target dungeon that player arrived
        this._broadcastToDungeon(targetDungeon, {
            type: 'player_arrived_via_tunnel',
            playerId: player.id,
            playerSlot: availableSlot,
            entrySide: entrySide
        }, player.id);
        
        console.log(`[Transfer] SUCCESS: Player ${player.id} now in ${targetDungeon.id} (slot ${availableSlot})`);
        return true;
    }
    
    /**
     * Find an available player slot in a dungeon
     * @returns {number|null} - Slot index (0 or 1) or null if full
     */
    _findAvailableSlot(dungeon) {
        for (let i = 0; i < dungeon.players.length; i++) {
            if (dungeon.players[i].id === null) {
                return i;
            }
        }
        return null;
    }

    _releaseBotSlot(dungeon) {
        for (let i = dungeon.players.length - 1; i >= 0; i--) {
            const player = dungeon.players[i];
            if (!player?.id || !player.isBot) continue;
            this.removeBot(player.id);
            return i;
        }
        return null;
    }
    
    /**
     * Broadcast a message to all players in a dungeon
     * @param {DungeonInstance} dungeon
     * @param {object} message
     * @param {string} excludePlayerId - Optional player ID to exclude
     */
    _broadcastToDungeon(dungeon, message, excludePlayerId = null) {
        for (const [playerId, conn] of this.connections.entries()) {
            if (conn.dungeonId === dungeon.id && playerId !== excludePlayerId) {
                this._send(conn.ws, message);
            }
        }
    }

    // ─── Game Loop ────────────────────────────────────────────────────────────

    _tick() {
        // Build inputs map: playerId → controls (including bots)
        const inputsMap = {};
        
        // Real player inputs
        for (const [playerId, conn] of this.connections) {
            if (conn.player) inputsMap[playerId] = conn.inputs;
        }
        
        // Bot inputs
        for (const [botId, bot] of this.bots) {
            inputsMap[botId] = bot.generateInput();
        }

        // Tick all dungeons at the authoritative game rate.
        for (const [, dungeon] of this.dungeons) {
            if (this._tickDungeon(dungeon)) {
                dungeon.tick(inputsMap);
            }
        }

        // Broadcast snapshots at a stable lower rate than the authoritative
        // server tick. Clients render from a timed buffer to smooth jitter.
        const shouldBroadcastPlayers = (this._tickCount || 0) % SNAPSHOT_EVERY_TICKS === 0;
        let serializedByDungeon = null;
        if (shouldBroadcastPlayers) {
            serializedByDungeon = this._serializeActiveDungeons();
            for (const [, conn] of this.connections) {
                if (!conn.player || !conn.dungeonId) continue;
                const serializedState = serializedByDungeon.get(conn.dungeonId);
                if (!serializedState) continue;
                this._sendSerializedState(conn, serializedState);
            }
        }
        
        // Broadcast to spectators at reduced rate (2 FPS = every 10 ticks)
        if (this._tickCount % 10 === 0) {
            if (!serializedByDungeon) serializedByDungeon = this._serializeActiveDungeons();
            this._broadcastToSpectators(serializedByDungeon);
        }
        this._tickCount = (this._tickCount || 0) + 1;
    }

    _broadcastDungeonState(dungeon) {
        const serializedState = this._prepareSerializedDungeonState(dungeon);
        for (const [, conn] of this.connections) {
            if (conn.dungeonId === dungeon.id) {
                this._sendSerializedState(conn, serializedState);
            }
        }
    }
    
    _broadcastToSpectators(serializedByDungeon) {
        for (const [playerId, spectator] of this.spectators) {
            const { dungeonId, ws } = spectator;
            const serializedState = serializedByDungeon.get(dungeonId);
            if (!serializedState) continue;
            
            // Send spectator-specific state (read-only)
            try {
                this._send(ws, {
                    type: 'spectate_state',
                    dungeonId,
                    state: serializedState
                });
            } catch (err) {
                console.error(`[GameServer] Failed to send to spectator ${playerId}:`, err);
                this.spectators.delete(playerId);
            }
        }
    }

    _serializeActiveDungeons() {
        const serializedByDungeon = new Map();
        for (const [dungeonId, dungeon] of this.dungeons) {
            serializedByDungeon.set(dungeonId, this._prepareSerializedDungeonState(dungeon));
        }
        return serializedByDungeon;
    }

    _prepareSerializedDungeonState(dungeon) {
        const state = dungeon.serialize();
        state.serverTick = this._tickCount || 0;
        state.serverTimeMs = Date.now();
        state.tickRate = SCAN_FPS;
        state.snapshotRate = Math.round(SCAN_FPS / SNAPSHOT_EVERY_TICKS);
        state.sounds = dungeon.drainSounds();
        const serializedState = JSON.stringify(state);
        return serializedState.slice(0, -1);
    }

    _sendSerializedState(conn, serializedStateWithoutBrace) {
        const myPlayerId = conn.player ? conn.player.id : null;
        this._sendRaw(
            conn.ws,
            `{"type":"state","state":${serializedStateWithoutBrace},"myPlayerId":${JSON.stringify(myPlayerId)}}}`
        );
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _sendInit(conn, dungeon) {
        this._send(conn.ws, {
            type: 'init',
            playerId: conn.player.id,
            username: conn.username,
            playerNum: conn.player.num,
            dungeonId: dungeon.id,
            matchMode: dungeon.matchMode || null,
        });
    }

    _generatePrivateCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        do {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += alphabet[Math.floor(Math.random() * alphabet.length)];
            }
        } while (this.privatePairLobbies.has(code));
        return code;
    }

    _removePrivateLobbyByDungeonId(dungeonId) {
        for (const [code, lobby] of this.privatePairLobbies.entries()) {
            if (lobby.dungeon && lobby.dungeon.id === dungeonId) {
                if (lobby.timeoutId) clearTimeout(lobby.timeoutId);
                this.privatePairLobbies.delete(code);
                break;
            }
        }
        this._broadcastOpenGames();
    }

    _sendOpenGames(conn) {
        this._send(conn.ws, { type: 'open_games', snapshot: this.getActiveGamesSnapshot() });
    }

    _broadcastOpenGames() {
        const message = { type: 'open_games', snapshot: this.getActiveGamesSnapshot() };
        for (const conn of this.connections.values()) {
            this._send(conn.ws, message);
        }
    }

    _hasWaitingPrivateLobby(dungeonId) {
        for (const [, lobby] of this.privatePairLobbies.entries()) {
            if (lobby?.dungeon?.id === dungeonId) return true;
        }
        return false;
    }

    getActiveGamesSnapshot() {
        const games = [];
        for (const [code, lobby] of this.privatePairLobbies.entries()) {
            const dungeon = lobby?.dungeon;
            if (!dungeon || dungeon.lifecycleState === STATE.DESTROYED) continue;
            games.push({
                dungeon_id: dungeon.id,
                mode: 'open-2p',
                status: 'waiting_for_partner',
                player_count: 1,
                max_players: 2,
                joinable: true,
                join_code: code,
                host_name: lobby.hostName || 'Arcade Wizard',
                created_at: dungeon.createdAt || new Date(lobby.createdAt).toISOString(),
                players: [{ id: lobby.hostId, name: lobby.hostName || 'Arcade Wizard', isBot: false }],
            });
        }
        for (const [dungeonId, dungeon] of this.dungeons.entries()) {
            if (dungeon.lifecycleState === STATE.DESTROYED) continue;
            if (this._hasWaitingPrivateLobby(dungeonId)) continue;
            const players = dungeon.players.filter((player) => player.id !== null);
            if (!players.length) continue;
            const mode = this._toSnapshotMode(dungeon.matchMode);
            games.push({
                dungeon_id: dungeonId,
                mode,
                status: 'in_progress',
                player_count: players.length,
                max_players: 2,
                joinable: false,
                created_at: dungeon.createdAt,
                players: players.map((player) => {
                    const conn = this.connections.get(player.id);
                    const bot = this.bots.get(player.id);
                    return { id: player.id, name: conn?.username || bot?.name || 'Wor Bot', isBot: !!player.isBot };
                }),
            });
        }
        return {
            total_games: games.length,
            total_players: games.reduce((sum, g) => sum + g.player_count, 0),
            queued_sitngo_players: this.sitNGoQueue ? this.sitNGoQueue.getWaitingCount() : 0,
            queued_team_sitngo_players: this.teamSitNGoQueue ? (this.teamSitNGoQueue.waitingPlayers ? this.teamSitNGoQueue.waitingPlayers.size : 0) : 0,
            games,
        };
    }

    _scheduleBackgroundBattleRoyaleBots() {
        const schedule = (delayMs, intervalMs, callback) => {
            const timeoutId = setTimeout(() => {
                callback();
                const intervalId = setInterval(callback, intervalMs);
                this._backgroundTimers.push(intervalId);
            }, delayMs);
            this._backgroundTimers.push(timeoutId);
        };

        schedule(BOT_SEED_INITIAL_DELAY_MS, BOT_SEED_INTERVAL_MS, () => this._seedEndlessBattleRoyaleBots());
        schedule(BOT_SEED_INITIAL_DELAY_MS, BOT_SEED_INTERVAL_MS, () => this._seedSitNGoBattleRoyaleBots());
        schedule(BOT_SEED_INITIAL_DELAY_MS, BOT_SEED_INTERVAL_MS, () => this._seedTeamEndlessBots());
        schedule(BOT_SEED_INITIAL_DELAY_MS, BOT_SEED_INTERVAL_MS, () => this._seedTeamSitNGoBots());
    }

    _seedEndlessBattleRoyaleBots() {
        const needed = TARGET_DUNGEONS_PER_MODE - this._countActiveMatchesByMode('endless_br');
        for (let i = 0; i < needed; i++) this._seedBotOnlyMatch('endless_br');
    }

    _seedSitNGoBattleRoyaleBots() {
        if (this.sitNGoQueue.getWaitingCount() > 0) this.sitNGoQueue.launchWithBots();
        const needed = TARGET_DUNGEONS_PER_MODE - this._countActiveMatchesByMode('sitngo_br');
        for (let i = 0; i < needed; i++) this._seedBotOnlyMatch('sitngo_br');
    }

    _seedTeamEndlessBots() {
        const needed = TARGET_DUNGEONS_PER_MODE - this._countActiveMatchesByMode('team_endless_br');
        for (let i = 0; i < needed; i++) this._seedBotOnlyMatch('team_endless_br');
    }

    _seedTeamSitNGoBots() {
        const needed = TARGET_DUNGEONS_PER_MODE - this._countActiveMatchesByMode('team_sitngo_br');
        for (let i = 0; i < needed; i++) this._seedBotOnlyMatch('team_sitngo_br');
    }

    _seedBotOnlyMatch(matchMode) {
        const dungeon = this._createDungeon();
        dungeon.matchMode = matchMode;
        this.spawnBot(dungeon.id, 0);
        this.spawnBot(dungeon.id, 1);
        dungeon.startGame();
        console.log(`[GameServer] Seeded background ${matchMode} match in dungeon ${dungeon.id}`);
    }

    _countActiveMatchesByMode(matchMode) {
        let count = 0;
        for (const dungeon of this.dungeons.values()) {
            if (dungeon.lifecycleState === STATE.DESTROYED) continue;
            if (dungeon.matchMode === matchMode) count++;
        }
        return count;
    }

    _toSnapshotMode(matchMode) {
        const modes = {
            endless_br: 'endless',
            sitngo_br: 'sitngo',
            team_endless_br: 'team-endless',
            team_sitngo_br: 'team-sitngo',
            classic_private_pair: 'private',
        };
        return modes[matchMode] || 'private';
    }
    
    // Get dungeon topology for mini-map visualization
    getDungeonTopology() {
        const dungeons = [];
        
        for (const [dungeonId, dungeon] of this.dungeons.entries()) {
            if (dungeon.lifecycleState === STATE.DESTROYED) continue;
            
            const players = dungeon.players.filter((player) => player.id !== null);
            
            dungeons.push({
                id: dungeonId,
                lifecycle_state: dungeon.lifecycleState,
                player_count: players.length,
                level: dungeon.level,
                scene: dungeon.scene,
                connections: {
                    left: dungeon.leftTunnelTarget ? dungeon.leftTunnelTarget.dungeonId : null,
                    right: dungeon.rightTunnelTarget ? dungeon.rightTunnelTarget.dungeonId : null
                },
                players: players.map(p => ({
                    id: p.id,
                    lives: p.lives,
                    score: p.score,
                    status: p.status
                }))
            });
        }
        
        return {
            dungeons,
            total_dungeons: dungeons.length,
            topology: this.battleRoyaleMode ? 'ring' : 'independent'
        };
    }

    _send(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    _sendRaw(ws, rawData) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(rawData);
        }
    }

    // ─── Bot Management ───────────────────────────────────────────────────────

    /**
     * Spawn a bot in a dungeon
     * @param {string} dungeonId - Target dungeon ID
     * @param {number} playerSlot - Player slot (0 or 1)
     * @returns {BotPlayer} The spawned bot
     */
    spawnBot(dungeonId, playerSlot) {
        const dungeon = this.dungeons.get(dungeonId);
        if (!dungeon) {
            console.error('[Bot] Cannot spawn bot: dungeon not found:', dungeonId);
            return null;
        }

        const bot = new BotPlayer(dungeonId, playerSlot);
        this.bots.set(bot.id, bot);

        // Add bot as a player in the dungeon
        const serverPlayer = new ServerPlayer(playerSlot, dungeon, bot.id, dungeon.id);
        serverPlayer.isBot = true;
        serverPlayer.homeSlot = playerSlot;
        dungeon.addPlayer(serverPlayer);

        console.log('[Bot] Spawned bot', bot.name, 'in dungeon', dungeonId, 'slot', playerSlot);
        return bot;
    }

    /**
     * Remove a bot
     * @param {string} botId - Bot ID to remove
     */
    removeBot(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return;

        // Remove from dungeon
        const dungeon = this.dungeons.get(bot.dungeonId);
        if (dungeon && dungeon.players[bot.playerSlot]?.id === botId) {
            dungeon.removePlayer(dungeon.players[bot.playerSlot]);
        }

        this.bots.delete(botId);
        console.log('[Bot] Removed bot', bot.name, 'from dungeon', bot.dungeonId);
    }

    /**
     * Remove all bots from a dungeon
     * @param {string} dungeonId - Dungeon ID
     */
    removeBotsFromDungeon(dungeonId) {
        const botsToRemove = [];
        for (const [botId, bot] of this.bots) {
            if (bot.dungeonId === dungeonId) {
                botsToRemove.push(botId);
            }
        }
        botsToRemove.forEach(botId => this.removeBot(botId));
    }

    /**
     * Check if a player slot is occupied by a bot
     * @param {string} dungeonId
     * @param {number} playerSlot
     * @returns {boolean}
     */
    isBotInSlot(dungeonId, playerSlot) {
        for (const bot of this.bots.values()) {
            if (bot.dungeonId === dungeonId && bot.playerSlot === playerSlot) {
                return true;
            }
        }
        return false;
    }

    /** Stops the game loop and closes the WebSocket server. */
    stop() {
        clearInterval(this._loop);
        this._backgroundTimers.forEach((timerId) => clearTimeout(timerId));
        this._backgroundTimers = [];
        this.wss.close();
    }
}

module.exports = { GameServer };
