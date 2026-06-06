import { m } from '../../shared/constants.js';
import { q, t, l, v, E, z, H } from '../../shared/utils.js';

const SCALE = 3;

export class GameCanvas {
    constructor(canvasEl, spriteCanvas, options) {
        this.canvas = canvasEl.getContext('2d');
        this.canvas.imageSmoothingEnabled = false;
        this.sprite = spriteCanvas;
        this.scale = SCALE;
        this.options = options;  // { palette, visualFilter }
        this.lastColor = null;

        // Visual filter canvas
        this.visualFilter = q('visualFilterLayer');
        this.visualFilterContext = this.visualFilter.getContext('2d');
        this.visualFilterContext.imageSmoothingEnabled = false;

        this._setupResize(canvasEl);
    }

    _setupResize(canvasEl) {
        this._canvasEl = canvasEl;
        window.onresize = () => {
            const border = q('border');
            let fw = border.offsetWidth, fh = border.offsetHeight;
            let pad = 0;
            if (fw > 320 * SCALE && fh > 200 * SCALE) { pad = 100; fw -= pad; fh -= pad; }
            const sc = Math.min(fw / canvasEl.width, fh / canvasEl.height);
            canvasEl.style.transform = `scale(${sc})`;
            const ml = Math.round((fw - 320 * SCALE * sc) / 2) + pad / 2;
            const mt = Math.round((fh - 200 * SCALE * sc) / 2) + pad / 2;
            canvasEl.style.margin = `${mt}px ${ml}px 0 ${ml}px`;
            this.visualFilter.width = window.innerWidth;
            this.visualFilter.height = window.innerHeight;
        };
        window.onresize();
    }

    render(state) {
        if (!state) return;
        // Reset animateSkip every frame so all dynamic scenes redraw
        for (const k in state.animateSkip) state.animateSkip[k] = false;

        const app = this;  // utils expect an 'app-like' object
        const scene = state.scene;

        if ('dungeon' === scene) this._drawDungeon(app, state);
        else if ('getReady' === scene) { this._drawDungeon(app, state); this._drawGetReady(app, state); }
        else if ('gameOver' === scene) { this._drawDungeon(app, state); this._drawGameOver(app, state); }
        else if ('doubleScore' === scene) this._drawDoubleScore(app, state);
        else if ('title' === scene || 'enemyRoster' === scene) this._drawTitle(app, state, scene);

        this._drawVisualFilter(state);
    }

    // ─── Scene Draws (mirrors GameEngine.animate* but data-driven) ──────────

    _drawTitle(app, state, scene) {
        if (scene === 'title') {
            E(app);
            v(app, 'WIZARD OF WOR  REMAKE', 79, 29, 14);
            v(app, '1: ONE PLAYER', 111, 180, 7);
            v(app, '2: TWO PLAYER', 111, 196, 14);
            v(app, 'HIGH SCORES', 119, 61, 10);
            const p0 = state.players[0], p1 = state.players[1];
            this._displayScore(app, 1, p0 ? p0.score : 0);
            this._displayScore(app, 2, p1 ? p1.score : 0);
        } else {
            // enemyRoster
            E(app);
            v(app, 'BURWOR      100  POINTS', 71, 21, 14);
            v(app, 'GARWOR      200  POINTS', 71, 45, 7);
            v(app, 'THORWOR      500  POINTS', 63, 69, 10);
            v(app, 'WORRIOR     1000  POINTS', 63, 93, 14);
            v(app, 'WORRIOR     1000  POINTS', 63, 117, 7);
            v(app, 'WORLUK     1000  POINTS', 71, 141, 10);
            v(app, 'DOUBLE SCORE', 159, 157, 10);
            v(app, 'WIZARD OF WOR     2500  POINTS', 15, 181, 7);
            let a = m.sprite.burwor.left[2]; l(app, a.x, a.y, 18, 18, 130, 6);
            a = m.sprite.garwor.left[0]; l(app, a.x, a.y, 18, 18, 129, 30);
            a = m.sprite.thorwor.left[0]; l(app, a.x, a.y, 18, 18, 130, 54);
            a = m.sprite.enemyRosterPlayer2; l(app, a.x, a.y, 18, 18, 130, 78);
            a = m.sprite.players[0].left[2]; l(app, a.x, a.y, 18, 18, 130, 102);
            a = m.sprite.worluk[0]; l(app, a.x, a.y, 18, 18, 129, 126);
            a = m.sprite.wizardOfWor.left[2]; l(app, a.x, a.y, 18, 18, 130, 166);
        }
    }

    _drawGetReady(app, state) {
        this.canvas.fillStyle = '#' + m.colors[this.options.palette][0];
        const fc = state.frameCounters.getReady;
        for (let a = 0; a < 3; a++) { t(app, 31 + 32 * a, 48, 24, 40, false); }
        for (let a = 0; a < 5; a++) { t(app, 143 + 32 * a, 48, 24, 40, false); }
        let a = m.sprite.texts.get; l(app, a.x, a.y, a.w, a.h, 31, 50);
        a = m.sprite.texts.ready; l(app, a.x, a.y, a.w, a.h, 143, 50);
        if (fc >= Math.round(50 * 1.2)) {
            t(app, 135, 96, 24, 40, false); t(app, 167, 96, 24, 40, false);
            a = m.sprite.texts.go; l(app, a.x, a.y, a.w, a.h, 135, 98);
        }
    }

    _drawGameOver(app, state) {
        this.canvas.fillStyle = '#' + m.colors[this.options.palette][0];
        for (let a = 0; a < 4; a++) { t(app, 23 + 32 * a, 56, 24, 40, false); t(app, 191 + 32 * a, 56, 24, 40, false); }
        let a = m.sprite.texts.game; l(app, a.x, a.y, a.w, a.h, 23, 58);
        a = m.sprite.texts.over; l(app, a.x, a.y, a.w, a.h, 191, 58);
    }

    _drawDoubleScore(app, state) {
        E(app);
        if (state.doubleScoreNext) {
            let a = m.sprite.texts['double']; l(app, a.x, a.y, a.w, a.h, 71, 2);
            a = m.sprite.texts.score; l(app, a.x, a.y, a.w, a.h, 87, 50);
            a = m.sprite.texts.dungeon; l(app, a.x, a.y, a.w, a.h, 55, 98);
        }
        if (3 === state.level || 12 === state.level) {
            v(app, 'BONUS  PLAYER', 110, 173, 7);
            const p0 = state.players[0], p1 = state.players[1];
            if (p0 && 'out' !== p0.status) { const a = m.sprite.players[0].left[2]; l(app, a.x, a.y, 18, 18, 235, 164); }
            if (p1 && 'out' !== p1.status) { const a = m.sprite.players[1].right[2]; l(app, a.x, a.y, 18, 18, 73, 164); }
        }
    }

    _drawDungeon(app, state) {
        const borderColor = state.borderColor || 0;
        t(app, 0, 0, 320, 200, borderColor);

        if ('wizardOfWor' === state.wallType && 30 < state.animationFrameCounter % 40) return;

        const walls = m.sprite.walls[state.wallType] || m.sprite.walls.blue;
        let frameIdx = 0;
        const af = state.animationFrameCounter % 6;
        if (af > 3) frameIdx = 2; else if (af > 1) frameIdx = 1;

        const fSprite = walls.h && walls.h.length !== undefined ? walls.h[frameIdx] : walls.h;
        const vSprite = walls.v && walls.v.length !== undefined ? walls.v[frameIdx] : walls.v;

        // Outer walls (vertical segments)
        for (let i = 0; i < 5; i++) {
            const yOff = [0, 24, 72, 96, 120][i];
            l(app, vSprite.x, vSprite.y, 4, 24, 29, yOff);
            l(app, vSprite.x, vSprite.y, 4, 24, 293, yOff);
        }
        // Top/bottom border lines
        for (let c = 0; c < 11; c++) {
            l(app, fSprite.x, fSprite.y, 24, 2, 29 + 24 * c, 0);
            l(app, fSprite.x, fSprite.y, 24, 2, 29 + 24 * c, 142);
        }
        // Inner walls
        for (let i = 0; i < state.innerWalls.length; i++) {
            const iw = state.innerWalls[i];
            if ('h' === iw.type) l(app, fSprite.x, fSprite.y, 24, 4, iw.x, iw.y);
            else l(app, vSprite.x, vSprite.y, 4, 24, iw.x, iw.y);
        }
        // Score area border
        l(app, fSprite.x, fSprite.y, 24, 4, 8, 46); l(app, fSprite.x, fSprite.y, 24, 4, 8, 70);
        l(app, fSprite.x, fSprite.y, 24, 4, 295, 46); l(app, fSprite.x, fSprite.y, 24, 4, 295, 70);

        // Teleport walls
        if ('close' === state.teleportStatus) {
            const c = m.sprite.teleport.wallClose;
            l(app, c.x, c.y, c.w, c.h, 27, 50); l(app, c.x, c.y, c.w, c.h, 299, 50);
        } else {
            const c = m.sprite.teleport.wallOpen;
            const dl = m.sprite.teleport.arrows.left;
            const dr = m.sprite.teleport.arrows.right;
            l(app, c.x, c.y, c.w, c.h, 27, 50);  l(app, dl.x, dl.y, dl.w, dl.h, 7, 56);
            l(app, c.x, c.y, c.w, c.h, 299, 50); l(app, dr.x, dr.y, dr.w, dr.h, 311, 56);
        }
        t(app, 27, 49, 2, 1, borderColor); t(app, 299, 49, 2, 1, false);
        t(app, 27, 70, 2, 1, false);       t(app, 299, 70, 2, 1, false);

        // Side life/score walls
        l(app, vSprite.x, vSprite.y, 2, 24, 269, 144); l(app, vSprite.x, vSprite.y, 2, 24, 295, 144);
        l(app, vSprite.x, vSprite.y, 2, 24, 29, 144);  l(app, vSprite.x, vSprite.y, 2, 24, 55, 144);

        // Players
        for (const p of state.players) {
            if (!p || 'out' === p.status || 'wait' === p.status) continue;
            if (0 < state.frameCounters.wizardEscaped) continue;
            this._drawPlayer(app, p, state.animationFrameCounter);
        }

        // Player life icons
        const p0 = state.players[0], p1 = state.players[1];
        if (p0 && 'wait' !== p0.status && 'enter' !== p0.status) {
            t(app, 271, 142, 22, 2, false);
        }
        if (p1 && 'wait' !== p1.status && 'enter' !== p1.status) {
            t(app, 33, 142, 22, 2, false);
        }
        if (p0) {
            const d0 = m.sprite.players[0].left[2];
            const livesToShow = p0.lives - ('wait' !== p0.status ? 1 : 0);
            if (p0.lives > 1 || 'wait' === p0.status) l(app, d0.x, d0.y, 18, 18, 274, 147);
            for (let c = 0; c < livesToShow - 1; c++) l(app, d0.x, d0.y, 18, 18, 301, 147 - 24 * c);
        }
        if (p1) {
            const d1 = m.sprite.players[1].right[2];
            const livesToShow = p1.lives - ('wait' !== p1.status ? 1 : 0);
            if (p1.lives > 1 || 'wait' === p1.status) l(app, d1.x, d1.y, 18, 18, 34, 147);
            for (let c = 0; c < livesToShow - 1; c++) l(app, d1.x, d1.y, 18, 18, 7, 147 - 24 * c);
        }

        // Monsters
        for (const monster of state.monsters) {
            if ('died' === monster.status || 'escaped' === monster.status || !monster.visible) continue;
            this._drawMonster(app, monster, state.animationFrameCounter);
        }

        // Bullets: bw===2 means the bullet is vertically oriented (thin on x), bh===2 is horizontal
        for (const b of state.bullets) {
            const bg = m.sprite.bullets;
            const bSprite = 'player' === b.ownerType ? bg.player : bg.monster;
            const bSpr = (b.bw === 2) ? bSprite.v : bSprite.h;
            l(app, bSpr.x, bSpr.y, bSpr.w, bSpr.h, b.x, b.y);
        }

        // Radar panel
        l(app, vSprite.x, vSprite.y, 2, 24, 117, 152); l(app, vSprite.x, vSprite.y, 2, 24, 117, 176);
        l(app, vSprite.x, vSprite.y, 2, 24, 207, 152); l(app, vSprite.x, vSprite.y, 2, 24, 207, 176);
        for (let c = 0; c < 3; c++) l(app, fSprite.x, fSprite.y, 24, 2, 119 + 24 * c, 150);
        l(app, fSprite.x, fSprite.y, 24, 2, 183, 150);
        const radarText = state.radarText || 'RADAR';
        v(app, radarText, 160 - 4 * radarText.length, 152, state.radarTextColor || 2, 'c64', borderColor);
        t(app, 119, 152, 88, 48, borderColor);
        // Monster radar blips: colour index corresponds to C64 palette entry
        for (const monster of state.monsters) {
            if ('died' === monster.status) continue;
            let colorIdx;
            if ('alive' === monster.status) {
                if ('burwor' === monster.type)       colorIdx = 6;
                else if ('garwor' === monster.type)  colorIdx = 7;
                else if ('thorwor' === monster.type) colorIdx = 2;
                else continue;
            } else if ('shooted' === monster.status) {
                const r = Math.floor(Math.random() * 4);
                colorIdx = [1, 4, 13, 15][r];
            } else continue;
            t(app, 120 + 8 * (monster.col - 1), 153 + 8 * (monster.row - 1), 6, 6, colorIdx);
        }

        // Scores
        this._displayScore(app, 1, p0 ? p0.score : 0);
        this._displayScore(app, 2, p1 ? p1.score : 0);

        // Tunnel indicator: show connected dungeon label
        if (state.rightTunnelTarget) {
            v(app, '►', 305, 54, 14, 'c64');
        }
        if (state.leftTunnelTarget) {
            v(app, '◄', 3, 54, 14, 'c64');
        }
    }

    _drawPlayer(app, p, animFC) {
        let frameIdx = 0;
        if (11 < p.animationSequence) frameIdx = 1;
        else if (3 < p.animationSequence && 8 > p.animationSequence) frameIdx = 2;

        let sprCoords;
        if ('dead' === p.status) {
            if (p.frameCounters.dead < Math.round(50 * 1.1)) {
                if ('left' === p.d || 'right' === p.d) {
                    sprCoords = 10 < p.frameCounters.dead % 20
                        ? m.sprite.players[0][p.d][frameIdx]
                        : m.sprite.players[1][p.d][frameIdx];
                } else {
                    sprCoords = 10 < p.frameCounters.dead % 20
                        ? m.sprite.players[p.colorNum][p.d][frameIdx]
                        : m.sprite.players[p.colorNum].death[p.d][frameIdx];
                }
            } else {
                sprCoords = m.sprite.hit[Math.floor(animFC % 48 / 3)];
            }
        } else {
            const pSprite = m.sprite.players[p.colorNum];
            sprCoords = p.frameCounters.justShoot > 0 ? pSprite.shoot[p.d] : pSprite[p.d][frameIdx];
        }
        if (sprCoords) l(app, sprCoords.x, sprCoords.y, 18, 18, p.x, p.y);
    }

    _drawMonster(app, monster, animFC) {
        let frameIdx = 0;
        if (11 < monster.animationSequence) frameIdx = 1;
        else if (3 < monster.animationSequence && 8 > monster.animationSequence) frameIdx = 2;

        let sprCoords;
        if ('shooted' === monster.status) {
            sprCoords = m.sprite.hit[Math.floor(animFC % 48 / 3)];
        } else if ('worluk' === monster.type) {
            sprCoords = m.sprite.worluk[frameIdx];
        } else {
            sprCoords = m.sprite[monster.type][monster.d][frameIdx];
        }
        if (sprCoords) l(app, sprCoords.x, sprCoords.y, 18, 18, monster.x, monster.y);
    }

    _displayScore(app, playerNum, score) {
        if (1 === playerNum) {
            t(app, 239, 168, 80, 8, 7);
            t(app, 239, 192, 80, 8, false);
            t(app, 239, 176, 8, 16, false);
            t(app, 311, 176, 8, 16, false);
            v(app, H(score, 38), 0, 189, 7);
        } else {
            t(app, 7, 168, 80, 8, 6);
            t(app, 7, 192, 80, 8, false);
            t(app, 7, 176, 8, 16, false);
            t(app, 79, 176, 8, 16, false);
            v(app, H(score, 9), 0, 189, 6);
        }
    }

    _drawVisualFilter(_state) {
        const vfc = this.visualFilterContext;
        vfc.clearRect(0, 0, this.visualFilter.width, this.visualFilter.height);
        const vf = this.options.visualFilter;
        if ('none' === vf) return;
        vfc.fillStyle = '#' + m.colors[this.options.palette][0];
        if ('scanlines' === vf || 'bwTv' === vf || 'greenC64monitor' === vf) {
            for (let a = 0; a < this.visualFilter.height; a += 3)
                vfc.fillRect(0, a, this.visualFilter.width, 1);
        }
    }

    applyVisualFilter(vf) {
        this.options.visualFilter = vf;
        let palette = 'default';
        let imageRendering = 'pixelated', filter = 'blur(0px)';
        if ('bwTv' === vf) { imageRendering = 'initial'; filter = 'blur(1.5px) brightness(2.5)'; palette = 'grayscale'; }
        else if ('colorTv' === vf) { imageRendering = 'initial'; filter = 'contrast(1.7) brightness(1.5) saturate(0.8) blur(1.5px)'; palette = 'vice'; }
        else if ('greenC64monitor' === vf) { imageRendering = 'initial'; filter = 'brightness(1.3) blur(1px)'; palette = 'green'; }
        this.options.palette = palette;
        this._canvasEl.style.imageRendering = imageRendering;
        this.visualFilter.style.imageRendering = imageRendering;
        const border = q('border');
        border.style.webkitFilter = filter; border.style.filter = filter;
        z(0);
    }
}
