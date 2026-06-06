'use strict';

const { scoring } = require('./serverConstants');
const { overlaps } = require('./serverUtils');

/**
 * A projectile fired by either a player or a monster.
 * Moves a fixed number of pixels per tick and is destroyed on impact with a
 * target, an inner wall, or the dungeon boundary.
 */
class ServerBullet {
    constructor(owner, x, bY, d, engine) {
        this.owner = owner;
        this.x = x;
        this.y = bY;
        this.d = d;
        this.engine = engine;
        this.bh = this.bw = this.row = this.col = 0;
        if ('up' === this.d || 'down' === this.d) {
            this.col = this.owner.col;
            this.bw = 2;
            this.bh = 8;
        } else {
            this.row = this.owner.row;
            this.bw = 8;
            this.bh = 2;
        }
    }

    /**
     * Advances the bullet by one scan tick: checks for hits against monsters,
     * players, and inner walls, then moves the bullet forward if no collision occurred.
     */
    scanRoutine() {
        const e = this.engine;
        if ('shooted' === this.owner.status || 'died' === this.owner.status) {
            this.owner.bullet = false;
            return;
        }

        if ('player' === this.owner.type) {
            // Check player bullet vs monsters
            let hit = false;
            for (let i = 0; i < e.monsters.length; i++) {
                const monster = e.monsters[i];
                if ('alive' === monster.status && overlaps(monster.x, monster.y, 18, 18, this.x, this.y, this.bw, this.bh)) {
                    monster.status = 'shooted';
                    hit = true;
                    let pts = scoring[monster.type];
                    if (e.doubleScoreNow) pts *= 2;
                    this.owner.score += pts;
                }
            }
            if (hit) { e.queueSound('Fire', false, true); this.owner.bullet = false; return; }

            // Check player bullet vs enemy bullet (cancel each other)
            const otherNum = 1 === this.owner.num ? 0 : 1;
            const otherBullet = e.players[otherNum] && e.players[otherNum].bullet;
            if (otherBullet && overlaps(otherBullet.x, otherBullet.y, otherBullet.bw, otherBullet.bh, this.x, this.y, this.bw, this.bh)) {
                this.owner.bullet = false;
                otherBullet.owner.bullet = false;
                return;
            }

            // Check player bullet vs other player (PvP)
            const otherPlayer = e.players[otherNum];
            if (otherPlayer && 'alive' === otherPlayer.status &&
                overlaps(otherPlayer.x, otherPlayer.y, 18, 18, this.x, this.y, this.bw, this.bh)) {
                let pts = scoring.worrior;
                if (e.doubleScoreNow) pts *= 2;
                this.owner.score += pts;
                otherPlayer.status = 'dead';
                otherPlayer.bullet = false;
                e.queueSound('Fire', false, true);
                this.owner.bullet = false;
                if ('WIZARD OF WOR' === e.radarText) {
                    e.radarText = 'ESCAPED';
                    e.monsters[e.monsters.length - 1].status = 'died';
                    e.queueSound('WizardEscape');
                    e.frameCounters.wizardEscaped = Math.round(e.scanFPS * 4.4);
                    e.closeTeleport(0);
                } else {
                    e.queueSound('Death');
                }
                return;
            }
        } else {
            // Monster bullet vs players
            let hit = false;
            for (let i = 0; i < 2; i++) {
                const p = e.players[i];
                if (p && 'alive' === p.status && overlaps(p.x, p.y, 18, 18, this.x, this.y, this.bw, this.bh)) {
                    hit = true;
                    p.status = 'dead';
                    p.bullet = false;
                    if ('wizardOfWor' === this.owner.type) {
                        e.radarText = 'ESCAPED';
                        this.owner.status = 'died';
                        e.queueSound('WizardEscape');
                        e.frameCounters.wizardEscaped = Math.round(e.scanFPS * 4.4);
                        p.lives--;
                    }
                }
            }
            if (hit) {
                if ('wizardOfWor' !== this.owner.type && 'worluk' !== this.owner.type) e.queueSound('Death');
                this.owner.bullet = false;
                return;
            }
        }

        // Advance bullet (player bullets move every 2nd tick, monster every 4th)
        if ('player' === this.owner.type) {
            if (e.scanFrameCounter % 2) return;
        } else {
            if (e.scanFrameCounter % 4) return;
        }

        switch (this.d) {
            case 'up':    this.y -= 8; break;
            case 'right': this.x += 8; break;
            case 'down':  this.y += 8; break;
            case 'left':  this.x -= 8; break;
        }

        // Out of bounds
        if (2 > this.y || 134 < this.y || 34 > this.x || 285 < this.x) {
            this.owner.bullet = false;
            return;
        }

        // Inner wall collision
        for (let i = 0; i < e.innerWalls.length; i++) {
            const wall = e.innerWalls[i];
            if ((wall.col == this.col && overlaps(this.x, this.y, 2, 8, wall.x, wall.y, wall.w, wall.h)) ||
                (wall.row == this.row && overlaps(this.x, this.y, 8, 2, wall.x, wall.y, wall.w, wall.h))) {
                this.owner.bullet = false;
                break;
            }
        }
    }
}

module.exports = { ServerBullet };
