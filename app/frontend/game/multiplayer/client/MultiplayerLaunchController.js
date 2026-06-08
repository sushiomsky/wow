import { CLIENT_EVENTS } from './multiplayerEvents.js';

export class MultiplayerLaunchController {
    constructor({ uiController, onConnect, beforeJoin, onRetry }) {
        this.uiController = uiController;
        this.onConnect = onConnect;
        this.beforeJoin = beforeJoin;
        this.onRetry = onRetry;
    }

    _connect(joinType, payload = null) {
        if (typeof this.beforeJoin === 'function' && !this.beforeJoin(joinType, payload)) return;
        this.onConnect(joinType, payload);
    }

    bindButtons() {
        // Private pair buttons
        const createBtn = document.getElementById('btnPairCreate');
        if (createBtn) createBtn.onclick = () => this._connect(CLIENT_EVENTS.JOIN_PAIR);

        const refreshBtn = document.getElementById('btnRefreshGames');
        if (refreshBtn) refreshBtn.onclick = () => this.onConnect(CLIENT_EVENTS.REFRESH_OPEN_GAMES);

        document.getElementById('open-games-list')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-join-code]');
            if (!button) return;
            this._connect(CLIENT_EVENTS.JOIN_PRIVATE_PAIR, { code: button.dataset.joinCode });
        });

        const joinBtn = document.getElementById('btnPairJoin');
        if (joinBtn) joinBtn.onclick = () => {
            const codeEl = document.getElementById('pairCode');
            const code = (codeEl?.value || '').trim();
            if (!code) {
                this.uiController.setStatus('Enter a room code first.');
                this.uiController.setStatusError(true);
                return;
            }
            this._connect(CLIENT_EVENTS.JOIN_PRIVATE_PAIR, { code });
        };

        const retryBtn = document.getElementById('btnRetry');
        if (retryBtn) retryBtn.onclick = () => {
            if (typeof this.onRetry === 'function') this.onRetry();
        };

        // Battle Royale mode buttons
        const btnSolo = document.getElementById('btnSolo');
        if (btnSolo) {
            btnSolo.onclick = () => {
                console.log('[Launch] Starting Endless BR mode');
                this.uiController.setStatus('Joining Endless Battle Royale...');
                this._connect(CLIENT_EVENTS.JOIN_ENDLESS_BR);
            };
        }

    }

    applyAutoJoinFromUrl() {
        const params = new URLSearchParams(location.search);
        const autoCode = params.get('room') || params.get('pair');
        if (autoCode) {
            const codeEl = document.getElementById('pairCode');
            if (codeEl) codeEl.value = autoCode;
            this._connect(CLIENT_EVENTS.JOIN_PRIVATE_PAIR, { code: autoCode });
            return;
        }
        this.onConnect(CLIENT_EVENTS.REFRESH_OPEN_GAMES);
    }
}
