import { q } from '../../shared/utils.js';

export class MultiplayerUiController {
    setPlayerName(name) {
        const el = document.getElementById('player-name');
        if (el) el.textContent = name ? `Playing as ${name}` : '';
    }
    setStatus(message) {
        const el = this._getStatusEl();
        if (!el) return;
        el.textContent = message;
        el.setAttribute('aria-atomic', 'true');
    }

    setStatusError(isError) {
        const el = this._getStatusEl();
        if (!el) return;
        const error = !!isError;
        el.classList.toggle('error', error);
        el.setAttribute('aria-live', error ? 'assertive' : 'polite');
        el.setAttribute('role', error ? 'alert' : 'status');
    }

    setButtonState(disabled) {
        const ids = ['btnPairCreate', 'btnPairJoin', 'btnSolo'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.disabled = !!disabled;
        }
    }

    toggleRetry(show) {
        const el = document.getElementById('btnRetry');
        if (!el) return;
        const visible = !!show;
        el.classList.toggle('hide', !visible);
        el.disabled = !visible;
        el.setAttribute('aria-hidden', String(!visible));
    }

    hideOverlay() {
        const el = document.getElementById('overlay');
        if (el) el.classList.add('hide');
    }

    showOverlay() {
        const el = document.getElementById('overlay');
        if (el) el.classList.remove('hide');
    }

    showGameSurface() {
        q('screen').classList.remove('hide');
        q('hud').classList.remove('hide');
        document.body.classList.add('in-game');
    }

    hideGameSurface() {
        q('screen').classList.add('hide');
        q('hud').classList.add('hide');
        document.body.classList.remove('in-game');
    }

    setHudDungeonText(text) {
        const el = document.getElementById('hud-dungeon');
        if (el) el.textContent = text;
    }

    _getStatusEl() {
        return document.getElementById('status');
    }
}
