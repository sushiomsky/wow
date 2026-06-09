/**
 * DungeonInstance — server-side game engine for a single dungeon room.
 *
 * Lifecycle states (see STATE constant):
 *   ACTIVE     — home players are still alive; normal gameplay.
 *   COLLAPSING — all home players have died; outward tunnels remain open for COLLAPSE_COUNTDOWN_MS
 *                so visiting players can escape before the room is cleaned up.
 *   EMPTY      — evacuation time elapsed or no real players remain; monsters are
 *                allowed to finish dying, then the instance destroys itself.
 *   DESTROYED  — instance has been removed from the GameServer registry.
 */
'use strict';

const { dungeons, scoring } = require('./serverConstants');
const { randInt, frames } = require('./serverUtils');
const { ServerMonster } = require('./ServerMonster');
const { PlaceholderPlayer } = require('./ServerPlayer');

const SCAN_FPS = 50;
const COLLAPSE_COUNTDOWN_MS = Number(process.env.SWOW_COLLAPSE_COUNTDOWN_MS || 60000);
const FAST_SPEED_MULTIPLIER = 1.8;

// Lifecycle states
const STATE = { ACTIVE: 'active', COLLAPSING: 'collapsing', EMPTY: 'empty', DESTROYED: 'destroyed' };

let nextDungeonId = 1;

class DungeonInstance {
    constructor(gameServer) {
        this.id = String(nextDungeonId++);
        this.gameServer = gameServer;
        this.createdAt = new Date().toISOString();
        this.matchMode = null;
        this.ownerPlayerId = null;

        // Tunnel connections  { dungeonId, side: 'left'|'right' }
        this.leftTunnelTarget = null;   // what you reach by exiting the left wall
        this.rightTunnelTarget = null;

        // Lifecycle
        this.lifecycleState = STATE.ACTIVE;
        this.collapseUntil = null;

        // Game state (mirrors GameEngine)
        this.scene = 'title';
        this.level = 0;
        this.speed = 1;
        this.speedMultiplier = 1;
        this.speedSoundTempo = 1;
        this.numOfPlayers = 0;
        this.doubleScoreNext = false;
        this.doubleScoreNow = false;
        this.killedThorwors = this.killedBurwors = this.killedMonsters = 0;
        this.afterLastThorwor = false;
        this.wallsH = [];
        this.wallsV = [];
        this.wallType = 'blue';
        this.teleportStatus = 'open';
        this.dungeonType = 'easy';
        this.dungeonNumber = -1;
        this.innerWalls = [];
        this.radarText = 'RADAR';
        this.radarTextColor = 2;
        this.borderColor = 0;
        this.scanFPS = SCAN_FPS;
        this.scanFrameCounter = 0;
        this.animationFrameCounter = 0;

        // Players (always 2 slots, absent = PlaceholderPlayer status='out')
        this.players = [new PlaceholderPlayer(0), new PlaceholderPlayer(1)];
        this.monsters = [];

        // Sound queue for broadcast
        this._soundQueue = [];

        // Fake audio object (stop() used by monster scan logic)
        this.audio = {
            stop: (name) => {
                this.queueStopSound(name);
            }
        };

        this.frameCounters = {
            dungeon: 0, title: 0, getReady: 0, doubleScore: 0, teleport: 0,
            teleportOpenDelay: 0, worlukDeathAnimation: 0, worlukEscaped: 0,
            wizardDeathAnimation: 0, wizardEscaped: 0, gameOver: 0
        };
        this.animateSkip = {
            title: false, enemyRoster: false, getReady: false, doubleScore: false, gameOver: false
        };
    }

    // ─── Player Management ────────────────────────────────────────────────────

    /** Seats a player in their numbered slot and updates the active-player count. */
    addPlayer(serverPlayer) {
        this.players[serverPlayer.num] = serverPlayer;
        serverPlayer.engine = this;
        if (!this.ownerPlayerId && serverPlayer.id && !serverPlayer.isBot && serverPlayer.homeDungeonId === this.id) {
            this.ownerPlayerId = serverPlayer.id;
        }
        this.numOfPlayers = this.players.filter(p => p.id !== null).length;
    }

    /** Replaces the player's slot with a PlaceholderPlayer and updates the active-player count. */
    removePlayer(serverPlayer) {
        this.players[serverPlayer.num] = new PlaceholderPlayer(serverPlayer.num);
        this.numOfPlayers = this.players.filter(p => p.id !== null).length;
    }

    activePlayers() {
        return this.players.filter(p => p.id !== null && p.status !== 'out');
    }

    // ─── Game Start ───────────────────────────────────────────────────────────

    /** Resets all game state and transitions to the getReady scene. */
    startGame() {
        this.level = 0;
        this.speedMultiplier = 1;
        this.speedSoundTempo = this.speed = 1;
        this.doubleScoreNext = this.doubleScoreNow = false;
        this.dungeonType = 'easy';
        this.dungeonNumber = -1;
        this.monsters = [];
        for (let c = 0; c < 2; c++) {
            if (this.players[c].id) this.players[c].score = 0;
        }
        for (const key in this.frameCounters) this.frameCounters[key] = 0;
        for (const key in this.animateSkip) this.animateSkip[key] = false;
        // Absent players go out, present players start in wait
        for (let i = 0; i < 2; i++) {
            const p = this.players[i];
            if (p.id) {
                p.lives = 3;
                p.status = 'wait';
                p.col = 1 === p.num ? 1 : 11;
                p.row = 6;
                p.calcPositionByCoordinates();
                p.d = 1 === p.num ? 'right' : 'left';
                p.animationSequence = 4;
                p.bullet = false;
                p.frameCounters = { justShoot: 0, entering: Math.round(SCAN_FPS * 10), dead: 0 };
            }
        }
        this.scene = 'getReady';
        this._resetBorderColor();
    }

    // ─── Dungeon Parsing ──────────────────────────────────────────────────────

    /** Parses the current dungeon layout string and builds the innerWalls array. */
    parseDungeon() {
        const a = dungeons[this.dungeonType][this.dungeonNumber].split('|');
        this.wallsH = a[0].split(',');
        this.wallsV = a[1].split(',');
        this.innerWalls = [];
        for (let i = 0; this.wallsH[i]; i++) {
            const c = this.wallsH[i].split('x');
            const f = c[0]; const row = c[1];
            this.innerWalls.push({ type: 'h', col: f, row, x: 31 + 24 * (f - 1), y: 24 * row - 2, w: 24, h: 4 });
        }
        for (let i = 0; this.wallsV[i]; i++) {
            const c = this.wallsV[i].split('x');
            const f = c[0]; const row = c[1];
            this.innerWalls.push({ type: 'v', col: f, row, x: 29 + 24 * f, y: 24 * (row - 1), w: 4, h: 24 });
        }
    }

    innerWallCollision(col, row, dir) {
        for (let d = 0; d < this.innerWalls.length; d++) {
            const g = this.innerWalls[d];
            if ('up' === dir && 'h' === g.type && col == g.col && row - 1 == g.row) return true;
            if ('down' === dir && 'h' === g.type && col == g.col && row == g.row) return true;
            if ('right' === dir && 'v' === g.type && row == g.row && col == g.col) return true;
            if ('left' === dir && 'v' === g.type && row == g.row && col - 1 == g.col) return true;
        }
        return false;
    }

    getFreeCoordinate() {
        let col, row, ok;
        do {
            col = randInt(11); row = randInt(6); ok = true;
            if ((1 === col && 2 === row) || (1 === col && 3 === row) || (2 === col && 3 === row) ||
                (1 === col && 4 === row) || (11 === col && 2 === row) || (11 === col && 3 === row) ||
                (10 === col && 3 === row) || (11 === col && 4 === row)) ok = false;
            if (ok) {
                for (let d = 0; d < 2; d++) {
                    const p = this.players[d];
                    if ('alive' === p.status) {
                        if (p.col === col || p.row === row ||
                            (col === p.col - 1 && row === p.row - 1) || (col === p.col + 1 && row === p.row - 1) ||
                            (col === p.col - 1 && row === p.row + 1) || (col === p.col + 1 && row === p.row + 1)) ok = false;
                    }
                }
            }
        } while (!ok);
        return { col, row };
    }

    // ─── Tunnel Transfer ──────────────────────────────────────────────────────

    /**
     * Handles a player exiting through the left or right tunnel wall.
     * If a connected dungeon is registered for that side, delegates to GameServer
     * for a cross-dungeon transfer; otherwise performs the classic same-dungeon teleport.
     * @param {ServerPlayer} player
     * @param {'left'|'right'} exitSide  Which wall the player is exiting through.
     */
    tunnelTransfer(player, exitSide) {
        // exitSide = 'left' (exiting left wall) or 'right' (exiting right wall)
        const target = exitSide === 'right' ? this.rightTunnelTarget : this.leftTunnelTarget;
        if (target) {
            if (this.gameServer.isDungeonEntryBlocked?.(target.dungeonId, this.id)) {
                return;
            }
            // Cross-dungeon transfer
            this.gameServer.transferPlayerToDungeon(player, this, target.dungeonId, target.entrySide);
        } else {
            // Same-dungeon teleport (original behavior)
            if ('right' === exitSide) {
                player.d = 'right'; player.col = 1; player.x = 34;
            } else {
                player.d = 'left'; player.col = 11; player.x = 274;
            }
            if (!this.afterWorluk()) this.closeTeleport(13);
        }
    }

    // ─── Sound Queue ──────────────────────────────────────────────────────────

    queueSound(name, loop = false, stopFirst = false) {
        this._soundQueue.push({ name, loop, stopFirst });
    }

    queueStopSound(name) {
        this._soundQueue.push({ name, stopOnly: true });
    }

    drainSounds() {
        const q = this._soundQueue;
        this._soundQueue = [];
        return q;
    }

    // ─── Scene Logic (ported from GameEngine) ────────────────────────────────

    /**
     * Advances the dungeon by one scan tick (~20 ms at 50 FPS).
     * Drives the scene state machine, player/monster/bullet scans, and lifecycle checks.
     * @param {Object} inputsMap  Map of playerId → current control inputs.
     */
    tick(inputsMap) {
        this.scanFrameCounter++;
        this.animationFrameCounter++;

        // Lifecycle checks
        if (this.lifecycleState === STATE.COLLAPSING) {
            // Collapse timeout: visitors still inside lose one life and are moved
            // back to their own home dungeon. Owners are already eliminated.
            if (this.collapseUntil !== null && Date.now() >= this.collapseUntil) {
                this.gameServer.resolveCollapseTimeoutPlayers(this);
                this.lifecycleState = STATE.EMPTY;
                this.speedMultiplier = FAST_SPEED_MULTIPLIER;
            }
            // For solo mode (collapseUntil === null), transition to EMPTY when all real players are out
            if (this.collapseUntil === null) {
                const realPlayers = this.players.filter(p => p.id !== null);
                if (realPlayers.every(p => p.status === 'out')) {
                    this.lifecycleState = STATE.EMPTY;
                    this.speedMultiplier = FAST_SPEED_MULTIPLIER;
                }
            }
        }

        if (this.lifecycleState === STATE.EMPTY) {
            const hasPlayersInside = this.players.some(p => p.id !== null);
            const monstersResolved = this.monsters.length === 0 || this.monsters.every(m => m.status === 'died' || m.status === 'escaped');
            if (!hasPlayersInside && monstersResolved) {
                this.lifecycleState = STATE.DESTROYED;
                this.gameServer.onDungeonDestroyed(this.id);
                return;
            }
        }

        if ('title' === this.scene || 'enemyRoster' === this.scene) {
            this.frameCounters.title++;
            if (this.frameCounters.title > frames(SCAN_FPS, 13)) {
                this.frameCounters.title = 0; this.animateSkip.title = false; this.scene = 'title';
            } else if (this.frameCounters.title === frames(SCAN_FPS, 7)) {
                this.scene = 'enemyRoster'; this.animateSkip.enemyRoster = false;
            }
        } else if ('getReady' === this.scene) {
            this._scanGetReady();
        } else if ('doubleScore' === this.scene) {
            this._scanDoubleScore();
        } else if ('dungeon' === this.scene) {
            this._scanDungeon(inputsMap);
        } else if ('gameOver' === this.scene) {
            this._scanGameOver();
        }
    }

    _scanGetReady() {
        this.frameCounters.getReady++;
        if (1 === this.frameCounters.getReady) {
            this.animateSkip.getReady = false;
            this.queueSound('GetReady');
        } else if (this.frameCounters.getReady === frames(SCAN_FPS, 1.2)) {
            this.animateSkip.getReady = false;
        } else if (this.frameCounters.getReady > frames(SCAN_FPS, 4)) {
            this.frameCounters.doubleScore = 0;
            this.scene = 'doubleScore';
        }
    }

    _scanDoubleScore() {
        this.frameCounters.doubleScore++;
        if (1 === this.frameCounters.doubleScore) {
            this.animateSkip.doubleScore = false;
            if (!this.doubleScoreNext && 3 !== this.level && 12 !== this.level) {
                this.frameCounters.doubleScore = 0;
                this.nextDungeon();
                return;
            }
            if (this.doubleScoreNext) this.queueSound('Doublescore');
            if (3 === this.level || 12 === this.level) {
                for (let i = 0; i < 2; i++) {
                    if ('out' !== this.players[i].status) this.players[i].lives++;
                }
            }
        }
        if (this.frameCounters.doubleScore >= frames(SCAN_FPS, 4.9)) {
            this.frameCounters.doubleScore = 0;
            this.nextDungeon();
        }
    }

    _scanDungeon(inputsMap) {
        this.frameCounters.dungeon++;

        if (0 < this.frameCounters.worlukDeathAnimation) {
            this.frameCounters.worlukDeathAnimation--;
            if (0 >= this.frameCounters.worlukDeathAnimation) {
                this.wallType = 'blue'; this.borderColor = 0; this.endDungeon();
            } else {
                const a = this.frameCounters.worlukDeathAnimation % 16;
                this.borderColor = 11 < a ? 6 : 7 < a ? 0 : 3 < a ? 2 : 0;
            }
            return;
        }
        if (0 < this.frameCounters.worlukEscaped) {
            this.frameCounters.worlukEscaped--;
            if (0 >= this.frameCounters.worlukEscaped) {
                for (let i = 0; i < 2; i++) {
                    const p = this.players[i];
                    if ('dead' === p.status) p.lives--;
                    if (1 > p.lives) p.status = 'out';
                }
                if ('out' === this.players[0].status && 'out' === this.players[1].status) {
                    this.wallType = 'red'; this.borderColor = 0; this.gameOver();
                } else {
                    this.wallType = 'blue';
                    if (!this.activePlayers().some(p => 'alive' === p.status) || !this.wizardOfWor()) this.endDungeon();
                }
            }
            return;
        }
        if (0 < this.frameCounters.wizardEscaped) {
            this.frameCounters.wizardEscaped--;
            if (0 >= this.frameCounters.wizardEscaped) {
                for (let i = 0; i < 2; i++) {
                    if (!this.players[i].lives) this.players[i].status = 'out';
                }
                if ('out' === this.players[0].status && 'out' === this.players[1].status) {
                    this.wallType = 'red'; this.borderColor = 0; this.gameOver();
                } else {
                    this.wallType = 'blue'; this.endDungeon();
                }
            } else {
                const a = this.frameCounters.wizardEscaped % 16;
                this.wallType = 'red';
                this.borderColor = 11 < a ? 6 : 7 < a ? 0 : 3 < a ? 2 : 0;
            }
            return;
        }
        if (0 < this.frameCounters.wizardDeathAnimation) {
            this.frameCounters.wizardDeathAnimation--;
            if (0 >= this.frameCounters.wizardDeathAnimation) {
                this.wallType = 'blue'; this.endDungeon();
            }
            return;
        }

        // Speed up every 25 seconds
        if (0 === this.frameCounters.dungeon % frames(SCAN_FPS, 25)) this.speedUp();

        // Player scans
        for (let i = 0; i < 2; i++) {
            const p = this.players[i];
            if (p.id) p.scanRoutine(inputsMap ? inputsMap[p.id] : null);
        }
        this._checkLifecycle();

        // Monster scans
        for (let i = 0; i < this.monsters.length; i++) this.monsters[i].scanRoutine();

        // Bullet scans
        for (let i = 0; i < 2; i++) {
            const p = this.players[i];
            if (p.bullet) p.bullet.scanRoutine();
        }
        for (let i = 0; i < this.monsters.length; i++) {
            if (this.monsters[i].bullet) this.monsters[i].bullet.scanRoutine();
        }

        // Teleport open delay
        if (0 < this.frameCounters.teleportOpenDelay) {
            this.frameCounters.teleport++;
            if (this.frameCounters.teleport >= this.frameCounters.teleportOpenDelay) this.openTeleport();
        }

        // Dungeon lifecycle: if COLLAPSING, force tunnels open
        if (this.lifecycleState === STATE.COLLAPSING) {
            this.teleportStatus = 'open';
        }
    }

    _scanGameOver() {
        this.frameCounters.gameOver++;
        if (1 === this.frameCounters.gameOver) {
            this.animateSkip.gameOver = false;
        }
        if (this.frameCounters.gameOver >= frames(SCAN_FPS, 8)) {
            this.frameCounters.title = 0;
            this.animateSkip.title = false;
            this.animateSkip.enemyRoster = false;
            this.scene = 'title';
        }
    }

    // ─── Game Logic (ported from GameEngine) ─────────────────────────────────

    nextDungeon() {
        this.level++;
        this.dungeonType = 7 >= this.level ? 'easy' : 'hard';
        if (4 === this.level || (13 <= this.level && 0 === (this.level - 13) % 6)) this.dungeonType = 'fix';

        let a;
        if ('easy' === this.dungeonType) {
            do a = randInt(12) - 1; while (a === this.dungeonNumber);
        } else if ('hard' === this.dungeonType) {
            do a = randInt(8) - 1; while (a === this.dungeonNumber);
        } else {
            a = 4 === this.level ? 0 : 1;
        }
        this.dungeonNumber = a;
        this.speed = this.level;
        if (12 < this.speed) this.speed = 12;
        this.speedSoundTempo = Math.round(this.speed / 2);
        if (7 < this.speedSoundTempo) this.speedSoundTempo = 7;
        this.queueSound('Speed' + this.speedSoundTempo, true);
        this.parseDungeon();
        this.killedThorwors = this.killedBurwors = this.killedMonsters = 0;
        this.afterLastThorwor = false;
        this.monsters = [];
        for (let i = 0; i < 6; i++) this.monsters.push(new ServerMonster('burwor', null, this));
        this.doubleScoreNow = this.doubleScoreNext ? true : false;
        this.doubleScoreNext = false;
        for (let i = 0; i < 2; i++) {
            if ('out' !== this.players[i].status) this.players[i].goToStartPosition();
        }
        if (1 === this.level) this.radarText = 'RADAR';
        else if (4 === this.level) this.radarText = 'THE ARENA';
        else if (13 === this.level) this.radarText = 'THE PIT';
        else {
            this.radarText = 'DUNGEON  ';
            if (10 > this.level) this.radarText += ' ';
            this.radarText += this.level.toString();
        }
        this.radarTextColor = 2;
        this.openTeleport();
        this.wallType = 'blue';
        this.frameCounters.dungeon = 0;
        this.scene = 'dungeon';
    }

    /**
     * Applies death effects for the given monster: escalates spawn chain
     * (burwor→garwor→thorwor→worluk→wizardOfWor) and updates kill counters.
     * @param {ServerMonster} monster
     */
    killMonster(monster) {
        this.killedMonsters++;
        monster.status = 'died';
        if (0 === this.killedMonsters % 4) this.speedUp();
        if ('burwor' === monster.type) {
            this.killedBurwors++;
            if (this.killedBurwors >= 7 - this.level) this.monsters.push(new ServerMonster('garwor', null, this));
        } else if ('garwor' === monster.type) {
            this.monsters.push(new ServerMonster('thorwor', null, this));
        } else if ('thorwor' === monster.type) {
            this.killedThorwors++;
            let limit = 6;
            if (6 > this.level) limit = 6 - (6 - this.level);
            if (this.killedThorwors >= limit) {
                this.afterLastThorwor = true;
                if (1 === this.level) this.endDungeon();
                else {
                    this.closeTeleport(5);
                    this.monsters.push(new ServerMonster('worluk', null, this));
                    this.radarText = ' WORLUK'; this.radarTextColor = 7;
                    this.speed = 14; this.wallType = 'worluk';
                    this.audio.stop('Speed' + this.speedSoundTempo);
                    this.queueSound('Worluk', true);
                }
            }
        } else if ('worluk' === monster.type) {
            this.doubleScoreNext = true; this.radarText = 'DOUBLE  SCORE'; this.radarTextColor = 7;
            this.audio.stop('Worluk'); this.queueSound('WorlukDeath');
            if (!this.wizardOfWor()) {
                this.wallType = 'red';
                this.frameCounters.worlukDeathAnimation = frames(SCAN_FPS, 4.4);
                this.closeTeleport(0);
            }
        } else if ('wizardOfWor' === monster.type) {
            this.doubleScoreNext = true; this.radarText = 'DOUBLE  SCORE'; this.radarTextColor = 7;
            this.wallType = 'wizardOfWor'; this.queueSound('WizardDeath');
            this.frameCounters.wizardDeathAnimation = frames(SCAN_FPS, 5);
        }
    }

    /** Increments game speed by one tier and updates the background music tempo. */
    speedUp() {
        if (this.afterLastThorwor || 16 <= this.speed) return;
        this.speed++;
        const a = Math.min(7, Math.round(this.speed / 2));
        if (a !== this.speedSoundTempo) {
            this.audio.stop('Speed' + this.speedSoundTempo);
            this.speedSoundTempo = a;
            this.queueSound('Speed' + a, true);
        }
    }

    gameOver() {
        this.audio.stop('Speed' + this.speedSoundTempo);
        this.queueSound('GameOver');
        this.frameCounters.gameOver = 0;
        this.scene = 'gameOver';
        // Trigger lifecycle if this is the home dungeon
        this._checkLifecycle();
    }

    endDungeon() {
        this.audio.stop('Speed' + this.speedSoundTempo);
        if (6 < this.level) this.radarText = 'WORLORD';
        this.frameCounters.getReady = 0;
        this.scene = 'getReady';
    }

    openTeleport() {
        this.teleportStatus = 'open';
        this.frameCounters.teleport = 0;
        this.frameCounters.teleportOpenDelay = 0;
    }

    closeTeleport(seconds) {
        if (this.lifecycleState === STATE.COLLAPSING) return; // forced open during collapse
        this.teleportStatus = 'close';
        this.frameCounters.teleport = 0;
        this.frameCounters.teleportOpenDelay = frames(SCAN_FPS, seconds);
    }

    afterWorluk() {
        return this.monsters.some(m => 'worluk' === m.type);
    }

    wizardOfWor() {
        if (1 !== randInt(7)) return false;
        this.speed = 12;
        this.wallType = 'blue';
        this.openTeleport();
        this.radarText = 'WIZARD OF WOR';
        this.radarTextColor = 7;
        this.monsters.push(new ServerMonster('wizardOfWor', null, this));
        return true;
    }

    respawnPlayer(player) {
        // If player's home dungeon is this dungeon, respawn here
        if (player.homeDungeonId === this.id) {
            const preferredHomeSlot = player.homeSlot ?? player.num;
            if (
                player.num !== preferredHomeSlot &&
                this.players[preferredHomeSlot] &&
                this.players[preferredHomeSlot].id === null
            ) {
                this.removePlayer(player);
                player.num = preferredHomeSlot;
                this.addPlayer(player);
            }
            player._homeSlot = undefined;
            player.goToStartPosition();
        } else {
            // Transfer back to home dungeon and free the visitor slot here.
            this.removePlayer(player);
            player.status = 'out';
            this.gameServer.respawnPlayerInHome(player);
        }
    }

    // Transitions dungeon to COLLAPSING when all home players have lost their final life.
    _checkLifecycle() {
        const homePlayers = this.players.filter(p => p.id && !p.isBot && p.homeDungeonId === this.id);
        if (homePlayers.length > 0 && homePlayers.every(p => p.status === 'out')) {
            this._startCollapseForEliminatedPlayers(homePlayers);
        }
    }

    triggerOwnerEliminated(player) {
        if (!player || player.isBot || player.homeDungeonId !== this.id) return;
        const otherHomePlayers = this.players.filter(p => p.id && p.id !== player.id && !p.isBot && p.homeDungeonId === this.id);
        if (otherHomePlayers.some(p => p.status !== 'out')) return;
        this._startCollapseForEliminatedPlayers([player, ...otherHomePlayers]);
    }

    _startCollapseForEliminatedPlayers(players) {
        if (this.lifecycleState !== STATE.ACTIVE) return;
        this.gameServer.notifyPlayersEliminated(players, this);
        this.lifecycleState = STATE.COLLAPSING;
        this.collapseUntil = Date.now() + COLLAPSE_COUNTDOWN_MS;
        this.teleportStatus = 'open'; // force open during collapse
    }

    _resetBorderColor() {
        this.borderColor = 0;
    }

    // ─── State Serialization ──────────────────────────────────────────────────

    /**
     * Returns a plain-object snapshot of all game state needed by the client renderer.
     * Called once per tick per active dungeon and reused for all viewers in that dungeon.
     */
    serialize() {
        return {
            dungeonId: this.id,
            ownerPlayerId: this.ownerPlayerId,
            state: this.lifecycleState,
            lifecycleState: this.lifecycleState,
            playersInside: this.players.filter(p => p.id !== null).length,
            scene: this.scene,
            level: this.level,
            wallType: this.wallType,
            teleportStatus: this.teleportStatus,
            borderColor: this.borderColor,
            radarText: this.radarText,
            radarTextColor: this.radarTextColor,
            dungeonType: this.dungeonType,
            dungeonNumber: this.dungeonNumber,
            innerWalls: this.innerWalls,
            animationFrameCounter: this.animationFrameCounter,
            scanFrameCounter: this.scanFrameCounter,
            doubleScoreNow: this.doubleScoreNow,
            doubleScoreNext: this.doubleScoreNext,
            afterLastThorwor: this.afterLastThorwor,
            frameCounters: { ...this.frameCounters },
            animateSkip: { ...this.animateSkip },
            collapseUntil: this.collapseUntil,
            collapseCountdownMs: COLLAPSE_COUNTDOWN_MS,
            collapseRemainingSeconds: this.collapseUntil === null
                ? null
                : Math.max(0, Math.ceil((this.collapseUntil - Date.now()) / 1000)),
            tunnelState: {
                left: this._getTunnelState('left'),
                right: this._getTunnelState('right'),
            },
            leftTunnelState: this._getTunnelState('left'),
            rightTunnelState: this._getTunnelState('right'),
            leftTunnelTarget: this.leftTunnelTarget,
            rightTunnelTarget: this.rightTunnelTarget,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name || p.id,
                num: p.num,
                currentDungeonId: p.id ? this.id : null,
                // colorNum stays fixed to the player's home slot so their sprite colour
                // doesn't change when they visit a foreign dungeon and get a different num.
                colorNum: p._homeSlot !== undefined ? p._homeSlot : (p.homeSlot ?? p.num),
                x: p.x, y: p.y,
                col: p.col, row: p.row,
                d: p.d,
                status: p.status,
                aliveState: p.status,
                animationSequence: p.animationSequence,
                frameCounters: { ...p.frameCounters },
                lives: p.lives,
                score: p.score,
                hasBullet: !!p.bullet,
                isHome: p.homeDungeonId === this.id,
            })),
            monsters: this.monsters.map(m => ({
                id: m.id,
                dungeonId: m.dungeonId,
                type: m.type,
                x: m.x, y: m.y,
                col: m.col, row: m.row,
                d: m.d,
                status: m.status,
                alive: m.status === 'alive',
                visible: m.visible,
                animationSequence: m.animationSequence,
            })),
            bullets: this._collectBullets(),
        };
    }
    
    // Export state for spectators (same as serialize but can be enhanced later)
    exportState() {
        return this.serialize();
    }

    _getTunnelState(side) {
        const target = side === 'right' ? this.rightTunnelTarget : this.leftTunnelTarget;
        if (!target) return { directionMode: 'SAME_DUNGEON_ONLY', enabled: true, targetDungeonId: null, entrySide: null };
        const blocked = this.gameServer.isDungeonEntryBlocked?.(target.dungeonId, this.id) === true;
        return {
            directionMode: blocked ? 'BLOCKED' : (this.lifecycleState === STATE.COLLAPSING ? 'ONE_WAY_OUT' : 'CONNECTED_TWO_WAY'),
            enabled: !blocked,
            targetDungeonId: target.dungeonId,
            entrySide: target.entrySide,
        };
    }

    _collectBullets() {
        const bullets = [];
        for (let i = 0; i < 2; i++) {
            const p = this.players[i];
            if (p.bullet) bullets.push({ ownerType: 'player', ownerNum: p.num, id: p.bullet.id, ownerPlayerId: p.bullet.ownerPlayerId, dungeonId: p.bullet.dungeonId, active: p.bullet.active, lifetimeTicks: p.bullet.lifetimeTicks, speed: p.bullet.speed, x: p.bullet.x, y: p.bullet.y, d: p.bullet.d, bw: p.bullet.bw, bh: p.bullet.bh });
        }
        for (let i = 0; i < this.monsters.length; i++) {
            const m = this.monsters[i];
            if (m.bullet) bullets.push({ ownerType: 'monster', ownerNum: -1, id: m.bullet.id, ownerPlayerId: null, dungeonId: m.bullet.dungeonId, active: m.bullet.active, lifetimeTicks: m.bullet.lifetimeTicks, speed: m.bullet.speed, x: m.bullet.x, y: m.bullet.y, d: m.bullet.d, bw: m.bullet.bw, bh: m.bullet.bh });
        }
        return bullets;
    }
}

module.exports = { DungeonInstance, STATE };
