import { ControlBindingConfigurator } from '../../shared/input/ControlBindingConfigurator.js';
import {
    createKeyboardBinding,
    describeControlBinding,
    getDeviceValue,
    normalizeControlBinding,
    setBindingDevice,
    writeControlBinding,
} from '../../shared/input/SharedControls.js';

export const MULTIPLAYER_CONTROL_STORAGE_KEY = 'multiplayerControlBinding';
export const MULTIPLAYER_CONTROLS_CONFIRMED_KEY = 'multiplayerControlsConfirmed.v1';

export class MultiplayerSettingsController {
    constructor({ runtime, options, renderer, onOptionsChanged }) {
        this.runtime = runtime;
        this.options = options;
        this.renderer = renderer;
        this.onOptionsChanged = onOptionsChanged;
        this.configurator = null;
        this._handlers = [];
    }

    init() {
        this._bindPanelToggle();
        this._bindControlDevice();
        this._bindVisualFilter();
        this._bindSound();
        this._bindConfirmButton();
        this._initConfigurator();
        this.syncControlsPreflight();
    }

    dispose() {
        if (this.configurator) this.configurator.dispose();
        for (const [el, type, handler] of this._handlers) el.removeEventListener(type, handler);
        this._handlers = [];
    }

    hasConfirmedControls() {
        return localStorage.getItem(MULTIPLAYER_CONTROLS_CONFIRMED_KEY) === 'true';
    }

    requireControlsConfirmed() {
        if (this.hasConfirmedControls()) return true;
        this.showSettingsPanel(true);
        this.syncControlsPreflight();
        const status = document.getElementById('status');
        if (status) {
            status.textContent = 'Select and confirm your controls before joining.';
            status.classList.add('error');
        }
        return false;
    }

    confirmControls() {
        localStorage.setItem(MULTIPLAYER_CONTROLS_CONFIRMED_KEY, 'true');
        this.syncControlsPreflight();
        const status = document.getElementById('status');
        if (status) {
            status.textContent = `Controls confirmed: ${describeControlBinding(this.options.controlBinding)}.`;
            status.classList.remove('error');
        }
    }

    markControlsChanged() {
        localStorage.removeItem(MULTIPLAYER_CONTROLS_CONFIRMED_KEY);
        this.syncControlsPreflight();
    }

    syncControlsPreflight() {
        const panel = document.getElementById('controls-preflight');
        const summary = document.getElementById('controls-preflight-summary');
        const button = document.getElementById('btnConfirmControls');
        const confirmed = this.hasConfirmedControls();
        if (panel) panel.classList.toggle('confirmed', confirmed);
        if (summary) {
            summary.textContent = confirmed
                ? `Ready: ${describeControlBinding(this.options.controlBinding)}. Multiplayer joins are unlocked.`
                : `Current: ${describeControlBinding(this.options.controlBinding)}. Confirm before joining a game.`;
        }
        if (button) button.textContent = confirmed ? '✓ CONTROLS CONFIRMED' : '✓ USE THESE CONTROLS';
    }

    showSettingsPanel(show) {
        const panel = document.getElementById('settingsPanel');
        if (!panel) return;
        panel.classList.toggle('hide', !show);
    }

    _bindPanelToggle() {
        const toggler = document.getElementById('settingsToggler');
        if (!toggler) return;
        const handler = () => {
            const panel = document.getElementById('settingsPanel');
            if (panel) panel.classList.toggle('hide');
        };
        toggler.addEventListener('click', handler);
        this._handlers.push([toggler, 'click', handler]);
    }

    _bindControlDevice() {
        const select = document.getElementById('settingControls');
        if (!select) return;
        select.value = getDeviceValue(this.options.controlBinding);
        const handler = () => {
            this.options.controlBinding = setBindingDevice(this.options.controlBinding, select.value);
            this._saveControls(true);
        };
        select.addEventListener('change', handler);
        this._handlers.push([select, 'change', handler]);
    }

    _bindVisualFilter() {
        const select = document.getElementById('settingVisualFilter');
        if (!select) return;
        select.value = this.options.visualFilter;
        const handler = () => {
            this.options.visualFilter = select.value;
            localStorage.setItem('visualFilter', this.options.visualFilter);
            this.renderer?.applyVisualFilter?.(this.options.visualFilter);
            this.onOptionsChanged?.();
        };
        select.addEventListener('change', handler);
        this._handlers.push([select, 'change', handler]);
    }

    _bindSound() {
        const select = document.getElementById('settingSound');
        if (!select) return;
        select.value = this.options.sound;
        const handler = () => {
            this.options.sound = select.value;
            localStorage.setItem('sound', this.options.sound);
            this.onOptionsChanged?.();
        };
        select.addEventListener('change', handler);
        this._handlers.push([select, 'change', handler]);
    }

    _bindConfirmButton() {
        const button = document.getElementById('btnConfirmControls');
        if (!button) return;
        const handler = () => this.confirmControls();
        button.addEventListener('click', handler);
        this._handlers.push([button, 'click', handler]);
    }

    _initConfigurator() {
        this.configurator = new ControlBindingConfigurator({
            runtime: this.runtime,
            getBinding: () => this.options.controlBinding,
            setBinding: (nextBinding) => {
                this.options.controlBinding = normalizeControlBinding(nextBinding, createKeyboardBinding('arrows'));
                this._saveControls(true);
            },
            deviceElement: document.getElementById('settingControls'),
            actionElements: {
                up: document.getElementById('settingControlUp'),
                down: document.getElementById('settingControlDown'),
                left: document.getElementById('settingControlLeft'),
                right: document.getElementById('settingControlRight'),
                fire: document.getElementById('settingControlFire'),
            },
            statusElement: document.getElementById('status'),
            onBindingChanged: () => this.syncControlsPreflight(),
        });
        this.configurator.init();
    }

    _saveControls(requireReconfirm) {
        writeControlBinding(MULTIPLAYER_CONTROL_STORAGE_KEY, this.options.controlBinding);
        this.options.controlDevice = getDeviceValue(this.options.controlBinding);
        if (requireReconfirm) this.markControlsChanged();
        this.configurator?.syncUI();
        this.onOptionsChanged?.();
    }
}
