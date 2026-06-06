export const CONTROL_ACTIONS = ['up', 'down', 'left', 'right', 'fire'];

const KEYBOARD_LAYOUTS = {
    arrows: {
        label: 'Arrows + Enter',
        actions: {
            up: { kind: 'key', code: 38 },
            down: { kind: 'key', code: 40 },
            left: { kind: 'key', code: 37 },
            right: { kind: 'key', code: 39 },
            fire: { kind: 'key', code: 13 },
        },
    },
    wasd: {
        label: 'WASD + Left Shift',
        actions: {
            up: { kind: 'key', code: 87 },
            down: { kind: 'key', code: 83 },
            left: { kind: 'key', code: 65 },
            right: { kind: 'key', code: 68 },
            fire: { kind: 'key', code: 16 },
        },
    },
    ijkl: {
        label: 'IJKL + Space',
        actions: {
            up: { kind: 'key', code: 73 },
            down: { kind: 'key', code: 75 },
            left: { kind: 'key', code: 74 },
            right: { kind: 'key', code: 76 },
            fire: { kind: 'key', code: 32 },
        },
    },
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function clampGamepadIndex(value) {
    const parsed = Number.isFinite(Number(value)) ? Number(value) : 0;
    return Math.max(0, Math.min(3, Math.trunc(parsed)));
}

function defaultGamepadActions() {
    return {
        up: { kind: 'button', index: 12 },
        down: { kind: 'button', index: 13 },
        left: { kind: 'button', index: 14 },
        right: { kind: 'button', index: 15 },
        fire: { kind: 'button', index: 0 },
    };
}

function defaultByDevice(device, gamepadIndex = 0) {
    return device === 'gamepad'
        ? createGamepadBinding(gamepadIndex)
        : createKeyboardBinding('arrows');
}

function isValidActionMapping(actionMapping) {
    if (!actionMapping || typeof actionMapping !== 'object') return false;
    if (actionMapping.kind === 'key') return Number.isInteger(actionMapping.code) && actionMapping.code > 0;
    if (actionMapping.kind === 'button') return Number.isInteger(actionMapping.index) && actionMapping.index >= 0;
    if (actionMapping.kind === 'axis') {
        return Number.isInteger(actionMapping.index)
            && actionMapping.index >= 0
            && (actionMapping.direction === 1 || actionMapping.direction === -1);
    }
    return false;
}

export function createKeyboardBinding(layout = 'arrows') {
    const preset = KEYBOARD_LAYOUTS[layout] || KEYBOARD_LAYOUTS.arrows;
    return {
        device: 'keyboard',
        gamepadIndex: 0,
        layout: layout in KEYBOARD_LAYOUTS ? layout : 'arrows',
        actions: clone(preset.actions),
    };
}

export function createGamepadBinding(gamepadIndex = 0) {
    return {
        device: 'gamepad',
        gamepadIndex: clampGamepadIndex(gamepadIndex),
        layout: null,
        actions: defaultGamepadActions(),
    };
}

export function setBindingAction(binding, action, actionMapping) {
    const normalized = normalizeControlBinding(binding);
    if (!CONTROL_ACTIONS.includes(action)) return normalized;
    if (!isValidActionMapping(actionMapping)) return normalized;

    if (normalized.device === 'keyboard' && actionMapping.kind !== 'key') return normalized;
    if (normalized.device === 'gamepad' && actionMapping.kind === 'key') return normalized;

    const next = clone(normalized);
    if (actionMapping.kind === 'key') {
        next.actions[action] = { kind: 'key', code: actionMapping.code };
    } else if (actionMapping.kind === 'button') {
        next.actions[action] = { kind: 'button', index: actionMapping.index };
    } else {
        next.actions[action] = { kind: 'axis', index: actionMapping.index, direction: actionMapping.direction };
    }
    next.layout = next.device === 'keyboard' ? null : next.layout;
    return normalizeControlBinding(next);
}

export function withKeyboardPreset(layout = 'arrows') {
    return createKeyboardBinding(layout);
}

export function toLegacyControlValue(binding) {
    const normalized = normalizeControlBinding(binding);
    if (normalized.device === 'gamepad') {
        return normalized.gamepadIndex === 1 ? 'gamepad2' : 'gamepad';
    }
    if (normalized.layout === 'wasd') return 'keyboardWasd';
    if (normalized.layout === 'ijkl') return 'ijkl';
    return 'keyboardArrows';
}

export function createLegacyControlBinding(value, defaultGamepadIndex = 0) {
    switch (value) {
        case 'keyboardWasd':
        case 'wasd':
            return createKeyboardBinding('wasd');
        case 'ijkl':
            return createKeyboardBinding('ijkl');
        case 'keyboardArrows':
        case 'arrows':
            return createKeyboardBinding('arrows');
        case 'gamepad1':
        case 'gamepad0':
            return createGamepadBinding(0);
        case 'gamepad2':
            return createGamepadBinding(1);
        case 'gamepad':
            return createGamepadBinding(defaultGamepadIndex);
        default:
            return createKeyboardBinding('arrows');
    }
}

export function normalizeControlBinding(binding, fallbackBinding = createKeyboardBinding('arrows')) {
    const fallback = fallbackBinding && typeof fallbackBinding === 'object'
        ? fallbackBinding
        : createKeyboardBinding('arrows');

    const raw = binding && typeof binding === 'object' ? binding : {};
    const device = raw.device === 'gamepad' ? 'gamepad' : 'keyboard';
    const gamepadIndex = clampGamepadIndex(raw.gamepadIndex);
    const normalized = defaultByDevice(device, gamepadIndex);

    normalized.layout = typeof raw.layout === 'string' ? raw.layout : normalized.layout;
    if (raw.actions && typeof raw.actions === 'object') {
        for (const action of CONTROL_ACTIONS) {
            const nextAction = raw.actions[action];
            if (isValidActionMapping(nextAction)) {
                if (device === 'keyboard' && nextAction.kind === 'key') {
                    normalized.actions[action] = { kind: 'key', code: nextAction.code };
                } else if (device === 'gamepad' && (nextAction.kind === 'button' || nextAction.kind === 'axis')) {
                    normalized.actions[action] = nextAction.kind === 'button'
                        ? { kind: 'button', index: nextAction.index }
                        : { kind: 'axis', index: nextAction.index, direction: nextAction.direction };
                }
            }
        }
    }

    if (!binding || typeof binding !== 'object') return normalizeControlBinding(fallback, createKeyboardBinding('arrows'));
    return normalized;
}

export function readControlBinding(storageKey, fallbackBinding) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return normalizeControlBinding(fallbackBinding);
        return normalizeControlBinding(JSON.parse(raw), fallbackBinding);
    } catch (_error) {
        return normalizeControlBinding(fallbackBinding);
    }
}

export function writeControlBinding(storageKey, binding) {
    const normalized = normalizeControlBinding(binding);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
}

export function getDeviceValue(binding) {
    const normalized = normalizeControlBinding(binding);
    if (normalized.device === 'gamepad') return `gamepad${normalized.gamepadIndex}`;
    return 'keyboard';
}

export function setBindingDevice(binding, deviceValue) {
    if (deviceValue === 'keyboard') {
        const current = normalizeControlBinding(binding, createKeyboardBinding('arrows'));
        if (current.device === 'keyboard') return current;
        return createKeyboardBinding('arrows');
    }
    if (typeof deviceValue === 'string' && deviceValue.startsWith('gamepad')) {
        const idx = Number(deviceValue.replace('gamepad', ''));
        const current = normalizeControlBinding(binding, createGamepadBinding(clampGamepadIndex(idx)));
        if (current.device === 'gamepad' && current.gamepadIndex === clampGamepadIndex(idx)) return current;
        return createGamepadBinding(clampGamepadIndex(idx));
    }
    return normalizeControlBinding(binding);
}

function keyCodeLabel(code) {
    const map = {
        8: 'Backspace',
        9: 'Tab',
        13: 'Enter',
        16: 'Shift',
        17: 'Ctrl',
        18: 'Alt',
        27: 'Esc',
        32: 'Space',
        37: 'Left',
        38: 'Up',
        39: 'Right',
        40: 'Down',
    };
    if (map[code]) return map[code];
    if (code >= 48 && code <= 57) return String.fromCharCode(code);
    if (code >= 65 && code <= 90) return String.fromCharCode(code);
    return `Key ${code}`;
}

export function describeControlAction(binding, action) {
    const normalized = normalizeControlBinding(binding);
    const mapping = normalized.actions[action];
    if (!mapping) return 'Unbound';
    if (mapping.kind === 'key') return keyCodeLabel(mapping.code);
    if (mapping.kind === 'button') return `Button ${mapping.index + 1}`;
    const sign = mapping.direction === -1 ? '-' : '+';
    return `Axis ${mapping.index}${sign}`;
}

export function describeControlBinding(binding) {
    const normalized = normalizeControlBinding(binding);
    if (normalized.device === 'keyboard') {
        if (normalized.layout && KEYBOARD_LAYOUTS[normalized.layout]) return KEYBOARD_LAYOUTS[normalized.layout].label;
        return 'Custom keyboard';
    }
    return `Gamepad #${normalized.gamepadIndex + 1}`;
}

export class SharedControlsRuntime {
    constructor({
        onKeyDown,
        onKeyUp,
        onBlur,
        shouldPreventDefault,
    } = {}) {
        this.onKeyDown = onKeyDown;
        this.onKeyUp = onKeyUp;
        this.onBlur = onBlur;
        this.shouldPreventDefault = shouldPreventDefault;

        this.pressedKeys = {};
        this.heldGamepadInputs = new Set();
        this.capture = null;
        this.captureRafId = null;

        this._boundKeyDown = null;
        this._boundKeyUp = null;
        this._boundBlur = null;
    }

    attach() {
        if (this._boundKeyDown) return;
        this._boundKeyDown = (event) => this._handleKeyDown(event);
        this._boundKeyUp = (event) => this._handleKeyUp(event);
        this._boundBlur = () => this._handleBlur();
        document.addEventListener('keydown', this._boundKeyDown);
        document.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('blur', this._boundBlur);
    }

    detach() {
        if (!this._boundKeyDown) return;
        document.removeEventListener('keydown', this._boundKeyDown);
        document.removeEventListener('keyup', this._boundKeyUp);
        window.removeEventListener('blur', this._boundBlur);
        this._boundKeyDown = null;
        this._boundKeyUp = null;
        this._boundBlur = null;
        this.cancelCapture();
    }

    getControls(binding) {
        const normalized = normalizeControlBinding(binding);
        const controls = {};
        for (const action of CONTROL_ACTIONS) {
            controls[action] = this._isActionPressed(normalized, action);
        }
        return controls;
    }

    setHold(binding, actionOrKeyCode) {
        if (typeof actionOrKeyCode === 'number') {
            this.pressedKeys[actionOrKeyCode] = 'hold';
            return;
        }
        if (!actionOrKeyCode) return;
        const normalized = normalizeControlBinding(binding);
        const mapping = normalized.actions[actionOrKeyCode];
        if (!mapping) return;
        if (mapping.kind === 'key') {
            this.pressedKeys[mapping.code] = 'hold';
            return;
        }
        this.heldGamepadInputs.add(this._gamepadHoldToken(normalized.gamepadIndex, actionOrKeyCode, mapping));
    }

    captureNextInput({
        device,
        gamepadIndex = 0,
        onCaptured,
        onStatus,
    }) {
        this.cancelCapture();
        this.capture = {
            device: device === 'gamepad' ? 'gamepad' : 'keyboard',
            gamepadIndex: clampGamepadIndex(gamepadIndex),
            onCaptured,
            onStatus,
            buttonBaseline: [],
            axisBaseline: [],
        };

        if (this.capture.device === 'keyboard') {
            if (typeof onStatus === 'function') onStatus('Press any key (Esc to cancel)');
            return () => this.cancelCapture();
        }

        if (typeof onStatus === 'function') onStatus(`Press any button/axis on gamepad #${this.capture.gamepadIndex + 1}`);
        this._beginGamepadCaptureLoop();
        return () => this.cancelCapture();
    }

    cancelCapture() {
        if (!this.capture) return;
        if (this.captureRafId) {
            cancelAnimationFrame(this.captureRafId);
            this.captureRafId = null;
        }
        if (typeof this.capture.onStatus === 'function') this.capture.onStatus('');
        this.capture = null;
    }

    _handleKeyDown(event) {
        const keyCode = event.which || event.keyCode;
        if (!keyCode) return;

        if (this.capture && this.capture.device === 'keyboard') {
            if (keyCode === 27) {
                this.cancelCapture();
                event.preventDefault();
                return;
            }
            if (typeof this.capture.onCaptured === 'function') {
                this.capture.onCaptured({ kind: 'key', code: keyCode });
            }
            this.cancelCapture();
            event.preventDefault();
            return;
        }

        if (this.pressedKeys[keyCode] === false || typeof this.pressedKeys[keyCode] === 'undefined') {
            this.pressedKeys[keyCode] = true;
        }

        if (typeof this.onKeyDown === 'function') this.onKeyDown(event, keyCode);
        if (typeof this.shouldPreventDefault === 'function' && this.shouldPreventDefault(event, keyCode)) {
            event.preventDefault();
        }
    }

    _handleKeyUp(event) {
        const keyCode = event.which || event.keyCode;
        if (!keyCode) return;
        this.pressedKeys[keyCode] = false;
        if (typeof this.onKeyUp === 'function') this.onKeyUp(event, keyCode);
        if (typeof this.shouldPreventDefault === 'function' && this.shouldPreventDefault(event, keyCode)) {
            event.preventDefault();
        }
    }

    _handleBlur() {
        for (const code of Object.keys(this.pressedKeys)) {
            const numericCode = Number(code);
            if (!Number.isNaN(numericCode)) this.pressedKeys[numericCode] = false;
        }
        this.heldGamepadInputs.clear();
        this.cancelCapture();
        if (typeof this.onBlur === 'function') this.onBlur();
    }

    _isActionPressed(binding, action) {
        const mapping = binding.actions[action];
        if (!mapping) return false;
        if (binding.device === 'keyboard') {
            return this.pressedKeys[mapping.code] === true;
        }
        const pressed = this._isGamepadInputPressed(binding.gamepadIndex, mapping);
        const holdToken = this._gamepadHoldToken(binding.gamepadIndex, action, mapping);
        if (this.heldGamepadInputs.has(holdToken)) {
            if (!pressed) this.heldGamepadInputs.delete(holdToken);
            return false;
        }
        return pressed;
    }

    _isGamepadInputPressed(gamepadIndex, mapping) {
        const gamepads = navigator.getGamepads
            ? navigator.getGamepads()
            : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
        const gamepad = gamepads && gamepads[gamepadIndex];
        if (!gamepad) return false;
        if (mapping.kind === 'button') {
            const button = gamepad.buttons && gamepad.buttons[mapping.index];
            if (!button) return false;
            return !!button.pressed || button.value > 0.5;
        }
        if (mapping.kind === 'axis') {
            const axisValue = gamepad.axes && gamepad.axes[mapping.index];
            if (typeof axisValue !== 'number') return false;
            return mapping.direction === -1 ? axisValue < -0.5 : axisValue > 0.5;
        }
        return false;
    }

    _beginGamepadCaptureLoop() {
        if (!this.capture || this.capture.device !== 'gamepad') return;
        const loop = () => {
            if (!this.capture || this.capture.device !== 'gamepad') return;
            const gamepads = navigator.getGamepads
                ? navigator.getGamepads()
                : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
            const gamepad = gamepads && gamepads[this.capture.gamepadIndex];
            if (gamepad) {
                const captured = this._readNewGamepadInput(gamepad);
                if (captured) {
                    if (typeof this.capture.onCaptured === 'function') this.capture.onCaptured(captured);
                    this.cancelCapture();
                    return;
                }
            }
            this.captureRafId = requestAnimationFrame(loop);
        };
        this.captureRafId = requestAnimationFrame(loop);
    }

    _readNewGamepadInput(gamepad) {
        for (let index = 0; index < gamepad.buttons.length; index += 1) {
            const button = gamepad.buttons[index];
            const pressed = !!button?.pressed || (button?.value || 0) > 0.5;
            const previous = !!this.capture.buttonBaseline[index];
            this.capture.buttonBaseline[index] = pressed;
            if (pressed && !previous) return { kind: 'button', index };
        }

        for (let index = 0; index < gamepad.axes.length; index += 1) {
            const value = gamepad.axes[index];
            const previous = this.capture.axisBaseline[index] || 0;
            this.capture.axisBaseline[index] = value;

            const risingPositive = value > 0.75 && previous <= 0.25;
            if (risingPositive) return { kind: 'axis', index, direction: 1 };

            const risingNegative = value < -0.75 && previous >= -0.25;
            if (risingNegative) return { kind: 'axis', index, direction: -1 };
        }
        return null;
    }

    _gamepadHoldToken(gamepadIndex, action, mapping) {
        if (mapping.kind === 'button') return `${gamepadIndex}:${action}:button:${mapping.index}`;
        if (mapping.kind === 'axis') return `${gamepadIndex}:${action}:axis:${mapping.index}:${mapping.direction}`;
        return `${gamepadIndex}:${action}:unknown`;
    }
}
