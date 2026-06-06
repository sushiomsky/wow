import { x, q, F } from '../../shared/utils.js';
import {
    createKeyboardBinding,
    getDeviceValue,
    normalizeControlBinding,
    setBindingDevice,
} from '../../shared/input/SharedControls.js';
import { ControlBindingConfigurator } from '../../shared/input/ControlBindingConfigurator.js';

export class UIManager {
    constructor(engine, app) {
        this.engine = engine;
        this.app = app;
        this.controlsRuntime = null;
        this.yellowConfigurator = null;
        this.blueConfigurator = null;
        this.init();
    }

    init() {
        this.controlsRuntime = this.app.controlsRuntime;

        q("menuOverlay").onclick = () => {
            q("menu").classList.contains("opened") && this.closeMenu();
        };

        q("menuToggler").onclick = () => {
            this.openMenu();
        };

        x("#menu .l1", (h) => {
            h.onclick = (k) => {
                if (k.target.classList.contains("l1")) {
                    const items = h.querySelector(".items");
                    if (items) {
                        items.style.height = items.scrollHeight + "px";
                        items.classList.toggle("closed");
                        this.closeOtherMenuItems(items);
                    }
                }
            };
        });

        q("menu .back").onclick = () => {
            this.closeMenu();
        };

        q("toggleFullscreen").onclick = () => {
            var h = window.document, k = h.documentElement,
                n = k.requestFullscreen || k.mozRequestFullScreen || k.webkitRequestFullScreen || k.msRequestFullscreen,
                A = h.exitFullscreen || h.mozCancelFullScreen || h.webkitExitFullscreen || h.msExitFullscreen;
            h.fullscreenElement || h.mozFullScreenElement || h.webkitFullscreenElement || h.msFullscreenElement ? A.call(h) : n.call(k)
        };

        x("#visualFilterSelect > div", (h) => {
            h.onclick = () => {
                var k = this.getDataValue(h);
                this.app.options.visualFilter = k;
                localStorage.setItem("visualFilter", k);
                this.refreshActiveOptions();
                this.app.applyVisualFilter();
                "none" == k && this.engine.clearVisualFilter();
                this.engine.resetAnimateSkips();
                this.engine.animationRoutine();
            }
        });

        x("#soundSelect > div", (h) => {
            h.onclick = () => {
                var k = this.getDataValue(h);
                "off" == k ? this.app.audio.stopAllSound(!0) : this.app.audio.queue = [];
                this.app.options.sound = k;
                localStorage.setItem("sound", k);
                this.refreshActiveOptions();
            }
        });

        this.initControlConfigurators();
    }

    openMenu() {
        this.engine.togglePause(!0);
        F("menuOverlay");
        q("menuToggler").classList.add("hide");
        q("menu").classList.add("opened");
        q("body").classList.add("menu");
        setTimeout(() => { window.onresize() }, 220);
    }

    closeMenu() {
        this.closeOtherMenuItems();
        q("menu").classList.remove("opened");
        q("body").classList.remove("menu");
        F("menuToggler");
        q("menuOverlay").classList.add("hide");
        this.engine.togglePause(!1);
        setTimeout(() => { window.onresize() }, 220);
    }

    closeOtherMenuItems(except) {
        x("#menu .l1 .items", (k) => {
            if (except && except === k) return;
            k.classList.add("closed");
        });
    }

    refreshActiveOptions() {
        x("#menu .items > div", (n) => { n.classList.remove("active") });
        for (var h = ["visualFilter", "sound"], k = 0; k < h.length; k++) {
            const selector = `${h[k]}Select div[data-value="${this.app.options[h[k]]}"]`;
            const el = q(selector);
            if (el) el.classList.add("active");
        }

        this._refreshControlDeviceActive('yellowControlSelect', this.app.options.yellowControlBinding);
        this._refreshControlDeviceActive('blueControlSelect', this.app.options.blueControlBinding);
    }

    getDataValue(el) {
        return el.getAttribute("data-value") || "";
    }

    isVisible() {
        return q("menu").classList.contains("opened");
    }

    setToggler(h) {
        "small" === h ? q("menuToggler").classList.add("small") : q("menuToggler").classList.remove("small");
    }

    initControlConfigurators() {
        const yellowItems = x('#yellowControlSelect > div[data-value]', (el) => el);
        const blueItems = x('#blueControlSelect > div[data-value]', (el) => el);

        yellowItems.forEach((item) => {
            item.onclick = () => {
                const nextBinding = setBindingDevice(this.app.options.yellowControlBinding, this.getDataValue(item));
                if (typeof this.app.savePlayerControlBinding === 'function') {
                    this.app.savePlayerControlBinding('yellow', nextBinding);
                } else {
                    this.app.options.yellowControlBinding = nextBinding;
                }
                this.refreshActiveOptions();
                if (this.yellowConfigurator) this.yellowConfigurator.syncUI();
            };
        });

        blueItems.forEach((item) => {
            item.onclick = () => {
                const nextBinding = setBindingDevice(this.app.options.blueControlBinding, this.getDataValue(item));
                if (typeof this.app.savePlayerControlBinding === 'function') {
                    this.app.savePlayerControlBinding('blue', nextBinding);
                } else {
                    this.app.options.blueControlBinding = nextBinding;
                }
                this.refreshActiveOptions();
                if (this.blueConfigurator) this.blueConfigurator.syncUI();
            };
        });

        this.yellowConfigurator = new ControlBindingConfigurator({
            runtime: this.controlsRuntime,
            getBinding: () => this.app.options.yellowControlBinding,
            setBinding: (nextBinding) => {
                const normalized = normalizeControlBinding(nextBinding, createKeyboardBinding('arrows'));
                if (typeof this.app.savePlayerControlBinding === 'function') {
                    this.app.savePlayerControlBinding('yellow', normalized);
                } else {
                    this.app.options.yellowControlBinding = normalized;
                }
            },
            actionElements: {
                up: q('yellowBindUp'),
                down: q('yellowBindDown'),
                left: q('yellowBindLeft'),
                right: q('yellowBindRight'),
                fire: q('yellowBindFire'),
            },
            onBindingChanged: () => {
                this.refreshActiveOptions();
            },
            statusPrefix: 'YELLOW: ',
        });
        this.yellowConfigurator.init();

        this.blueConfigurator = new ControlBindingConfigurator({
            runtime: this.controlsRuntime,
            getBinding: () => this.app.options.blueControlBinding,
            setBinding: (nextBinding) => {
                const normalized = normalizeControlBinding(nextBinding, createKeyboardBinding('wasd'));
                if (typeof this.app.savePlayerControlBinding === 'function') {
                    this.app.savePlayerControlBinding('blue', normalized);
                } else {
                    this.app.options.blueControlBinding = normalized;
                }
            },
            actionElements: {
                up: q('blueBindUp'),
                down: q('blueBindDown'),
                left: q('blueBindLeft'),
                right: q('blueBindRight'),
                fire: q('blueBindFire'),
            },
            onBindingChanged: () => {
                this.refreshActiveOptions();
            },
            statusPrefix: 'BLUE: ',
        });
        this.blueConfigurator.init();
    }

    _refreshControlDeviceActive(containerId, binding) {
        const container = q(containerId);
        if (!container) return;
        x(`#${containerId} > div[data-value]`, (el) => el.classList.remove('active'));
        const value = getDeviceValue(binding);
        const el = q(`${containerId} > div[data-value="${value}"]`);
        if (el) el.classList.add('active');
    }
}
