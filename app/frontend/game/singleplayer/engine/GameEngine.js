import { m } from '../../shared/constants.js';
import { Bullet } from '../entities/Bullet.js';
import { Monster } from '../entities/Monster.js';
import { Player } from '../entities/Player.js';
import { q, x, t, l, v, E, r, w, z, C, u, H } from '../../shared/utils.js';

export class GameEngine {
    constructor(app) {
        this.app = app;
        this.scene = "title";
        this.restartLoopSounds = this.paused = !1;
        this.level = 0;
        this.speedSoundTempo = this.speed = 1;
        this.numOfPlayers = 2;
        this.doubleScoreNext = this.doubleScoreNow = !1;
        this.killedThorwors = this.killedBurwors = this.killedMonsters = 0;
        this.afterLastThorwor = !1;
        this.wallsH = [];
        this.wallsV = [];
        this.wallType = "blue";
        this.teleportStatus = "open";
        this.dungeonType = "easy";
        this.dungeonNumber = -1;
        this.innerWalls = [];
        this.radarText = "RADAR";
        this.radarTextColor = 2;
        this.players = [];
        this.monsters = [];
        this.borderColor = 0;
        this.frameCounters = {
            dungeon: 0, title: 0, getReady: 0, doubleScore: 0, teleport: 0,
            teleportOpenDelay: 0, worlukDeathAnimation: 0, worlukEscaped: 0,
            wizardDeathAnimation: 0, wizardEscaped: 0, gameOver: 0
        };
        this.animateSkip = {
            title: !1, enemyRoster: !1, getReady: !1, doubleScore: !1, gameOver: !1
        };
    }

    togglePause(a) {
        (this.paused = "undefined" == typeof a ? !this.paused : a) ? this.app.audio.stopAllSound(!0) : this.restartLoopSounds = !0;
    }

    resetAnimateSkips() {
        for (var a in this.animateSkip) this.animateSkip[a] = !1;
    }

    resetGame() {
        this.players[0] && (this.players[0].score = 0);
        this.players[1] && (this.players[1].score = 0);
        this.app.audio.stopAllSound();
        z(0);
        this.resetAnimateSkips();
        this.frameCounters.title = 0;
        this.scene = "title";
    }

    startNewGame(a) {
        this.app.ui.setToggler("small");
        this.level = 0;
        this.speedSoundTempo = this.speed = 1;
        this.numOfPlayers = a;
        this.doubleScoreNext = this.doubleScoreNow = !1;
        this.dungeonType = "easy";
        this.dungeonNumber = -1;
        this.players = [];
        for (var c = 0; 2 > c; c++) this.players[c] = new Player(c, this, this.app);
        1 == a && (this.players[1].status = "out", this.players[1].lives = 0);
        for (var key in this.frameCounters) this.frameCounters[key] = 0;
        this.scene = "getReady";
        z(0);
        document.dispatchEvent(new CustomEvent('swow:game-restart'));
    }

    nextDungeon() {
        this.level++;
        this.dungeonType = 7 >= this.level ? "easy" : "hard";
        if (4 == this.level || 13 <= this.level && 0 == (this.level - 13) % 6) this.dungeonType = "fix";
        if ("easy" == this.dungeonType) {
            do var a = w(12) - 1; while (a == this.dungeonNumber)
        } else if ("hard" == this.dungeonType) {
            do a = w(8) - 1; while (a == this.dungeonNumber)
        } else "fix" == this.dungeonType && (a = 4 == this.level ? 0 : 1);
        this.dungeonNumber = a;
        this.speed = this.level;
        12 < this.speed && (this.speed = 12);
        this.speedSoundTempo = Math.round(this.speed / 2);
        7 < this.speedSoundTempo && (this.speedSoundTempo = 7);
        r(this.app, "Speed" + this.speedSoundTempo, !0);
        this.parseDungeon();
        this.killedThorwors = this.killedBurwors = this.killedMonsters = 0;
        this.afterLastThorwor = !1;
        this.monsters = [];
        for (a = 0; 6 > a; a++) this.monsters[a] = new Monster("burwor", null, this, this.app);
        this.doubleScoreNow = this.doubleScoreNext ? !0 : !1;
        this.doubleScoreNext = !1;
        for (a = 0; 2 > a; a++) "out" != this.players[a].status && this.players[a].goToStartPosition();
        if (1 == this.level) this.radarText = "RADAR";
        else if (4 == this.level) this.radarText = "THE ARENA";
        else if (13 == this.level) this.radarText = "THE PIT";
        else {
            this.radarText = "DUNGEON  ";
            10 > this.level && (this.radarText += " ");
            this.radarText += this.level.toString();
        }
        this.radarTextColor = 2;
        this.openTeleport();
        this.wallType = "blue";
        this.frameCounters.dungeon = 0;
        this.scene = "dungeon";
    }

    parseDungeon() {
        var a = m.dungeons[this.dungeonType][this.dungeonNumber].split("|");
        this.wallsH = a[0].split(",");
        this.wallsV = a[1].split(",");
        this.innerWalls = [];
        for (a = 0; this.wallsH[a]; a++) {
            var c = this.wallsH[a].split("x"), f = c[0]; c = c[1];
            this.innerWalls.push({ type: "h", col: f, row: c, x: 31 + 24 * (f - 1), y: 24 * c - 2, w: 24, h: 4 })
        }
        for (a = 0; this.wallsV[a]; a++) {
            c = this.wallsV[a].split("x"), f = c[0], c = c[1],
                this.innerWalls.push({ type: "v", col: f, row: c, x: 29 + 24 * f, y: 24 * (c - 1), w: 4, h: 24 })
        }
    }

    innerWallCollision(a, c, f) {
        for (var d = 0; d < this.innerWalls.length; d++) {
            var g = this.innerWalls[d];
            if ("up" == f && "h" == g.type && a == g.col && c - 1 == g.row || "down" == f && "h" == g.type && a == g.col && c == g.row || "right" == f && "v" == g.type && c == g.row && a == g.col || "left" == f && "v" == g.type && c == g.row && a - 1 == g.col) return !0
        }
        return !1
    }

    getFreeCoordinate() {
        do {
            var a = w(11), c = w(6), f = !0;
            if (1 == a && 2 == c || 1 == a && 3 == c || 2 == a && 3 == c || 1 == a && 4 == c || 11 == a && 2 == c || 11 == a && 3 == c || 10 == a && 3 == c || 11 == a && 4 == c) f = !1;
            if (f) for (var d = 0; 2 > d; d++) if ("alive" == this.players[d].status) {
                var g = this.players[d];
                if (g.col == a || g.row == c || a == g.col - 1 && c == g.row - 1 || a == g.col + 1 && c == g.row - 1 || a == g.col - 1 && c == g.row + 1 || a == g.col + 1 && c == g.row + 1) f = !1
            }
        } while (!f);
        return { col: a, row: c }
    }

    displayScore(a, c) {
        if (1 == a) {
            t(this.app, 239, 168, 80, 8, 7);
            t(this.app, 239, 192, 80, 8, !1);
            t(this.app, 239, 176, 8, 16, !1);
            t(this.app, 311, 176, 8, 16, !1);
            v(this.app, H(c, 38), 0, 189, 7);
        } else if (2 == a) {
            t(this.app, 7, 168, 80, 8, 6);
            t(this.app, 7, 192, 80, 8, !1);
            t(this.app, 7, 176, 8, 16, !1);
            t(this.app, 79, 176, 8, 16, !1);
            v(this.app, H(c, 9), 0, 189, 6);
        }
    }

    killMonster(a) {
        this.killedMonsters++; a.status = "died";
        0 == this.killedMonsters % 4 && this.speedUp();
        if ("burwor" == a.type) {
            this.killedBurwors++;
            if (this.killedBurwors >= 7 - this.level) this.monsters.push(new Monster("garwor", null, this, this.app));
        } else if ("garwor" == a.type) {
            this.monsters.push(new Monster("thorwor", null, this, this.app));
        } else if ("thorwor" == a.type) {
            this.killedThorwors++;
            var monster_limit = 6;
            6 > this.level && (monster_limit = 6 - (6 - this.level));
            if (this.killedThorwors >= monster_limit) {
                this.afterLastThorwor = !0;
                if (1 == this.level) this.endDungeon();
                else {
                    this.closeTeleport(5);
                    this.monsters.push(new Monster("worluk", null, this, this.app));
                    this.radarText = " WORLUK"; this.radarTextColor = 7;
                    this.speed = 14; this.wallType = "worluk";
                    this.app.audio.stopAllSound();
                    r(this.app, "Worluk", !0);
                }
            }
        } else if ("worluk" == a.type) {
            this.doubleScoreNext = !0; this.radarText = "DOUBLE  SCORE"; this.radarTextColor = 7;
            this.app.audio.stop("Worluk"); r(this.app, "WorlukDeath");
            if (!this.wizardOfWor()) { this.wallType = "red"; this.frameCounters.worlukDeathAnimation = u(this.app, 4.4); this.closeTeleport(0) }
        } else if ("wizardOfWor" == a.type) {
            this.doubleScoreNext = !0; this.radarText = "DOUBLE  SCORE"; this.radarTextColor = 7;
            this.wallType = "wizardOfWor"; r(this.app, "WizardDeath");
            this.frameCounters.wizardDeathAnimation = u(this.app, 5)
        }
    }

    closeTeleport(a) {
        this.teleportStatus = "close"; this.frameCounters.teleport = 0; this.frameCounters.teleportOpenDelay = u(this.app, a)
    }

    openTeleport() {
        this.teleportStatus = "open"; this.frameCounters.teleport = 0; this.frameCounters.teleportOpenDelay = 0
    }

    afterWorluk() {
        for (var a = 0; a < this.monsters.length; a++) if ("worluk" == this.monsters[a].type) return !0;
        return !1
    }

    wizardOfWor() {
        return 1 == w(7) ? (this.speed = 12, this.wallType = "blue", this.openTeleport(), this.radarText = "WIZARD OF WOR", this.radarTextColor = 7, this.monsters.push(new Monster("wizardOfWor", null, this, this.app)), !0) : !1
    }

    endDungeon(a) {
        this.app.audio.stopAllSound();
        6 < this.level && (this.radarText = "WORLORD");
        this.frameCounters.getReady = 0; this.scene = "getReady";
    }

    subscribeToToplist(a) {
        if (!a) return !1;
        for (var i = 5; 1 <= i; i--) {
            var p = this.app.options.highScores[i - 1];
            if (a >= p) this.app.options.highScores[i] = p, 1 == i && (this.app.options.highScores[0] = a);
            else { this.app.options.highScores[i] = a; break }
        }
        this.app.options.highScores[5] = null;
        this.app.options.highScores.pop();
        localStorage.setItem("highScores", this.app.options.highScores.join(","))
    }

    animationRoutine() {
        if ("title" == this.scene) this.animateTitle();
        else if ("enemyRoster" == this.scene) this.animateEnemyRoster();
        else if ("getReady" == this.scene) this.animateGetReady();
        else if ("doubleScore" == this.scene) this.animateDoubleScore();
        else if ("dungeon" == this.scene) this.animateDungeon();
        else if ("gameOver" == this.scene) this.animateGameOver();
        "none" != this.app.options.visualFilter && this.visualFilter()
    }

    scanRoutine() {
        if (!0 === this.restartLoopSounds) {
            this.restartLoopSounds = !1;
            if ("dungeon" == this.scene) {
                if (!this.afterLastThorwor) r(this.app, "Speed" + this.speedSoundTempo, !0);
                else if ("worluk" == this.wallType) r(this.app, "Worluk", !0);
            }
        }
        if ("title" == this.scene || "enemyRoster" == this.scene) this.scanTitle();
        else if ("getReady" == this.scene) this.scanGetReady();
        else if ("doubleScore" == this.scene) this.scanDoubleScore();
        else if ("dungeon" == this.scene) this.scanDungeon();
        else if ("gameOver" == this.scene) this.scanGameOver();
    }

    animateTitle() {
        if (!this.animateSkip.title) {
            this.animateSkip.title = !0; E(this.app);
            v(this.app, "WIZARD OF WOR  REMAKE", 79, 29, 14);
            v(this.app, "1: ONE PLAYER", 111, 180, 7);
            v(this.app, "2: TWO PLAYER", 111, 196, 14);
            v(this.app, "HIGH SCORES", 119, 61, 10);
            for (var a = 0; 5 > a; a++) v(this.app, H(this.app.options.highScores[a], 23), 0, 85 + 16 * a, 14);
            this.displayScore(1, this.players[0] ? this.players[0].score : 0);
            this.displayScore(2, this.players[1] ? this.players[1].score : 0)
        }
    }

    animateEnemyRoster() {
        if (!this.animateSkip.enemyRoster) {
            this.animateSkip.enemyRoster = !0; E(this.app);
            v(this.app, "BURWOR      100  POINTS", 71, 21, 14);
            v(this.app, "WORRIOR     1000  POINTS", 63, 93, 14);
            v(this.app, "GARWOR      200  POINTS", 71, 45, 7);
            v(this.app, "WORRIOR     1000  POINTS", 63, 117, 7);
            v(this.app, "WIZARD OF WOR     2500  POINTS", 15, 181, 7);
            v(this.app, "THORWOR      500  POINTS", 63, 69, 10);
            v(this.app, "WORLUK     1000  POINTS", 71, 141, 10);
            v(this.app, "DOUBLE SCORE", 159, 157, 10);
            var a = m.sprite.burwor.left[2]; l(this.app, a.x, a.y, 18, 18, 130, 6);
            a = m.sprite.garwor.left[0]; l(this.app, a.x, a.y, 18, 18, 129, 30);
            a = m.sprite.thorwor.left[0]; l(this.app, a.x, a.y, 18, 18, 130, 54);
            a = m.sprite.enemyRosterPlayer2; l(this.app, a.x, a.y, 18, 18, 130, 78);
            a = m.sprite.players[0].left[2]; l(this.app, a.x, a.y, 18, 18, 130, 102);
            a = m.sprite.worluk[0]; l(this.app, a.x, a.y, 18, 18, 129, 126);
            a = m.sprite.wizardOfWor.left[2]; l(this.app, a.x, a.y, 18, 18, 130, 166)
        }
    }

    animateGetReady() {
        if (!this.animateSkip.getReady) {
            this.animateSkip.getReady = !0;
            0 == this.level ? E(this.app) : this.animateDungeon();
            C(this.app, 0);
            for (var a = 0; 3 > a; a++) t(this.app, 31 + 32 * a, 48, 24, 40, !1);
            for (a = 0; 5 > a; a++) t(this.app, 143 + 32 * a, 48, 24, 40, !1);
            a = m.sprite.texts.get; l(this.app, a.x, a.y, a.w, a.h, 31, 50);
            a = m.sprite.texts.ready; l(this.app, a.x, a.y, a.w, a.h, 143, 50);
            this.frameCounters.getReady >= u(this.app, 1.2) && (t(this.app, 135, 96, 24, 40, !1), t(this.app, 167, 96, 24, 40, !1), a = m.sprite.texts.go, l(this.app, a.x, a.y, a.w, a.h, 135, 98))
        }
    }

    animateGameOver() {
        if (!this.animateSkip.gameOver) {
            this.animateSkip.gameOver = !0; this.animateDungeon(); C(this.app, 0);
            for (var a = 0; 4 > a; a++) t(this.app, 23 + 32 * a, 56, 24, 40, !1);
            for (a = 0; 4 > a; a++) t(this.app, 191 + 32 * a, 56, 24, 40, !1);
            a = m.sprite.texts.game; l(this.app, a.x, a.y, a.w, a.h, 23, 58);
            a = m.sprite.texts.over; l(this.app, a.x, a.y, a.w, a.h, 191, 58)
        }
        // Blinking "PRESS FIRE" hint (outside skip guard so it updates each frame)
        if (this.frameCounters.gameOver >= u(this.app, 1.5)) {
            t(this.app, 104, 108, 112, 12, 0);
            if (Math.floor(this.app.animationFrameCounter / 30) % 2) {
                v(this.app, "PRESS FIRE", 120, 110, 7);
            }
        }
    }

    animateDoubleScore() {
        if (!this.animateSkip.doubleScore) {
            this.animateSkip.doubleScore = !0; E(this.app);
            if (this.doubleScoreNext) {
                var a = m.sprite.texts["double"]; l(this.app, a.x, a.y, a.w, a.h, 71, 2);
                a = m.sprite.texts.score; l(this.app, a.x, a.y, a.w, a.h, 87, 50);
                a = m.sprite.texts.dungeon; l(this.app, a.x, a.y, a.w, a.h, 55, 98)
            }
            if (3 == this.level || 12 == this.level) {
                v(this.app, "BONUS  PLAYER", 110, 173, 7);
                "out" != this.players[0].status && (a = m.sprite.players[0].left[2], l(this.app, a.x, a.y, 18, 18, 235, 164));
                "out" != this.players[1].status && (a = m.sprite.players[1].right[2], l(this.app, a.x, a.y, 18, 18, 73, 164));
            }
        }
    }

    animateDungeon() {
        const b = this.app;
        t(b, 0, 0, 320, 200, this.borderColor);
        if (!("wizardOfWor" == this.wallType && 30 < b.animationFrameCounter % 40)) {
            var a = m.sprite.walls[this.wallType], c = 0;
            if ("worluk" != this.wallType || !(0 < this.frameCounters.worlukEscaped || "gameOver" == this.scene)) {
                var f = b.animationFrameCounter % 6; 3 < f ? c = 2 : 1 < f && (c = 1)
            }
            f = void 0 === a.h.length ? a.h : a.h[c];
            a = void 0 === a.v.length ? a.v : a.v[c];
            l(b, a.x, a.y, 4, 24, 29, 0); l(b, a.x, a.y, 4, 24, 29, 24); l(b, a.x, a.y, 4, 24, 29, 72); l(b, a.x, a.y, 4, 24, 29, 96); l(b, a.x, a.y, 4, 24, 29, 120);
            l(b, a.x, a.y, 4, 24, 293, 0); l(b, a.x, a.y, 4, 24, 293, 24); l(b, a.x, a.y, 4, 24, 293, 72); l(b, a.x, a.y, 4, 24, 293, 96); l(b, a.x, a.y, 4, 24, 293, 120);
            for (c = 0; 11 > c; c++) l(b, f.x, f.y, 24, 2, 29 + 24 * c, 0);
            for (c = 0; 11 > c; c++) l(b, f.x, f.y, 24, 2, 29 + 24 * c, 142);
            for (c = 0; this.innerWalls[c]; c++) {
                var d = this.innerWalls[c];
                "h" == d.type ? l(b, f.x, f.y, 24, 4, d.x, d.y) : "v" == d.type && l(b, a.x, a.y, 4, 24, d.x, d.y)
            }
            l(b, f.x, f.y, 24, 4, 8, 46); l(b, f.x, f.y, 24, 4, 8, 70); l(b, f.x, f.y, 24, 4, 295, 46); l(b, f.x, f.y, 24, 4, 295, 70);
            if ("close" == this.teleportStatus) {
                c = m.sprite.teleport.wallClose; l(b, c.x, c.y, c.w, c.h, 27, 50); l(b, c.x, c.y, c.w, c.h, 299, 50);
            } else {
                c = m.sprite.teleport.wallOpen; d = m.sprite.teleport.arrows.left; var g = m.sprite.teleport.arrows.right;
                l(b, c.x, c.y, c.w, c.h, 27, 50); l(b, d.x, d.y, d.w, d.h, 7, 56); l(b, c.x, c.y, c.w, c.h, 299, 50); l(b, g.x, g.y, g.w, g.h, 311, 56)
            }
            t(b, 27, 49, 2, 1, this.borderColor); t(b, 299, 49, 2, 1, !1); t(b, 27, 70, 2, 1, !1); t(b, 299, 70, 2, 1, !1);
            l(b, a.x, a.y, 2, 24, 269, 144); l(b, a.x, a.y, 2, 24, 295, 144);
            "wait" != this.players[0].status && "enter" != this.players[0].status || t(b, 271, 142, 22, 2, !1);
            l(b, a.x, a.y, 2, 24, 29, 144); l(b, a.x, a.y, 2, 24, 55, 144);
            "wait" != this.players[1].status && "enter" != this.players[1].status || t(b, 33, 142, 22, 2, !1);
            d = m.sprite.players[0].left[2];
            (1 < this.players[0].lives || 1 == this.players[0].lives && "wait" == this.players[0].status) && l(b, d.x, d.y, 18, 18, 274, 147);
            var lives_c = this.players[0].lives - 1; "wait" != this.players[0].status && lives_c--;
            for (c = 0; c < lives_c; c++) l(b, d.x, d.y, 18, 18, 301, 147 - 24 * c);
            d = m.sprite.players[1].right[2];
            (1 < this.players[1].lives || 1 == this.players[1].lives && "wait" == this.players[1].status) && l(b, d.x, d.y, 18, 18, 34, 147);
            lives_c = this.players[1].lives - 1; "wait" != this.players[1].status && lives_c--;
            for (c = 0; c < lives_c; c++) l(b, d.x, d.y, 18, 18, 7, 147 - 24 * c);
            if ("wait" == this.players[0].status) {
                c = Math.floor(this.players[0].frameCounters.entering / b.scanFPS); if (9 > c && 0 < c) v(b, c, 247, 165, 7);
            }
            if ("wait" == this.players[1].status) {
                c = Math.floor(this.players[1].frameCounters.entering / b.scanFPS); if (9 > c && 0 < c) v(b, c, 71, 165, 6);
            }
            this.players[0].animationRoutine(); this.players[1].animationRoutine();
            this.players[0].bullet && this.players[0].bullet.animationRoutine();
            this.players[1].bullet && this.players[1].bullet.animationRoutine();
            for (c = 0; c < this.monsters.length; c++) this.monsters[c].bullet && this.monsters[c].bullet.animationRoutine();
            for (c = 0; c < this.monsters.length; c++) this.monsters[c].animationRoutine();
            l(b, a.x, a.y, 2, 24, 117, 152); l(b, a.x, a.y, 2, 24, 117, 176); l(b, a.x, a.y, 2, 24, 207, 152); l(b, a.x, a.y, 2, 24, 207, 176);
            for (c = 0; 3 > c; c++) l(b, f.x, f.y, 24, 2, 119 + 24 * c, 150);
            l(b, f.x, f.y, 24, 2, 183, 150);
            v(b, this.radarText, 160 - 4 * this.radarText.length, 152, this.radarTextColor, "c64", this.borderColor);
            t(b, 119, 152, 88, 48, this.borderColor);
            for (c = 0; c < this.monsters.length; c++) if (f = this.monsters[c], "died" != f.status) {
                if ("alive" == f.status) {
                    if ("burwor" == f.type) var h = 6; else if ("garwor" == f.type) h = 7; else if ("thorwor" == f.type) h = 2; else continue;
                } else if ("shooted" == f.status) switch (w(4)) { case 1: h = 1; break; case 2: h = 4; break; case 3: h = 13; break; case 4: h = 15 }
                t(b, 120 + 8 * (f.getCol() - 1), 153 + 8 * (f.getRow() - 1), 6, 6, h)
            }
            this.displayScore(1, this.players[0].score); this.displayScore(2, this.players[1].score)
        }
    }

    scanTitle() {
        const b = this.app;
        this.frameCounters.title++;
        if (this.frameCounters.title > u(b, 13)) { this.frameCounters.title = 0; this.animateSkip.title = !1; this.scene = "title" }
        else if (this.frameCounters.title == u(b, 7)) { this.scene = "enemyRoster"; this.animateSkip.enemyRoster = !1; }
        if (!0 === b.getControls(0).fire) this.startNewGame(1);
        else if (!0 === b.getControls(1).fire) this.startNewGame(2);
        if (!0 === b.pressedKeys[49]) { b.setPressedKeyHold(49); this.startNewGame(1) }
        else if (!0 === b.pressedKeys[50]) { b.setPressedKeyHold(50); this.startNewGame(2) }
    }

    scanGetReady() {
        this.frameCounters.getReady++;
        if (1 == this.frameCounters.getReady) { this.animateSkip.getReady = !1; r(this.app, "GetReady") }
        else if (this.frameCounters.getReady == u(this.app, 1.2)) this.animateSkip.getReady = !1;
        else if (this.frameCounters.getReady > u(this.app, 4)) { this.frameCounters.doubleScore = 0; this.scene = "doubleScore" }
    }

    scanGameOver() {
        const b = this.app;
        this.frameCounters.gameOver++;
        if (1 == this.frameCounters.gameOver) {
            this.animateSkip.gameOver = !1;
            if (0 < this.players[0].score) this.subscribeToToplist(this.players[0].score);
            if (1 < this.numOfPlayers && 0 < this.players[1].score) this.subscribeToToplist(this.players[1].score);
        }
        // Allow quick restart after a brief display (1.5s)
        if (this.frameCounters.gameOver >= u(b, 1.5)) {
            if (!0 === b.getControls(0).fire || !0 === b.pressedKeys[49]) {
                this.startNewGame(1); return;
            }
            if (!0 === b.getControls(1).fire || !0 === b.pressedKeys[50]) {
                this.startNewGame(this.numOfPlayers); return;
            }
        }
        // Auto-return to title after 4 seconds
        if (this.frameCounters.gameOver >= u(b, 4)) {
            this.frameCounters.title = 0; this.animateSkip.title = !1; this.animateSkip.enemyRoster = !1; this.scene = "title"; b.ui.setToggler("full")
        }
    }

    scanDoubleScore() {
        this.frameCounters.doubleScore++;
        if (1 == this.frameCounters.doubleScore) {
            this.animateSkip.doubleScore = !1;
            if (!this.doubleScoreNext && 3 != this.level && 12 != this.level) { this.frameCounters.doubleScore = 0; this.nextDungeon(); return }
            if (this.doubleScoreNext) r(this.app, "Doublescore");
            if (3 == this.level || 12 == this.level) {
                if ("out" != this.players[0].status) this.players[0].lives++;
                if ("out" != this.players[1].status) this.players[1].lives++;
            }
        }
        if (this.frameCounters.doubleScore >= u(this.app, 4.9)) { this.frameCounters.doubleScore = 0; this.nextDungeon() }
    }

    speedUp() {
        if (!(this.afterLastThorwor || 16 <= this.speed)) {
            this.speed++; var a = Math.round(this.speed / 2); 7 < a && (a = 7);
            if (a != this.speedSoundTempo) { this.app.audio.stop("Speed" + this.speedSoundTempo); this.speedSoundTempo = a; r(this.app, "Speed" + a, !0) }
        }
    }

    gameOver() {
        this.app.audio.stopAllSound(); r(this.app, "GameOver");
        this.frameCounters.gameOver = 0; this.scene = "gameOver";
        // Notify platform with final scores
        const p1Score = this.players[0].score;
        const p2Score = this.numOfPlayers > 1 ? this.players[1].score : 0;
        const topScore = Math.max(p1Score, p2Score);
        const prevHigh = this.app.options.highScores[0] || 0;
        document.dispatchEvent(new CustomEvent('swow:game-over', {
            detail: { p1Score, p2Score, numPlayers: this.numOfPlayers, isNewHigh: topScore > prevHigh, wave: this.level }
        }));
    }

    scanDungeon() {
        const b = this.app;
        this.frameCounters.dungeon++;
        if (0 < this.frameCounters.worlukDeathAnimation) {
            this.frameCounters.worlukDeathAnimation--;
            if (0 >= this.frameCounters.worlukDeathAnimation) { this.wallType = "blue"; z(0); this.endDungeon() }
            else { var a = this.frameCounters.worlukDeathAnimation % 16, c = 0; 11 < a ? c = 6 : 7 < a ? c = 0 : 3 < a && (c = 2); z(c) }
        } else if (0 < this.frameCounters.worlukEscaped) {
            this.frameCounters.worlukEscaped--;
            if (0 >= this.frameCounters.worlukEscaped) {
                if ("dead" == this.players[0].status) this.players[0].lives--;
                if ("dead" == this.players[1].status) this.players[1].lives--;
                if (1 > this.players[0].lives) this.players[0].status = "out";
                if (1 > this.players[1].lives) this.players[1].status = "out";
                if ("out" == this.players[0].status && "out" == this.players[1].status) { this.wallType = "red"; z(0); this.gameOver() }
                else { this.wallType = "blue"; if (("alive" != this.players[0].status && "alive" != this.players[1].status || !this.wizardOfWor())) this.endDungeon() }
            }
        } else if (0 < this.frameCounters.wizardEscaped) {
            this.frameCounters.wizardEscaped--;
            if (0 >= this.frameCounters.wizardEscaped) {
                if (!this.players[0].lives) this.players[0].status = "out";
                if (!this.players[1].lives) this.players[1].status = "out";
                if ("out" == this.players[0].status && "out" == this.players[1].status) { this.wallType = "red"; z(0); this.gameOver() }
                else { this.wallType = "blue"; this.endDungeon() }
            } else { a = this.frameCounters.wizardEscaped % 16; c = 0; 11 < a ? c = 6 : 7 < a ? c = 0 : 3 < a && (c = 2); this.wallType = "red"; z(c); }
        } else if (0 < this.frameCounters.wizardDeathAnimation) {
            this.frameCounters.wizardDeathAnimation--; if (0 >= this.frameCounters.wizardDeathAnimation) { this.wallType = "blue"; this.endDungeon() }
        } else {
            if (0 == this.frameCounters.dungeon % u(b, 25)) this.speedUp();
            for (a = 0; a < this.monsters.length; a++) this.monsters[a].scanRoutine();
            this.players[0].scanRoutine(); this.players[1].scanRoutine();
            this.players[0].bullet && this.players[0].bullet.scanRoutine();
            this.players[1].bullet && this.players[1].bullet.scanRoutine();
            for (a = 0; a < this.monsters.length; a++) this.monsters[a].bullet && this.monsters[a].bullet.scanRoutine();
            if (0 < this.frameCounters.teleportOpenDelay) { this.frameCounters.teleport++; if (this.frameCounters.teleport >= this.frameCounters.teleportOpenDelay) this.openTeleport() }
        }
    }

    visualFilter() {
        this.clearVisualFilter();
        const b = this.app;
        if ("scanlines" == b.options.visualFilter) this.visualFilterHorizontalLines();
        else if ("bwTv" == b.options.visualFilter) {
            this.visualFilterHorizontalLines(); b.visualFilterContext.globalAlpha = .5; this.visualFilterNoise(); b.visualFilterContext.globalAlpha = 1
        } else if ("colorTv" == b.options.visualFilter) {
            b.visualFilterContext.globalAlpha = .5; this.visualFilterNoise(); b.visualFilterContext.globalAlpha = 1
        } else if ("greenC64monitor" == b.options.visualFilter) this.visualFilterHorizontalLines()
    }

    clearVisualFilter() {
        this.app.visualFilterContext.clearRect(0, 0, this.app.visualFilter.width, this.app.visualFilter.height)
    }

    visualFilterHorizontalLines() {
        const b = this.app;
        b.visualFilterContext.fillStyle = "#" + m.colors[b.options.palette][0];
        for (var a = 0; a < b.visualFilter.height; a += 3) b.visualFilterContext.fillRect(0, a, b.visualFilter.width, 1)
    }

    visualFilterNoise() {
        const b = this.app;
        for (var a = -Math.floor(120 * Math.random()), c = -Math.floor(120 * Math.random()); c < b.visualFilter.height; c += 384)
            for (var f = a; f < b.visualFilter.width; f += 384)
                b.visualFilterContext.drawImage(q("crtNoise"), 0, 0, 128, 128, f, c, 384, 384)
    }
}
