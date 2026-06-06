'use strict';

const { directions } = require('./serverConstants');
const { randInt, frames } = require('./serverUtils');
const { ServerBullet } = require('./ServerBullet');

/**
 * Server-side monster AI for Wizard of Wor.
 * Handles pathfinding (primary + secondary direction with optional diagonal),
 * random teleportation (WizardOfWor), tunnel use, invisibility, and shooting.
 * All position arithmetic is in pixels; coordinates (col/row) are grid cells.
 */
class ServerMonster {
    constructor(type, coordinate, engine) {
        this.type = type;
        this.status = 'alive';
        this.engine = engine;
        if (!coordinate) {
            const f = engine.getFreeCoordinate();
            this.col = f.col;
            this.row = f.row;
        } else {
            this.col = coordinate.col;
            this.row = coordinate.row;
        }
        this.d = 'up';
        this.visible = true;
        this.animationSequence = 0;
        this.bullet = false;
        this.frameCounters = { shooted: 0 };
        this.path = { primary: 'up', secondary: 'right', len: 0, steps: 0, inMoving: false, inMovingPixels: 0, diagonal: false };
        this.calcPositionByCoordinates();
    }

    calcPositionByCoordinates() {
        this.x = 34 + 24 * (this.col - 1);
        this.y = 3 + 24 * (this.row - 1);
    }

    getCol() {
        const d = this.getLine();
        return ('both' === d || 'col' === d) ? (this.x - 34) / 24 + 1 : Math.round((this.x - 34) / 24) + 1;
    }

    getRow() {
        const d = this.getLine();
        return ('both' === d || 'row' === d) ? (this.y - 3) / 24 + 1 : Math.round((this.y - 3) / 24) + 1;
    }

    getLine() {
        const d = 0 === (this.x - 34) % 24;
        const g = 0 === (this.y - 3) % 24;
        if (d && g) return 'both';
        if (!d && g) return 'row';
        if (d && !g) return 'col';
        return null;
    }

    canHide() {
        if ('alive' !== this.status || 'burwor' === this.type || 'worluk' === this.type || 'wizardOfWor' === this.type) return false;
        for (let i = 0; i < 2; i++) {
            const p = this.engine.players[i];
            if (p && 'out' !== p.status &&
                (p.x - 24 < this.x && p.x + 24 > this.x || p.y - 24 < this.y && p.y + 24 > this.y)) return false;
        }
        return true;
    }

    generatePath() {
        this.path.primary = directions[randInt(4) - 1];
        this.path.secondary = ('up' === this.path.primary || 'down' === this.path.primary)
            ? ['left', 'right'][randInt(2) - 1]
            : ['up', 'down'][randInt(2) - 1];
        this.path.len = randInt(14) + 2;
        this.path.steps = 0;
        this.path.inMoving = false;
        this.path.inMovingPixels = 0;
        this.path.diagonal = 1 !== randInt(6 < this.engine.level ? 4 : 3);
        if (this.visible && this.canHide() && 1 === randInt(10)) this.visible = false;
    }

    scanRoutine() {
        const e = this.engine;
        if ('died' === this.status) return;
        if ('shooted' === this.status) {
            this.frameCounters.shooted++;
            if (1 === this.frameCounters.shooted) {
                this.visible = true;
                this.bullet = false;
                if ('worluk' === this.type || 'wizardOfWor' === this.type) {
                    e.audio.stop('Worluk');
                    this.frameCounters.shooted = 999;
                } else {
                    e.queueSound('Shooted');
                }
            }
            if (this.frameCounters.shooted >= Math.round(e.scanFPS * 0.8)) e.killMonster(this);
        } else if ('escaped' === this.status) {
            this.status = 'died';
        } else if ('alive' === this.status) {
            // WizardOfWor random teleport
            if ('wizardOfWor' === this.type && 3 <= this.path.steps && 1 === randInt(14)) {
                const d = e.getFreeCoordinate();
                this.col = d.col; this.row = d.row;
                this.calcPositionByCoordinates();
                this.path.inMoving = false; this.path.steps = 0; this.path.len = 0;
            }

            if (this.path.steps >= this.path.len) this.generatePath();

            let col = this.col, row = this.row, newCol = this.col, newRow = this.row;

            if (!this.path.inMoving) {
                this.path.inMoving = true;
                this.path.inMovingPixels = 0;
                if (this.path.diagonal) {
                    const tmp = this.path.primary;
                    this.path.primary = this.path.secondary;
                    this.path.secondary = tmp;
                }
                switch (this.path.primary) {
                    case 'up':    newRow = row - 1; break;
                    case 'right': newCol = col + 1; break;
                    case 'down':  newRow = row + 1; break;
                    case 'left':  newCol = col - 1; break;
                }
                if (e.innerWallCollision(col, row, this.path.primary)) { newRow = row; newCol = col; }
                if (1 > newCol || 11 < newCol) newCol = col;
                if (1 > newRow || 6 < newRow) newRow = row;
                if (newRow === row && newCol === col) {
                    switch (this.path.secondary) {
                        case 'up':    newRow = row - 1; break;
                        case 'right': newCol = col + 1; break;
                        case 'down':  newRow = row + 1; break;
                        case 'left':  newCol = col - 1; break;
                    }
                    if (e.innerWallCollision(col, row, this.path.secondary)) { newRow = row; newCol = col; }
                    if (1 > newCol || 11 < newCol) newCol = col;
                    if (1 > newRow || 6 < newRow) newRow = row;
                    if (newRow === row && newCol === col) {
                        this.path.inMoving = false; this.path.steps = 0; this.path.len = 0;
                    } else {
                        this.d = this.path.secondary;
                    }
                } else {
                    this.d = this.path.primary;
                }

                // Maybe shoot
                if (!this.bullet && this.visible && this.path.inMoving && 'worluk' !== this.type) {
                    if ('wizardOfWor' === this.type ? 1 === randInt(4) : 1 === randInt(15)) {
                        e.queueSound('EnemyFire');
                        const bDir = 'wizardOfWor' === this.type ? directions[randInt(4) - 1] : this.d;
                        this.bullet = new ServerBullet(
                            this,
                            'left' === bDir ? this.x : this.x + 9,
                            'up' === bDir ? this.y : this.y + 9,
                            bDir, e
                        );
                    }
                }
            }

            if (this.path.inMoving) {
                let d = 0;
                const spd = e.speed * e.speedMultiplier;
                const fc = e.scanFrameCounter;
                // Speed tiers: pixels-per-tick based on effective speed (base speed × multiplier)
                if (spd <= 1)       { if (4 === fc % 5) d = 1; }
                else if (spd <= 2)  { if (3 === fc % 4) d = 1; }
                else if (spd <= 3)  { if (2 === fc % 3) d = 1; }
                else if (spd <= 4)  { if (1 === fc % 2) d = 1; }
                else if (spd <= 5)  { if (0 < fc % 3) d = 1; }
                else if (spd <= 6)  { if (0 < fc % 4) d = 1; }
                else if (spd <= 7)  { d = 1; }
                else if (spd <= 8)  { d = 1; if (4 === fc % 5) d = 2; }
                else if (spd <= 9)  { d = 1; if (3 === fc % 4) d = 2; }
                else if (spd <= 10) { d = 1; if (2 === fc % 3) d = 2; }
                else if (spd <= 11) { d = 1; if (1 === fc % 2) d = 2; }
                else if (spd <= 12) { d = 1; if (0 < fc % 3) d = 2; }
                else if (spd <= 13) { d = 1; if (0 < fc % 4) d = 2; }
                else if (spd <= 14) { d = 2; }
                else if (spd <= 15) { d = 2; if (4 === fc % 5) d = 3; }
                else               { d = 2; if (2 === fc % 3) d = 3; }

                if (!d) return;

                if (spd < 14) this.animationSequence++; else this.animationSequence += 2;
                if (15 <= this.animationSequence) this.animationSequence -= 15;

                if (24 < this.path.inMovingPixels + d) d -= this.path.inMovingPixels + d - 24;
                this.path.inMovingPixels += d;
                if ('up' === this.d) this.y -= d;
                if ('right' === this.d) this.x += d;
                if ('down' === this.d) this.y += d;
                if ('left' === this.d) this.x -= d;

                if (24 === this.path.inMovingPixels) {
                    const line = this.getLine();
                    if ('both' === line || 'row' === line) this.row = this.getRow();
                    if ('both' === line || 'col' === line) this.col = this.getCol();
                    this.path.steps++;
                    this.path.inMoving = false;

                    // Tunnel
                    if (3 === this.row && (1 === this.col || 11 === this.col) && 'open' === e.teleportStatus) {
                        if ('worluk' === this.type) {
                            this.status = 'escaped';
                            e.doubleScoreNext = false;
                            e.audio.stop('Worluk');
                            e.queueSound('WorlukEscape');
                            e.radarText = 'ESCAPED';
                            this.radarTextColor = 7;
                            e.closeTeleport(0);
                            e.frameCounters.worlukEscaped = Math.round(e.scanFPS * 1.8);
                        } else if (1 === randInt(2)) {
                            this.col = 11 === this.col ? 1 : 11;
                            this.calcPositionByCoordinates();
                            this.path.inMoving = false; this.path.steps = 0; this.path.len = 0;
                            if ('wizardOfWor' !== this.type) e.closeTeleport(13);
                            e.queueSound('Teleport');
                        }
                    }
                }
            }

            if (!this.visible && !this.canHide()) {
                e.queueSound('Visible');
                this.visible = true;
            }
        }
    }
}

module.exports = { ServerMonster };
