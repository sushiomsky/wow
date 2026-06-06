const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${location.hostname}${location.port ? ':' + location.port : ''}/multiplayer`;

export class MultiplayerSocketClient {
    constructor({
        onOpen,
        onMessage,
        onClose,
        onError,
        getInputPayload,
        inputIntervalMs = 20
    }) {
        this.onOpen = onOpen;
        this.onMessage = onMessage;
        this.onClose = onClose;
        this.onError = onError;
        this.getInputPayload = getInputPayload;
        this.inputIntervalMs = inputIntervalMs;

        this.ws = null;
        this.inputIntervalId = null;
    }

    isOpenOrConnecting() {
        return !!this.ws && (
            this.ws.readyState === WebSocket.OPEN ||
            this.ws.readyState === WebSocket.CONNECTING
        );
    }

    connect(joinType, payload = null) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({ type: joinType, ...(payload || {}) });
            return true;
        }
        if (this.ws?.readyState === WebSocket.CONNECTING) return false;
        this.disconnect();

        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
            if (typeof this.onOpen === 'function') this.onOpen();
            this.send({ type: joinType, ...(payload || {}) });
        };

        this.ws.onmessage = (event) => {
            if (typeof this.onMessage !== 'function') return;
            this.onMessage(event.data);
        };

        this.ws.onclose = () => {
            this._stopInputLoop();
            if (typeof this.onClose === 'function') this.onClose();
        };

        this.ws.onerror = () => {
            if (typeof this.onError === 'function') this.onError();
        };

        this._startInputLoop();
        return true;
    }

    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(message));
        return true;
    }

    disconnect() {
        this._stopInputLoop();
        if (!this.ws) return;
        try {
            this.ws.close();
        } catch (_error) {
            // no-op
        }
        this.ws = null;
    }

    _startInputLoop() {
        this._stopInputLoop();
        this.inputIntervalId = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const inputPayload = typeof this.getInputPayload === 'function'
                ? this.getInputPayload()
                : null;
            if (!inputPayload) return;
            this.send(inputPayload);
        }, this.inputIntervalMs);
    }

    _stopInputLoop() {
        if (!this.inputIntervalId) return;
        clearInterval(this.inputIntervalId);
        this.inputIntervalId = null;
    }
}
