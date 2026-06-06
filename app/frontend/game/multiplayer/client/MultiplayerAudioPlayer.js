export class MultiplayerAudioPlayer {
    constructor() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = AudioContextClass ? new AudioContextClass() : null;
        this.buffers = {};
        this.active = [];
        this._load();
    }

    async _load() {
        if (!this.ctx) return;
        const files = 'Speed1 Speed2 Speed3 Speed4 Speed5 Speed6 Speed7 Death Doublescore EnemyFire Fire Enter GameOver GetReady Shooted Teleport Visible Worluk WorlukDeath WorlukEscape WizardDeath WizardEscape'.split(' ');
        for (const name of files) {
            try {
                const response = await fetch(`/audio/v2.0/${name}.ogg`);
                const arrayBuffer = await response.arrayBuffer();
                this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
            } catch (_error) {
                // Non-fatal: missing assets should not break gameplay.
            }
        }
    }

    play(name, loop = false) {
        if (!this.ctx || !this.buffers[name]) return null;
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.buffers[name];
            source.loop = loop;
            source.connect(this.ctx.destination);
            source.start(this.ctx.currentTime, 0);
            this.active.push({ name, source });
            return source;
        } catch (_error) {
            return null;
        }
    }

    stop(name) {
        this.active = this.active.filter((item) => {
            if (item.name === name || item.name.startsWith(name)) {
                try {
                    item.source.stop();
                } catch (_error) {
                    // noop
                }
                return false;
            }
            return true;
        });
    }

    stopAll() {
        this.active.forEach((item) => {
            try {
                item.source.stop();
            } catch (_error) {
                // noop
            }
        });
        this.active = [];
    }

    processSounds(sounds, enabled = true) {
        if (!enabled || !sounds) return;
        for (const sound of sounds) {
            if (sound.stopOnly) {
                this.stop(sound.name);
                continue;
            }
            if (sound.stopFirst) this.stop(sound.name);
            this.play(sound.name, sound.loop);
        }
    }

    resumeContext() {
        if (!this.ctx || this.ctx.state !== 'suspended') return;
        this.ctx.resume();
    }
}
