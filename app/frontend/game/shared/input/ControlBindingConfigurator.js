import {
    CONTROL_ACTIONS,
    describeControlAction,
    getDeviceValue,
    normalizeControlBinding,
    setBindingAction,
    setBindingDevice,
} from './SharedControls.js';

const DEFAULT_ACTION_LABELS = {
    up: 'UP',
    down: 'DOWN',
    left: 'LEFT',
    right: 'RIGHT',
    fire: 'FIRE',
};

export class ControlBindingConfigurator {
    constructor({
        runtime,
        getBinding,
        setBinding,
        deviceElement,
        actionElements,
        statusElement,
        onBindingChanged,
        actionLabels = DEFAULT_ACTION_LABELS,
        statusPrefix = '',
    }) {
        this.runtime = runtime;
        this.getBinding = getBinding;
        this.setBinding = setBinding;
        this.deviceElement = deviceElement;
        this.actionElements = actionElements || {};
        this.statusElement = statusElement;
        this.onBindingChanged = onBindingChanged;
        this.actionLabels = actionLabels;
        this.statusPrefix = statusPrefix;

        this._onDeviceChange = null;
        this._onActionClick = {};
    }

    init() {
        if (this.deviceElement) {
            this._onDeviceChange = (event) => {
                const current = this._readBinding();
                const next = setBindingDevice(current, event?.target?.value || 'keyboard');
                this._commit(next);
                this.setStatus('');
            };
            this.deviceElement.addEventListener('change', this._onDeviceChange);
        }

        for (const action of CONTROL_ACTIONS) {
            const actionElement = this.actionElements[action];
            if (!actionElement) continue;
            this._onActionClick[action] = () => this._captureAction(action);
            actionElement.addEventListener('click', this._onActionClick[action]);
        }

        this.syncUI();
    }

    dispose() {
        if (this.deviceElement && this._onDeviceChange) {
            this.deviceElement.removeEventListener('change', this._onDeviceChange);
            this._onDeviceChange = null;
        }
        for (const action of CONTROL_ACTIONS) {
            const actionElement = this.actionElements[action];
            const actionHandler = this._onActionClick[action];
            if (actionElement && actionHandler) actionElement.removeEventListener('click', actionHandler);
        }
        this._onActionClick = {};
    }

    syncUI() {
        const binding = this._readBinding();
        if (this.deviceElement) this.deviceElement.value = getDeviceValue(binding);

        for (const action of CONTROL_ACTIONS) {
            const actionElement = this.actionElements[action];
            if (!actionElement) continue;
            const actionLabel = this.actionLabels[action] || action.toUpperCase();
            const actionValue = describeControlAction(binding, action);
            actionElement.textContent = `${actionLabel}: ${actionValue}`;
        }
    }

    setStatus(text) {
        if (!this.statusElement) return;
        this.statusElement.textContent = text || '';
    }

    _captureAction(action) {
        if (!this.runtime) return;
        const binding = this._readBinding();
        const actionLabel = this.actionLabels[action] || action.toUpperCase();

        this.runtime.captureNextInput({
            device: binding.device,
            gamepadIndex: binding.gamepadIndex,
            onCaptured: (capturedMapping) => {
                const next = setBindingAction(this._readBinding(), action, capturedMapping);
                this._commit(next);
                this.setStatus(`${this.statusPrefix}${actionLabel} updated`);
            },
            onStatus: (statusText) => {
                this.setStatus(statusText ? `${this.statusPrefix}${statusText}` : '');
            },
        });
    }

    _commit(nextBinding) {
        if (typeof this.setBinding === 'function') this.setBinding(nextBinding);
        if (typeof this.onBindingChanged === 'function') this.onBindingChanged(nextBinding);
        this.syncUI();
    }

    _readBinding() {
        if (typeof this.getBinding !== 'function') return normalizeControlBinding(null);
        return normalizeControlBinding(this.getBinding());
    }
}
