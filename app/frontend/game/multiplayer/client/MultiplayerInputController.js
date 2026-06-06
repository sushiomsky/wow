const TOGGLE_SETTINGS_KEY = 77; // M
const ESCAPE_KEY = 27;
const PREVENT_DEFAULT_KEYS = new Set([13, 16, 17, 32, 37, 38, 39, 40]);

export class MultiplayerInputController {
    constructor({
        runtime,
        getControlBinding,
        onToggleSettings,
        onExitToMenu,
        isSettingsVisible
    }) {
        this.runtime = runtime;
        this.getControlBinding = getControlBinding;
        this.onToggleSettings = onToggleSettings;
        this.onExitToMenu = onExitToMenu;
        this.isSettingsVisible = isSettingsVisible;
        this._attached = false;
    }

    attach() {
        if (this._attached || !this.runtime) return;
        this.runtime.onKeyDown = (_event, keyCode) => {
            if (keyCode === TOGGLE_SETTINGS_KEY) {
                if (typeof this.onToggleSettings === 'function') this.onToggleSettings();
                return;
            }

            if (keyCode === ESCAPE_KEY) {
                if (typeof this.isSettingsVisible === 'function' && this.isSettingsVisible()) {
                    if (typeof this.onToggleSettings === 'function') this.onToggleSettings(false);
                    return;
                }
                if (typeof this.onExitToMenu === 'function') this.onExitToMenu();
            }
        };

        this.runtime.shouldPreventDefault = (_event, keyCode) => {
            if (PREVENT_DEFAULT_KEYS.has(keyCode) || keyCode === TOGGLE_SETTINGS_KEY || keyCode === ESCAPE_KEY) {
                return true;
            }
            const binding = this.getControlBinding ? this.getControlBinding() : null;
            const actions = binding?.actions || {};
            return Object.values(actions).some((mapping) => mapping?.kind === 'key' && mapping.code === keyCode);
        };

        this.runtime.attach();
        this._attached = true;
    }

    detach() {
        if (!this._attached || !this.runtime) return;
        this.runtime.detach();
        this.runtime.onKeyDown = null;
        this.runtime.shouldPreventDefault = null;
        this._attached = false;
    }

    getControls() {
        if (!this.runtime) {
            return { up: false, down: false, left: false, right: false, fire: false };
        }
        const binding = this.getControlBinding ? this.getControlBinding() : null;
        return this.runtime.getControls(binding);
    }
}
