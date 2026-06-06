import { CLIENT_EVENTS } from './multiplayerEvents.js';

export class MultiplayerLaunchController {
    constructor({ uiController, onConnect, beforeJoin }) {
        this.uiController = uiController;
        this.onConnect = onConnect;
        this.beforeJoin = beforeJoin;
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

        // Battle Royale mode buttons
        const btnSolo = document.getElementById('btnSolo');
        if (btnSolo) {
            btnSolo.onclick = () => {
                console.log('[Launch] Starting Endless BR mode');
                this.uiController.setStatus('Joining Endless Battle Royale...');
                this._connect(CLIENT_EVENTS.JOIN_ENDLESS_BR);
            };
        }

        const btnSitNGo = document.getElementById('btnSitNGo');
        if (btnSitNGo) {
            btnSitNGo.onclick = () => {
                console.log('[Launch] Starting Sit-n-Go BR mode');
                this.uiController.setStatus('Joining Sit-n-Go BR queue...');
                this._connect(CLIENT_EVENTS.JOIN_SITNGO_BR);
            };
        }

        const btnTeamBr = document.getElementById('btnTeamBr');
        if (btnTeamBr) {
            btnTeamBr.onclick = () => {
                console.log('[Launch] Starting Team Endless BR mode');
                this.uiController.setStatus('Joining Team Endless Battle Royale...');
                this._connect(CLIENT_EVENTS.JOIN_TEAM_ENDLESS_BR);
            };
        }
        
        const btnTeamSitNGo = document.getElementById('btnTeamSitNGo');
        if (btnTeamSitNGo) {
            btnTeamSitNGo.onclick = () => {
                console.log('[Launch] Starting Team Sit-n-Go BR mode');
                this.uiController.setStatus('Joining Team Sit-n-Go BR queue...');
                this._connect(CLIENT_EVENTS.JOIN_TEAM_SITNGO_BR);
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
