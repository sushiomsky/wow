import { m } from '../../shared/constants.js';
import { l, r, y } from '../../shared/utils.js';
import { Bullet } from './Bullet.js';

export class Player {
    constructor(num, engine, app) {
        this.type = "player";
        this.num = num;
        this.engine = engine;
        this.app = app;
        this.score = 0;
        this.lives = 3;
        this.status = "wait";
        this.col = 1 == num ? 1 : 11;
        this.row = 6;
        this.d = 1 == num ? "right" : "left";
        this.animationSequence = 4;
        this.bullet = !1;
        this.frameCounters = { justShoot: 0, entering: 0, dead: 0 };
        this.calcPositionByCoordinates();
    }

    calcPositionByCoordinates() {
        this.x = 24 * (this.col - 1) + 34;
        this.y = 147;
    }

    getCol() {
        var c = this.getLine();
        return "both" == c || "col" == c ? (this.x - 34) / 24 + 1 : Math.round((this.x - 34) / 24) + 1;
    }

    getRow() {
        var c = this.getLine();
        return "both" == c || "row" == c ? (this.y - 3) / 24 + 1 : Math.round((this.y - 3) / 24) + 1;
    }

    getLine() {
        var c = 0 === (this.x - 34) % 24, f = 0 === (this.y - 3) % 24;
        if (c && f) return "both";
        if (!c && f) return "row";
        if (c && !f) return "col";
    }

    goToStartPosition() {
        this.status = "wait";
        this.col = 1 == this.num ? 1 : 11;
        this.row = 6;
        this.calcPositionByCoordinates();
        this.d = 1 == this.num ? "right" : "left";
        this.animationSequence = 4;
        this.frameCounters = { justShoot: 0, entering: Math.round(this.app.scanFPS * 10), dead: 0 };
        this.bullet = !1;
    }

    animationRoutine() {
        const e = this.engine;
        const b = this.app;
        if ("dungeon" == e.scene) {
            var c = 0;
            11 < this.animationSequence ? c = 1 : 3 < this.animationSequence && 8 > this.animationSequence && (c = 2);
            if ("wait" == this.status || "out" == this.status || 0 < e.frameCounters.wizardEscaped) return !1;
            if ("dead" == this.status) {
                var f = this.frameCounters.dead < Math.round(b.scanFPS * 1.1) ? "left" == this.d || "right" == this.d ? m.sprite.players[10 < this.frameCounters.dead % 20 ? 0 : 1][this.d][c] : 10 < this.frameCounters.dead % 20 ? m.sprite.players[this.num][this.d][c] : m.sprite.players[this.num].death[this.d][c] : m.sprite.hit[Math.floor(b.animationFrameCounter % 48 / 3)];
            } else {
                f = m.sprite.players[this.num];
                f = 0 < this.frameCounters.justShoot ? f.shoot[this.d] : f[this.d][c];
            }
            l(b, f.x, f.y, 18, 18, this.x, this.y);
        }
    }

    scanRoutine() {
        const e = this.engine;
        const b = this.app;
        if ("out" == this.status) return !1;
        if ("dead" == this.status) {
            this.frameCounters.dead++;
            if (this.frameCounters.dead > Math.round(b.scanFPS * 2)) {
                this.lives--;
                if (1 > this.lives) {
                    this.status = "out";
                    if ("out" == e.players[0].status && "out" == e.players[1].status) e.gameOver();
                } else this.goToStartPosition();
            } else if (e.afterWorluk() && this.frameCounters.dead >= Math.round(b.scanFPS * .8)) {
                this.frameCounters.dead = Math.round(b.scanFPS * 2);
            }
        } else if ("wait" == this.status) {
            this.frameCounters.entering--;
            var c = !0 === b.getControls(this.num).up;
            if (c || this.frameCounters.entering <= Math.round(b.scanFPS * 1)) {
                this.frameCounters.entering = 0;
                this.status = "enter";
                r(b, "Enter");
            }
        } else if ("enter" == this.status) {
            --this.y;
            "both" == this.getLine() && 6 == this.getRow() && (this.status = "alive");
        } else if ("alive" == this.status) {
            var controls = b.getControls(this.num);
            var up = !0 === controls.up, down = !0 === controls.down, right = !0 === controls.right, left = !0 === controls.left, fire = !0 === controls.fire;
            for (var k = 0; k < e.monsters.length; k++) {
                var n = e.monsters[k];
                if ("alive" == n.status && y(n.x + 3, n.y + 3, 12, 12, this.x + 3, this.y + 3, 12, 12)) {
                    if ("wizardOfWor" == n.type) {
                        e.radarText = "ESCAPED";
                        n.status = "died";
                        r(b, "WizardEscape");
                        e.frameCounters.wizardEscaped = Math.round(b.scanFPS * 4.4);
                        this.lives--;
                        e.closeTeleport(0);
                    } else {
                        this.status = "dead";
                        r(b, "Death");
                        document.dispatchEvent(new CustomEvent('swow:player-death'));
                    }
                    this.bullet = !1;
                    return;
                }
            }
            if (0 < this.frameCounters.justShoot) this.frameCounters.justShoot--;
            else {
                var k_line = this.getLine();
                var moveDir = !1;
                if (up) moveDir = "up";
                else if (down) moveDir = "down";
                else if (right) moveDir = "right";
                else if (left) moveDir = "left";

                if (moveDir) {
                    if ("open" == e.teleportStatus && "both" == k_line && 3 == this.row) {
                        if (274 <= this.x && ("right" == moveDir || "down" == moveDir && "right" == this.d && e.innerWallCollision(this.col, this.row, "down"))) {
                            this.d = "right"; this.col = 1; this.x = 34; r(b, "Teleport"); e.afterWorluk() || e.closeTeleport(13); return;
                        }
                        if (34 >= this.x && ("left" == moveDir || "down" == moveDir && "left" == this.d && e.innerWallCollision(this.col, this.row, "down"))) {
                            this.d = "left"; this.col = 11; this.x = 274; r(b, "Teleport"); e.afterWorluk() || e.closeTeleport(13); return;
                        }
                    }
                    if ("both" == k_line) {
                        if ("up" == moveDir && !e.innerWallCollision(this.col, this.row, "up") && 3 < this.y) this.d = "up";
                        else if ("right" == moveDir && !e.innerWallCollision(this.col, this.row, "right") && 274 > this.x) this.d = "right";
                        else if ("down" == moveDir && !e.innerWallCollision(this.col, this.row, "down") && 123 > this.y) this.d = "down";
                        else if ("left" == moveDir && !e.innerWallCollision(this.col, this.row, "left") && 34 < this.x) this.d = "left";
                    } else {
                        if ("up" == this.d && "down" == moveDir) this.d = "down";
                        else if ("down" == this.d && "up" == moveDir) this.d = "up";
                        else if ("right" == this.d && "left" == moveDir) this.d = "left";
                        else if ("left" == this.d && "right" == moveDir) this.d = "right";
                    }
                    var moved = !0;
                    if ("up" == this.d && (!e.innerWallCollision(this.col, this.row, "up") || "both" !== k_line) && 3 < this.y) --this.y;
                    else if ("right" == this.d && (!e.innerWallCollision(this.col, this.row, "right") || "both" !== k_line) && 274 > this.x) this.x += 1;
                    else if ("down" == this.d && (!e.innerWallCollision(this.col, this.row, "down") || "both" !== k_line) && 123 > this.y) this.y += 1;
                    else if ("left" == this.d && (!e.innerWallCollision(this.col, this.row, "left") || "both" !== k_line) && 34 < this.x) --this.x;
                    else moved = !1;

                    if (moved) {
                        k_line = this.getLine();
                        if ("both" == k_line || "col" == k_line) this.col = this.getCol();
                        if ("both" == k_line || "row" == k_line) this.row = this.getRow();
                        this.animationSequence++;
                        if (15 < this.animationSequence) this.animationSequence = 0;
                    }
                }
                if (fire && !this.bullet) {
                    var bulletX = !1, bulletY;
                    if ("up" == this.d && ("both" !== k_line || !e.innerWallCollision(this.col, this.row, "up")) && 3 < this.y) {
                        bulletX = this.x + 7; bulletY = this.y + 8;
                    } else if ("right" == this.d && ("both" !== k_line || !e.innerWallCollision(this.col, this.row, "right")) && 274 > this.x) {
                        bulletX = this.x + 9; bulletY = this.y + 8;
                    } else if ("down" == this.d && ("both" !== k_line || !e.innerWallCollision(this.col, this.row, "down")) && 123 > this.y) {
                        bulletX = this.x + 7; bulletY = this.y + 3;
                    } else if ("left" == this.d && ("both" !== k_line || !e.innerWallCollision(this.col, this.row, "left")) && 34 < this.x) {
                        bulletX = this.x + 8; bulletY = this.y + 8;
                    }

                    if (bulletX) {
                        b.audio.stop("Fire");
                        r(b, "Fire");
                        this.bullet = new Bullet(this, bulletX, bulletY, this.d, e, b);
                        this.frameCounters.justShoot = 5;
                        b.setPressedKeyHold("fire", this.num);
                    }
                }
            }
        }
    }
}
