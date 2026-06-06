import { m } from '../shared/constants.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { GameEngine } from './engine/GameEngine.js';
import { UIManager } from './ui/UIManager.js';
import { x, q, F, z } from '../shared/utils.js';
import {
    SharedControlsRuntime,
    createKeyboardBinding,
    createLegacyControlBinding,
    normalizeControlBinding,
    readControlBinding,
    toLegacyControlValue,
    writeControlBinding,
} from '../shared/input/SharedControls.js';

const YELLOW_CONTROL_STORAGE_KEY = 'yellowControlBinding';
const BLUE_CONTROL_STORAGE_KEY = 'blueControlBinding';

class App {
    constructor() {
        this.options = {};
        this.controlsRuntime = new SharedControlsRuntime();
        this.pressedKeys = this.controlsRuntime.pressedKeys;
        this.enableKeys = !1;
        this.spriteImage = new Image();
        this.spriteWidth = 248;
        this.spriteHeight = 355;
        this.scale = 3;
        this.scanFPS = 50;
        this.scanFrameTime = 1E3 / this.scanFPS;
        this.animationFrameCounter = 0;
        this.scanFrameCounter = 0;
    }

    init() {
        x(".j", (c) => { c.remove() });
        this.checkSystemRequirements(() => {
            this.audio = new AudioEngine();
            this.audio.init();
            this.setOptions();
            this.loadResources(() => {
                this.engine = new GameEngine(this);
                this.ui = new UIManager(this.engine, this);
                this.ui.refreshActiveOptions();
                F("menuToggler");
                this.initKeyHandling();
                this.initEngine();
                this.applyVisualFilter();
                F("screen");
                this.audio.loadAudioResource(0, () => {});
            });
        }, () => {
            alert("System requirements not met.");
        });
    }

    checkSystemRequirements(success, failure) {
        var f = !0;
        !1 === (window.AudioContext || window.webkitAudioContext || !1) && (f = !1);
        window.animFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame;
        if (!window.animFrame) f = !1;
        f ? success() : failure();
    }

    setOptions() {
        if ("4.0" !== localStorage.getItem("ver")) {
            localStorage.removeItem("palette");
            localStorage.setItem("ver", "4.0");
        }
        this.options = {
            visualFilter: localStorage.getItem("visualFilter") || "scanlines",
            palette: localStorage.getItem("palette") || "default",
            sound: localStorage.getItem("sound") || "on",
            yellowControl: localStorage.getItem("yellowControl") || "keyboardArrows",
            blueControl: localStorage.getItem("blueControl") || "keyboardWasd",
            highScores: localStorage.getItem("highScores") || "0,0,0,0,0"
        };

        const defaultYellowBinding = createLegacyControlBinding(this.options.yellowControl, 0);
        const defaultBlueBinding = createLegacyControlBinding(this.options.blueControl, 1);
        this.options.yellowControlBinding = readControlBinding(YELLOW_CONTROL_STORAGE_KEY, defaultYellowBinding);
        this.options.blueControlBinding = readControlBinding(BLUE_CONTROL_STORAGE_KEY, defaultBlueBinding);
        writeControlBinding(YELLOW_CONTROL_STORAGE_KEY, this.options.yellowControlBinding);
        writeControlBinding(BLUE_CONTROL_STORAGE_KEY, this.options.blueControlBinding);
        this.options.yellowControl = toLegacyControlValue(this.options.yellowControlBinding);
        this.options.blueControl = toLegacyControlValue(this.options.blueControlBinding);

        var a = this.options.highScores.split(",");
        this.options.highScores = [];
        for (var c = 0; c < a.length; c++) this.options.highScores[c] = +a[c];
    }

    loadResources(callback) {
        this.spriteImage.src = "/images/v3.0/sprite.png";
        this.spriteImage.onerror = (e) => console.error("Sprite load failed", e);
        this.spriteImage.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = this.spriteWidth;
            canvas.height = this.spriteHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(this.spriteImage, 0, 0);
            this.originalSpriteImageData = ctx.getImageData(0, 0, this.spriteWidth, this.spriteHeight);
            this.changeGameSpriteColors();
            callback();
        };
    }

    initKeyHandling() {
        this.controlsRuntime.onKeyDown = (_event, keyCode) => {
            if (27 == keyCode) this.engine.resetGame();
        };
        this.controlsRuntime.shouldPreventDefault = () => !this.enableKeys;
        this.controlsRuntime.attach();
    }

    initEngine() {
        this.canvasElement = q("screen");
        this.canvas = this.canvasElement.getContext("2d");
        this.canvas.imageSmoothingEnabled = !1;
        this.canvas.mozImageSmoothingEnabled = !1;
        this.visualFilter = q("visualFilterLayer");
        this.visualFilterContext = this.visualFilter.getContext("2d");
        this.visualFilterContext.imageSmoothingEnabled = !1;
        this.visualFilterContext.mozImageSmoothingEnabled = !1;

        this._visibilityHandler = () => {
            if (document.hidden) this.engine.togglePause(!0);
            else if (!this.ui.isVisible()) this.engine.togglePause(!1);
        };
        document.addEventListener("visibilitychange", this._visibilityHandler);

        this._resizeHandler = () => {
            const border = q("border");
            this.fullWidth = border.offsetWidth;
            this.fullHeight = border.offsetHeight;
            var a = 0;
            if (this.fullWidth > 320 * this.scale && this.fullHeight > 200 * this.scale) {
                a = 100; this.fullWidth -= a; this.fullHeight -= a;
            }
            var c = Math.min(this.fullWidth / this.canvasElement.width, this.fullHeight / this.canvasElement.height);
            this.canvasElement.style.transform = "scale(" + c + ")";
            this.canvasElement.style.webkitTransform = "scale(" + c + ")";
            var f = Math.round((this.fullWidth - 320 * this.scale * c) / 2) + a / 2;
            this.canvasElement.style.margin = Math.round((this.fullHeight - 200 * this.scale * c) / 2) + a / 2 + "px " + f + "px 0px " + f + "px";
            this.visualFilter.width = window.innerWidth;
            this.visualFilter.height = window.innerHeight;
        };
        window.addEventListener("resize", this._resizeHandler);
        this._resizeHandler();
        this.animationLoop();
        this.startScan();
    }

    destroy() {
        if (this._scanIntervalId) {
            clearInterval(this._scanIntervalId);
            this._scanIntervalId = null;
        }
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._visibilityHandler) {
            document.removeEventListener("visibilitychange", this._visibilityHandler);
            this._visibilityHandler = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener("resize", this._resizeHandler);
            this._resizeHandler = null;
        }
        this.controlsRuntime.detach();
        if (this.audio) this.audio.stopAllSound();
        if (this.engine) this.engine.resetGame();
    }

    changeGameSpriteColors(palette) {
        palette = palette || this.options.palette;
        const canvas = document.createElement("canvas");
        canvas.width = this.spriteWidth;
        canvas.height = this.spriteHeight;
        const ctx = canvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, this.spriteWidth, this.spriteHeight);

        for (var g = 0; g < this.originalSpriteImageData.data.length; g += 4) {
            if (0 === this.originalSpriteImageData.data[g + 3]) {
                imageData.data[g] = 0; imageData.data[g + 1] = 0; imageData.data[g + 2] = 0; imageData.data[g + 3] = 0;
            } else {
                var h = m.colors[palette][this.originalSpriteImageData.data[g]];
                imageData.data[g] = parseInt(h[0] + h[1], 16);
                imageData.data[g + 1] = parseInt(h[2] + h[3], 16);
                imageData.data[g + 2] = parseInt(h[4] + h[5], 16);
                imageData.data[g + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        this.makeSpriteImageBitmap(canvas);
    }

    makeSpriteImageBitmap(canvas) {
        this.sprite = canvas;
        if ("function" === typeof window.createImageBitmap) {
            createImageBitmap(canvas).then((bitmap) => {
                this.sprite = bitmap;
            });
        }
    }

    applyVisualFilter() {
        var a = this.options.visualFilter;
        if ("none" == a) {
            this.vfImageRendering("pixelated"); this.vfFilter("blur(0px)"); this.options.palette = "default";
        } else if ("scanlines" == a) {
            this.vfImageRendering("pixelated"); this.vfFilter("blur(0px)"); this.options.palette = "default";
        } else if ("bwTv" == a) {
            this.vfImageRendering("initial"); this.vfFilter("blur(1.5px) brightness(2.5)"); this.options.palette = "grayscale";
        } else if ("colorTv" == a) {
            this.vfImageRendering("initial"); this.vfFilter("contrast(1.7) brightness(1.5) saturate(0.8) blur(1.5px)"); this.options.palette = "vice";
        } else if ("greenC64monitor" == a) {
            this.vfImageRendering("initial"); this.vfFilter("brightness(1.3) blur(1px)"); this.options.palette = "green";
        }
        localStorage.setItem("palette", this.options.palette);
        this.changeGameSpriteColors();
        z(this.engine.borderColor);
    }

    vfImageRendering(a) {
        this.canvasElement.style.imageRendering = a;
        this.visualFilter.style.imageRendering = a;
    }

    vfFilter(a) {
        const border = q("border");
        border.style.webkitFilter = a;
        border.style.filter = a;
    }

    animationLoop() {
        this._rafId = window.animFrame(() => {
            if (!this.engine.paused) {
                this.animationFrameCounter++;
                this.engine.animationRoutine();
            }
            this.animationLoop();
        });
    }

    startScan() {
        this._scanIntervalId = setInterval(() => {
            if (!this.engine.paused) {
                this.refreshPressedKeysByGamepad();
                this.scanFrameCounter++;
                this.engine.scanRoutine();
                this.audio.playQueue();
            }
        }, this.scanFrameTime);
    }

    refreshPressedKeysByGamepad() {
        // SharedControlsRuntime reads gamepad state on demand via getControls().
    }

    getControls(num) {
        const binding = this.getControlBinding(num);
        return this.controlsRuntime.getControls(binding);
    }

    getControlBinding(num) {
        if (num === 1) return normalizeControlBinding(this.options.blueControlBinding, createKeyboardBinding('wasd'));
        return normalizeControlBinding(this.options.yellowControlBinding, createKeyboardBinding('arrows'));
    }

    setPressedKeyHold(key, num) {
        if (typeof key === "number") {
            this.controlsRuntime.setHold(null, key);
            return;
        }
        this.controlsRuntime.setHold(this.getControlBinding(num), key);
    }

    savePlayerControlBinding(player, binding) {
        if (player === 'blue') {
            this.options.blueControlBinding = normalizeControlBinding(binding, createKeyboardBinding('wasd'));
            this.options.blueControl = toLegacyControlValue(this.options.blueControlBinding);
            localStorage.setItem("blueControl", this.options.blueControl);
            writeControlBinding(BLUE_CONTROL_STORAGE_KEY, this.options.blueControlBinding);
            return;
        }
        this.options.yellowControlBinding = normalizeControlBinding(binding, createKeyboardBinding('arrows'));
        this.options.yellowControl = toLegacyControlValue(this.options.yellowControlBinding);
        localStorage.setItem("yellowControl", this.options.yellowControl);
        writeControlBinding(YELLOW_CONTROL_STORAGE_KEY, this.options.yellowControlBinding);
    }
}

// Lifecycle API for platform integration
let _instance = null;

export function initSingleplayer() {
    if (_instance) return _instance;
    _instance = new App();
    _instance.init();
    return _instance;
}

export function destroySingleplayer() {
    if (!_instance) return;
    _instance.destroy();
    _instance = null;
}

export { App };

// Auto-init when loaded as a standalone page (index.html direct usage)
if (!window.__SWOW_PLATFORM__) {
    initSingleplayer();
}
