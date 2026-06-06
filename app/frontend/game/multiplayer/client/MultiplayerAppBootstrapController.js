import { q } from '../../shared/utils.js';
import { GameCanvas } from './GameCanvas.js';
import { loadMultiplayerSprite } from './loadMultiplayerSprite.js';

export class MultiplayerAppBootstrapController {
    constructor({
        options,
        onRendererReady,
        initializeModules,
        getRenderState,
    }) {
        this.options = options;
        this.onRendererReady = onRendererReady;
        this.initializeModules = initializeModules;
        this.getRenderState = getRenderState;
    }

    async bootstrap() {
        const spriteCanvas = await loadMultiplayerSprite();
        const renderer = this._createRenderer(spriteCanvas);
        if (typeof this.onRendererReady === 'function') this.onRendererReady(renderer);
        if (typeof this.initializeModules === 'function') this.initializeModules();
        this._startRenderLoop(renderer);
    }

    _createRenderer(spriteCanvas) {
        const canvasEl = q('screen');
        const resolvedSprite = spriteCanvas || this._createFallbackSpriteCanvas();
        const renderer = new GameCanvas(canvasEl, resolvedSprite, this.options);
        renderer.applyVisualFilter(this.options.visualFilter);
        return renderer;
    }

    _createFallbackSpriteCanvas() {
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 248;
        fallbackCanvas.height = 355;
        return fallbackCanvas;
    }

    _startRenderLoop(renderer) {
        const loop = () => {
            const state = typeof this.getRenderState === 'function' ? this.getRenderState(performance.now()) : null;
            if (state) renderer.render(state);
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    stopRenderLoop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }
}
