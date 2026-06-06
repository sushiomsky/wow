'use strict';

const { overlaps } = require('./serverUtils');
const { ServerBullet } = require('./ServerBullet');

/**
 * Server-side representation of a human player.
 * Tracks position, lives, score, and input-driven movement within a DungeonInstance.
 */
class ServerPlayer {
    constructor(num, engine, playerId, homeDungeonId) {
        this.type = 'player';
        this.num = num;
        this.engine = engine;
        this.id = playerId;
        this.homeDungeonId = homeDungeonId;
        this.score = 0;
        this.lives = 3;
        this.status = 'wait';
        this.col = 1 === num ? 1 : 11;
        this.row = 6;
        this.d = 1 === num ? 'right' : 'left';
        this.animationSequence = 4;
        this.bullet = false;
        this.frameCounters = { justShoot: 0, entering: 0, dead: 0 };
        this.calcPositionByCoordinates();
    }

    calcPositionByCoordinates() {
        this.x = 24 * (this.col - 1) + 34;
        this.y = 147;
    }

    getCol() {
        const c = this.getLine();
        return ('both' === c || 'col' === c) ? (this.x - 34) / 24 + 1 : Math.round((this.x - 34) / 24) + 1;
    }

    getRow() {
        const c = this.getLine();
        return ('both' === c || 'row' === c) ? (this.y - 3) / 24 + 1 : Math.round((this.y - 3) / 24) + 1;
    }

    getLine() {
        const c = 0 === (this.x - 34) % 24;
        const f = 0 === (this.y - 3) % 24;
        if (c && f) return 'both';
        if (!c && f) return 'row';
        if (c && !f) return 'col';
        return null;
    }

    goToStartPosition() {
        this.status = 'wait';
        this.col = 1 === this.num ? 1 : 11;
        this.row = 6;
        this.calcPositionByCoordinates();
        this.d = 1 === this.num ? 'right' : 'left';
        this.animationSequence = 4;
        this.frameCounters = { justShoot: 0, entering: Math.round(this.engine.scanFPS * 10), dead: 0 };
        this.bullet = false;
    }

    goToTunnelEntry(side) {
        // Enter dungeon from a tunnel: side='left' means entering from left wall, side='right' from right wall
        this.status = 'alive';
        this.row = 3;
        if (side === 'left') {
            this.col = 1; this.x = 34; this.d = 'right';
        } else {
            this.col = 11; this.x = 274; this.d = 'left';
        }
        this.y = 3 + 24 * (this.row - 1); // = 51
        this.bullet = false;
        this.frameCounters = { justShoot: 0, entering: 0, dead: 0 };
        this.animationSequence = 0;
    }

    scanRoutine(controls) {
        const e = this.engine;
        if ('out' === this.status) return;
        if ('dead' === this.status) {
            this.frameCounters.dead++;
            if (this.frameCounters.dead > Math.round(e.scanFPS * 2)) {
                this.lives--;
                if (1 > this.lives) {
                    this.status = 'out';
                    if ('out' === e.players[0].status && 'out' === e.players[1].status) e.gameOver();
                } else {
                    // Respawn in home dungeon
                    e.respawnPlayer(this);
                }
            } else if (e.afterWorluk() && this.frameCounters.dead >= Math.round(e.scanFPS * 0.8)) {
                this.frameCounters.dead = Math.round(e.scanFPS * 2);
            }
            return;
        }
        if ('wait' === this.status) {
            this.frameCounters.entering--;
            const pressUp = controls && controls.up === true;
            if (pressUp || this.frameCounters.entering <= Math.round(e.scanFPS * 1)) {
                this.frameCounters.entering = 0;
                this.status = 'enter';
                e.queueSound('Enter');
            }
            return;
        }
        if ('enter' === this.status) {
            this.y--;
            if ('both' === this.getLine() && 6 === this.getRow()) this.status = 'alive';
            return;
        }
        if ('alive' === this.status) {
            // Monster collision
            for (let i = 0; i < e.monsters.length; i++) {
                const n = e.monsters[i];
                if ('alive' === n.status && overlaps(n.x + 3, n.y + 3, 12, 12, this.x + 3, this.y + 3, 12, 12)) {
                    if ('wizardOfWor' === n.type) {
                        e.radarText = 'ESCAPED';
                        n.status = 'died';
                        e.queueSound('WizardEscape');
                        e.frameCounters.wizardEscaped = Math.round(e.scanFPS * 4.4);
                        this.lives--;
                        e.closeTeleport(0);
                    } else {
                        this.status = 'dead';
                        e.queueSound('Death');
                    }
                    this.bullet = false;
                    return;
                }
            }

            if (0 < this.frameCounters.justShoot) { this.frameCounters.justShoot--; return; }

            const kLine = this.getLine();
            if (controls) {
                let moveDir = null;
                if (controls.up)    moveDir = 'up';
                else if (controls.down)  moveDir = 'down';
                else if (controls.right) moveDir = 'right';
                else if (controls.left)  moveDir = 'left';

                if (moveDir) {
                    // Tunnel exit: may transfer to connected dungeon
                    if ('open' === e.teleportStatus && 'both' === kLine && 3 === this.row) {
                        if (274 <= this.x && ('right' === moveDir || ('down' === moveDir && 'right' === this.d && e.innerWallCollision(this.col, this.row, 'down')))) {
                            this.d = 'right';
                            e.queueSound('Teleport');
                            e.tunnelTransfer(this, 'right');
                            return;
                        }
                        if (34 >= this.x && ('left' === moveDir || ('down' === moveDir && 'left' === this.d && e.innerWallCollision(this.col, this.row, 'down')))) {
                            this.d = 'left';
                            e.queueSound('Teleport');
                            e.tunnelTransfer(this, 'left');
                            return;
                        }
                    }

                    // Normal movement
                    if ('both' === kLine) {
                        if ('up' === moveDir && !e.innerWallCollision(this.col, this.row, 'up') && 3 < this.y) this.d = 'up';
                        else if ('right' === moveDir && !e.innerWallCollision(this.col, this.row, 'right') && 274 > this.x) this.d = 'right';
                        else if ('down' === moveDir && !e.innerWallCollision(this.col, this.row, 'down') && 123 > this.y) this.d = 'down';
                        else if ('left' === moveDir && !e.innerWallCollision(this.col, this.row, 'left') && 34 < this.x) this.d = 'left';
                    } else {
                        if ('up' === this.d && 'down' === moveDir) this.d = 'down';
                        else if ('down' === this.d && 'up' === moveDir) this.d = 'up';
                        else if ('right' === this.d && 'left' === moveDir) this.d = 'left';
                        else if ('left' === this.d && 'right' === moveDir) this.d = 'right';
                    }

                    let moved = true;
                    if ('up' === this.d && (!e.innerWallCollision(this.col, this.row, 'up') || 'both' !== kLine) && 3 < this.y) this.y--;
                    else if ('right' === this.d && (!e.innerWallCollision(this.col, this.row, 'right') || 'both' !== kLine) && 274 > this.x) this.x++;
                    else if ('down' === this.d && (!e.innerWallCollision(this.col, this.row, 'down') || 'both' !== kLine) && 123 > this.y) this.y++;
                    else if ('left' === this.d && (!e.innerWallCollision(this.col, this.row, 'left') || 'both' !== kLine) && 34 < this.x) this.x--;
                    else moved = false;

                    if (moved) {
                        const newLine = this.getLine();
                        if ('both' === newLine || 'col' === newLine) this.col = this.getCol();
                        if ('both' === newLine || 'row' === newLine) this.row = this.getRow();
                        this.animationSequence++;
                        if (15 < this.animationSequence) this.animationSequence = 0;
                    }
                }

                // Shooting
                if (controls.fire && !this.bullet) {
                    let bulletX = false, bulletY = 0;
                    const ck = this.getLine();
                    if ('up' === this.d && ('both' !== ck || !e.innerWallCollision(this.col, this.row, 'up')) && 3 < this.y) {
                        bulletX = this.x + 7; bulletY = this.y + 8;
                    } else if ('right' === this.d && ('both' !== ck || !e.innerWallCollision(this.col, this.row, 'right')) && 274 > this.x) {
                        bulletX = this.x + 9; bulletY = this.y + 8;
                    } else if ('down' === this.d && ('both' !== ck || !e.innerWallCollision(this.col, this.row, 'down')) && 123 > this.y) {
                        bulletX = this.x + 7; bulletY = this.y + 3;
                    } else if ('left' === this.d && ('both' !== ck || !e.innerWallCollision(this.col, this.row, 'left')) && 34 < this.x) {
                        bulletX = this.x + 8; bulletY = this.y + 8;
                    }
                    if (bulletX !== false) {
                        e.audio.stop('Fire');
                        e.queueSound('Fire');
                        this.bullet = new ServerBullet(this, bulletX, bulletY, this.d, e);
                        this.frameCounters.justShoot = 5;
                    }
                }
            }
        }
    }
}

// Placeholder for absent players — keeps engine logic intact
/**
 * Stand-in object used when a player slot is unoccupied.
 * Exposes the same interface as ServerPlayer so the engine can iterate both slots
 * without null-checks everywhere.
 */
class PlaceholderPlayer {
    constructor(num) {
        this.type = 'player';
        this.num = num;
        this.id = null;
        this.status = 'out';
        this.score = 0;
        this.lives = 0;
        this.x = 0; this.y = 0;
        this.col = 0; this.row = 0;
        this.d = 'right';
        this.bullet = false;
        this.animationSequence = 0;
        this.frameCounters = { justShoot: 0, entering: 0, dead: 0 };
        this.homeDungeonId = null;
    }
    getCol() { return this.col; }
    getRow() { return this.row; }
    goToStartPosition() {}
    scanRoutine() {}
}

module.exports = { ServerPlayer, PlaceholderPlayer };
