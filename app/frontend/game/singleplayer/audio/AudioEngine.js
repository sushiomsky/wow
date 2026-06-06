export class AudioEngine {
    constructor() {
        this.audioContext = window.AudioContext || window.webkitAudioContext;
        this.context = new this.audioContext;
        this.neededResources = "Speed1.ogg Speed2.ogg Speed3.ogg Speed4.ogg Speed5.ogg Speed6.ogg Speed7.ogg Death.ogg Doublescore.ogg EnemyFire.ogg Fire.ogg Enter.ogg GameOver.ogg GetReady.ogg Shooted.ogg Teleport.ogg Visible.ogg Worluk.ogg WorlukDeath.ogg WorlukEscape.ogg WizardDeath.ogg WizardEscape.ogg".split(" ");
        this.sounds = {};
        this.queue = [];
        this.activeSounds = [];
    }

    init() {
        // Initialization logic if needed, currently called in App.js
    }

    request(a) {
        for (var c = 0; c < this.queue.length; c++)
            if (this.queue[c].name == a.name) return;
        this.queue.push(a);
        return !0
    }

    playQueue() {
        for (var a = 0; a < this.queue.length; a++) {
            var c = this.queue[a];
            if (c.name) {
                void 0 === c.loop && (c.loop = !1);
                var f = this.play(c.name, c.loop);
                f && this.activeSounds.push({ name: c.name, bufferSource: f })
            }
        }
        this.queue = []
    }

    stop(a) {
        for (var c = 0; c < this.activeSounds.length; c++)
            0 === this.activeSounds[c].name.indexOf(a) && (this.activeSounds[c].bufferSource.stop(0), this.activeSounds[c].name = "_stopped")
    }

    stopAllSound(a) {
        for (a = 0; a < this.activeSounds.length; a++)
            "_stopped" != this.activeSounds[a].name && this.activeSounds[a].bufferSource.stop(0);
        this.queue = [];
        this.activeSounds = []
    }

    loadAudioResource(a, onLoaded) {
        var c = this.neededResources[a],
            f = c.split(".")[0],
            d = new XMLHttpRequest;
        d.open("GET", "/audio/v2.0/" + c, !0);
        d.responseType = "arraybuffer";
        d.onload = () => {
            this.context.decodeAudioData(d.response, (g) => {
                this.sounds[f] = g;
                if (a + 1 < this.neededResources.length) {
                    this.loadAudioResource(a + 1, onLoaded);
                }
                onLoaded();
            }, (g) => { })
        };
        d.send()
    }

    play(a, c) {
        // b.options.sound check will happen outside or via a passed config
        c = c ? !0 : !1;
        var f = this.context.createBufferSource();
        f.buffer = this.sounds[a];
        f.loop = c;
        f.connect(this.context.destination);
        f.start(this.context.currentTime, 0);
        return f
    }
}
