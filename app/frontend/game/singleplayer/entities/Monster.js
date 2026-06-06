import { m } from '../../shared/constants.js';
import { l, w, r, y } from '../../shared/utils.js';
import { Bullet } from './Bullet.js';

export class Monster {
    constructor(type, coordinate, engine, app) {
        this.type = type;
        this.status = "alive";
        this.engine = engine;
        this.app = app;
        if (!coordinate) {
            var f = this.engine.getFreeCoordinate();
            this.col = f.col;
            this.row = f.row;
        } else {
            this.col = coordinate.col;
            this.row = coordinate.row;
        }
        this.d = "up";
        this.visible = !0;
        this.animationSequence = 0;
        this.bullet = !1;
        this.frameCounters = { shooted: 0 };
        this.path = { primary: "up", secondary: "right", len: 0, steps: 0, inMoving: !1, inMovingPixels: 0, diagonal: !1 };
        this.calcPositionByCoordinates();
    }

    calcPositionByCoordinates() {
        this.x = 34 + 24 * (this.col - 1);
        this.y = 3 + 24 * (this.row - 1);
    }

    getCol() {
        var d = this.getLine();
        return "both" == d || "col" == d ? (this.x - 34) / 24 + 1 : Math.round((this.x - 34) / 24) + 1;
    }

    getRow() {
        var d = this.getLine();
        return "both" == d || "row" == d ? (this.y - 3) / 24 + 1 : Math.round((this.y - 3) / 24) + 1;
    }

    getLine() {
        var d = 0 === (this.x - 34) % 24, g = 0 === (this.y - 3) % 24;
        if (d && g) return "both";
        if (!d && g) return "row";
        if (d && !g) return "col";
    }

    canHide() {
        if ("alive" != this.status || "burwor" == this.type || "worluk" == this.type || "wizardOfWor" == this.type) return !1;
        for (var d = 0; 2 > d; d++)
            if ("out" != this.engine.players[d].status && (this.engine.players[d].x - 24 < this.x && this.engine.players[d].x + 24 > this.x || this.engine.players[d].y - 24 < this.y && this.engine.players[d].y + 24 > this.y))
                return !1;
        return !0;
    }

    generatePath() {
        this.path.primary = m.directions[w(4) - 1];
        this.path.secondary = "up" == this.path.primary || "down" == this.path.primary ? ["left", "right"][w(2) - 1] : ["up", "down"][w(2) - 1];
        this.path.len = w(14) + 2;
        this.path.steps = 0;
        this.path.inMoving = !1;
        this.path.inMovingPixels = 0;
        this.path.diagonal = 1 != w(6 < this.engine.level ? 4 : 3) ? !0 : !1;
        this.visible && this.canHide() && 1 == w(10) && (this.visible = !1);
    }

    animationRoutine() {
        if ("died" == this.status || "escaped" == this.status || !this.visible || "dungeon" != this.engine.scene) return !1;
        var d = 0;
        11 < this.animationSequence ? d = 1 : 3 < this.animationSequence && 8 > this.animationSequence && (d = 2);
        d = "shooted" == this.status ? m.sprite.hit[Math.floor(this.app.animationFrameCounter % 48 / 3)] : "worluk" == this.type ? m.sprite[this.type][d] : m.sprite[this.type][this.d][d];
        l(this.app, d.x, d.y, 18, 18, this.x, this.y);
    }

    scanRoutine() {
        const e = this.engine;
        const b = this.app;
        if ("died" != this.status)
            if ("shooted" == this.status)
                this.frameCounters.shooted++, 1 == this.frameCounters.shooted && (this.visible = !0, this.bullet = !1, "worluk" == this.type || "wizardOfWor" == this.type ? (b.audio.stop("Worluk"), this.frameCounters.shooted = 999) : r(b, "Shooted")), this.frameCounters.shooted >= Math.round(b.scanFPS * .8) && e.killMonster(this);
            else if ("escaped" == this.status)
                this.status = "died";
            else if ("alive" == this.status) {
                if ("wizardOfWor" == this.type && 3 <= this.path.steps && 1 == w(14)) {
                    var d = e.getFreeCoordinate();
                    this.col = d.col;
                    this.row = d.row;
                    this.calcPositionByCoordinates();
                    this.path.inMoving = !1;
                    this.path.steps = 0;
                    this.path.len = 0;
                }
                this.path.steps >= this.path.len && this.generatePath();
                d = this.col;
                var g = this.row, h = this.col, k = this.row;
                if (!this.path.inMoving) {
                    this.path.inMoving = !0;
                    this.path.inMovingPixels = 0;
                    if (this.path.diagonal) {
                        var n = this.path.primary;
                        this.path.primary = this.path.secondary;
                        this.path.secondary = n;
                    }
                    switch (this.path.primary) {
                        case "up": k = g - 1; break;
                        case "right": h = d + 1; break;
                        case "down": k = g + 1; break;
                        case "left": h = d - 1;
                    }
                    e.innerWallCollision(d, g, this.path.primary) && (k = g, h = d);
                    if (1 > h || 11 < h) h = d;
                    if (1 > k || 6 < k) k = g;
                    if (k == g && h == d) {
                        switch (this.path.secondary) {
                            case "up": k = g - 1; break;
                            case "right": h = d + 1; break;
                            case "down": k = g + 1; break;
                            case "left": h = d - 1;
                        }
                        e.innerWallCollision(d, g, this.path.secondary) && (k = g, h = d);
                        if (1 > h || 11 < h) h = d;
                        if (1 > k || 6 < k) k = g;
                        k == g && h == d ? (this.path.inMoving = !1, this.path.steps = 0, this.path.len = 0) : this.d = this.path.secondary;
                    } else this.d = this.path.primary;
                    !this.bullet && this.visible && this.path.inMoving && "worluk" != this.type && ("wizardOfWor" == this.type && 1 == w(4) || 1 == w(15)) && (r(b, "EnemyFire"), d = "wizardOfWor" == this.type ? ["up", "right", "down", "left"][w(4) - 1] : this.d, this.bullet = new Bullet(this, "left" == d ? this.x : this.x + 9, "up" == d ? this.y : this.y + 9, d, e, b));
                }
                if (this.path.inMoving) {
                    d = 0;
                    if (1 == e.speed) 4 == b.scanFrameCounter % 5 && (d = 1);
                    else if (2 == e.speed) 3 == b.scanFrameCounter % 4 && (d = 1);
                    else if (3 == e.speed) 2 == b.scanFrameCounter % 3 && (d = 1);
                    else if (4 == e.speed) 1 == b.scanFrameCounter % 2 && (d = 1);
                    else if (5 == e.speed) 0 < b.scanFrameCounter % 3 && (d = 1);
                    else if (6 == e.speed) 0 < b.scanFrameCounter % 4 && (d = 1);
                    else if (7 == e.speed) d = 1;
                    else if (8 == e.speed) (d = 1, 4 == b.scanFrameCounter % 5 && (d = 2));
                    else if (9 == e.speed) (d = 1, 3 == b.scanFrameCounter % 4 && (d = 2));
                    else if (10 == e.speed) (d = 1, 2 == b.scanFrameCounter % 3 && (d = 2));
                    else if (11 == e.speed) (d = 1, 1 == b.scanFrameCounter % 2 && (d = 2));
                    else if (12 == e.speed) (d = 1, 0 < b.scanFrameCounter % 3 && (d = 2));
                    else if (13 == e.speed) (d = 1, 0 < b.scanFrameCounter % 4 && (d = 2));
                    else if (14 == e.speed) d = 2;
                    else if (15 == e.speed) (d = 2, 4 == b.scanFrameCounter % 5 && (d = 3));
                    else if (16 == e.speed) (d = 2, 2 == b.scanFrameCounter % 3 && (d = 3));
                    if (!d) return;
                    14 > e.speed ? this.animationSequence++ : this.animationSequence += 2;
                    15 <= this.animationSequence && (this.animationSequence -= 15);
                    24 < this.path.inMovingPixels + d && (d -= this.path.inMovingPixels + d - 24);
                    this.path.inMovingPixels += d;
                    "up" == this.d && (this.y -= d); "right" == this.d && (this.x += d); "down" == this.d && (this.y += d); "left" == this.d && (this.x -= d);
                    if (24 == this.path.inMovingPixels) {
                        d = this.getLine();
                        if ("both" == d || "row" == d) this.row = this.getRow();
                        if ("both" == d || "col" == d) this.col = this.getCol();
                        this.path.steps++;
                        this.path.inMoving = !1;
                        if (3 == this.row && (1 == this.col || 11 == this.col) && "open" == e.teleportStatus) {
                            if ("worluk" == this.type) {
                                this.status = "escaped";
                                e.doubleScoreNext = !1;
                                b.audio.stop("Worluk");
                                r(b, "WorlukEscape");
                                e.radarText = "ESCAPED";
                                this.radarTextColor = 7;
                                e.closeTeleport(0);
                                e.frameCounters.worlukEscaped = Math.round(b.scanFPS * 1.8);
                            } else if (1 == w(2)) {
                                this.col = 11 == this.col ? 1 : 11;
                                this.calcPositionByCoordinates();
                                this.path.inMoving = !1;
                                this.path.steps = 0;
                                this.path.len = 0;
                                "wizardOfWor" !== this.type && e.closeTeleport(13);
                                r(b, "Teleport");
                            }
                        }
                    }
                }
                this.visible || this.canHide() || (r(b, "Visible"), this.visible = !0)
            }
    }
}
