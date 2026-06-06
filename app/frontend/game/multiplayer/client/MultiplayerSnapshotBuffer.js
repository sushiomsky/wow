const DEFAULT_RENDER_DELAY_MS = 100;
const MAX_BUFFERED_SNAPSHOTS = 12;

function cloneState(state) {
    if (typeof structuredClone === 'function') return structuredClone(state);
    return JSON.parse(JSON.stringify(state));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function interpolateEntity(a, b, t) {
    if (!a || !b) return a || b;
    const out = { ...b };
    if (Number.isFinite(a.x) && Number.isFinite(b.x)) out.x = lerp(a.x, b.x, t);
    if (Number.isFinite(a.y) && Number.isFinite(b.y)) out.y = lerp(a.y, b.y, t);
    return out;
}

function interpolateIndexedArray(aList = [], bList = [], t) {
    return bList.map((b, index) => interpolateEntity(aList[index], b, t));
}

export class MultiplayerSnapshotBuffer {
    constructor({ renderDelayMs = DEFAULT_RENDER_DELAY_MS } = {}) {
        this.renderDelayMs = renderDelayMs;
        this.snapshots = [];
        this.clockOffsetMs = null;
        this.lastRenderedTick = null;
    }

    push(state) {
        if (!state) return;
        const clientReceivedAt = performance.now();
        const serverTime = Number(state.serverTimeMs ?? state.serverTime ?? clientReceivedAt);
        const sampleOffset = serverTime - clientReceivedAt;
        this.clockOffsetMs = this.clockOffsetMs === null
            ? sampleOffset
            : this.clockOffsetMs * 0.9 + sampleOffset * 0.1;

        this.snapshots.push({ state, clientReceivedAt, serverTime });
        this.snapshots.sort((a, b) => a.serverTime - b.serverTime);
        while (this.snapshots.length > MAX_BUFFERED_SNAPSHOTS) this.snapshots.shift();
    }

    latest() {
        return this.snapshots[this.snapshots.length - 1]?.state || null;
    }

    getRenderState(now = performance.now()) {
        if (this.snapshots.length === 0) return null;
        if (this.snapshots.length === 1 || this.clockOffsetMs === null) return this.latest();

        const targetServerTime = now + this.clockOffsetMs - this.renderDelayMs;
        let previous = this.snapshots[0];
        let next = null;
        for (let i = 1; i < this.snapshots.length; i++) {
            if (this.snapshots[i].serverTime >= targetServerTime) {
                next = this.snapshots[i];
                break;
            }
            previous = this.snapshots[i];
        }

        if (!next) return this.latest();
        const span = Math.max(1, next.serverTime - previous.serverTime);
        const t = Math.max(0, Math.min(1, (targetServerTime - previous.serverTime) / span));
        return this._interpolate(previous.state, next.state, t);
    }

    getDebugStats() {
        const latest = this.latest();
        return {
            buffer: this.snapshots.length,
            tick: latest?.serverTick ?? null,
            delayMs: this.renderDelayMs,
        };
    }

    reset() {
        this.snapshots = [];
        this.clockOffsetMs = null;
        this.lastRenderedTick = null;
    }

    _interpolate(a, b, t) {
        if (!a || !b || a.scene !== b.scene || a.dungeonId !== b.dungeonId) return b || a;
        const out = cloneState(b);
        out.players = interpolateIndexedArray(a.players, b.players, t);
        out.monsters = interpolateIndexedArray(a.monsters, b.monsters, t);
        out.bullets = interpolateIndexedArray(a.bullets, b.bullets, t);
        return out;
    }
}
