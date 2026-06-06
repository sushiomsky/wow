import { m } from '../../shared/constants.js';
import { l, y, r } from '../../shared/utils.js';

export class Bullet {
    constructor(owner, x, y, d, engine, app) {
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.d = d;
        this.engine = engine;
        this.app = app;
        this.bh = this.bw = this.row = this.col = 0;
        if ("up" == this.d || "down" == this.d) {
            this.col = this.owner.col;
            this.bw = 2;
            this.bh = 8;
        } else {
            this.row = this.owner.row;
            this.bw = 8;
            this.bh = 2;
        }
    }

    animationRoutine() {
        var g = m.sprite.bullets;
        g = "player" == this.owner.type ? g.player : g.monster;
        g = 0 == this.col ? g.h : g.v;
        l(this.app, g.x, g.y, g.w, g.h, this.x, this.y);
    }

    scanRoutine() {
        const e = this.engine;
        const b = this.app;
        if ("shooted" == this.owner.status || "died" == this.owner.status) {
            this.owner.bullet = !1;
        } else {
            if ("player" == this.owner.type) {
                var g = !1;
                for (var h = 0; h < e.monsters.length; h++) {
                    var k = e.monsters[h];
                    if ("alive" == k.status && y(k.x, k.y, 18, 18, this.x, this.y, this.bw, this.bh)) {
                        k.status = "shooted";
                        g = !0;
                        var kx = k.x, ky = k.y;
                        k = m.scoring[k.type];
                        e.doubleScoreNow && (k *= 2);
                        this.owner.score += k;
                        document.dispatchEvent(new CustomEvent('swow:kill-score', { detail: { score: k, x: kx, y: ky } }));
                    }
                }
                if (g) {
                    b.audio.stop("Fire");
                    this.owner.bullet = !1;
                    return;
                }
                if ((h = 1 == this.owner.num ? e.players[0].bullet : e.players[1].bullet) && y(h.x, h.y, h.bw, h.bh, this.x, this.y, this.bw, this.bh)) {
                    this.owner.bullet = !1;
                    h.owner.bullet = !1;
                    return;
                }
                h = 1 == this.owner.num ? e.players[0] : e.players[1];
                if ("alive" == h.status && y(h.x, h.y, 18, 18, this.x, this.y, this.bw, this.bh)) {
                    k = m.scoring.worrior;
                    e.doubleScoreNow && (k *= 2);
                    this.owner.score += k;
                    document.dispatchEvent(new CustomEvent('swow:kill-score', { detail: { score: k, x: h.x, y: h.y } }));
                    h.status = "dead";
                    h.bullet = !1;
                    b.audio.stop("Fire");
                    this.owner.bullet = !1;
                    if ("WIZARD OF WOR" == e.radarText) {
                        e.radarText = "ESCAPED";
                        e.monsters[e.monsters.length - 1].status = "died";
                        r(b, "WizardEscape");
                        e.frameCounters.wizardEscaped = Math.round(b.scanFPS * 4.4);
                        e.closeTeleport(0);
                    } else {
                        r(b, "Death");
                    }
                    return;
                }
            } else {
                g = !1;
                for (h = 0; 2 > h; h++) {
                    if ("alive" == e.players[h].status && y(e.players[h].x, e.players[h].y, 18, 18, this.x, this.y, this.bw, this.bh)) {
                        g = !0;
                        e.players[h].status = "dead";
                        e.players[h].bullet = !1;
                        if ("wizardOfWor" == this.owner.type) {
                            e.radarText = "ESCAPED";
                            this.owner.status = "died";
                            r(b, "WizardEscape");
                            e.frameCounters.wizardEscaped = Math.round(b.scanFPS * 4.4);
                            e.players[h].lives--;
                        }
                    }
                }
                if (g) {
                    "wizardOfWor" != this.owner.type && "worluk" != this.owner.type && r(b, "Death");
                    this.owner.bullet = !1;
                    return;
                }
            }

            if ("player" == this.owner.type) {
                if (b.scanFrameCounter % 2) return;
            } else if (b.scanFrameCounter % 4) return;

            switch (this.d) {
                case "up": this.y -= 8; break;
                case "right": this.x += 8; break;
                case "down": this.y += 8; break;
                case "left": this.x -= 8;
            }

            if (2 > this.y || 134 < this.y || 34 > this.x || 285 < this.x) {
                this.owner.bullet = !1;
            } else {
                for (h = 0; h < e.innerWalls.length; h++) {
                    g = e.innerWalls[h];
                    if (g.col == this.col && y(this.x, this.y, 2, 8, g.x, g.y, g.w, g.h) || g.row == this.row && y(this.x, this.y, 8, 2, g.x, g.y, g.w, g.h)) {
                        this.owner.bullet = !1;
                        break;
                    }
                }
            }
        }
    }
}
