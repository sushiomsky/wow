/**
 * play.js — Arcade-first entry controller with attract mode.
 *
 * The SP engine runs continuously behind a semi-transparent overlay,
 * showing the game's title screen cycle as attract mode.
 * Clicking PLAY starts gameplay instantly (engine already loaded).
 * 
 * NOW INTEGRATED WITH EngineController FOR AUTOMATION:
 * - window.engine provides global API
 * - window.swowDebug provides debug commands
 * - UI responds to engine events (passive UI)
 */

// ─── Imports ─────────────────────────────────────────────────────────
import { CLIENT_EVENTS } from '../game/multiplayer/client/multiplayerEvents.js';

// ─── Engine Integration ───────────────────────────────────────────────
// The engine controller auto-initializes and exposes window.engine
// We subscribe to its events to coordinate UI updates

// Wait for engine to be available (async, not blocking)
function subscribeToEngine() {
    const engine = window.engine;
    if (!engine) {
        console.warn('[play.js] Engine not yet available, will retry...');
        setTimeout(subscribeToEngine, 100);
        return;
    }
    
    // Subscribe to engine events
    engine.on('startSP', ({ numPlayers }) => {
        _startSPForEngine(numPlayers);
    });
    
    engine.on('startMP', ({ roomCode, autoConnect }) => {
        _startMPForEngine(roomCode, autoConnect);
    });
    
    engine.on('teardown', () => {
        _teardownForEngine();
    });
    
    engine.on('reset', () => {
        goToTitle();
    });
    
    console.log('[play.js] Engine subscriptions registered');
}

// Start subscription attempt
subscribeToEngine();

// ─── Module loaders (lazy, cached) ────────────────────────────────
let _spModule = null;
let _mpModule = null;

async function loadSP() {
    if (!_spModule) _spModule = await import('../game/singleplayer/App.js');
    return _spModule;
}
async function loadMP() {
    if (!_mpModule) _mpModule = await import('../game/multiplayer/client/MultiplayerApp.js');
    return _mpModule;
}

// ─── State ────────────────────────────────────────────────────────
let _state = 'loading';   // loading | title | playing | gameover
let _activeMode = null;   // 'sp' | 'mp'
let _spApp = null;
let _engine = null;
let _spCSSLink = null;
let _mpCSSLinks = [];
let _mpGameOverHandler = null;
let _handlers = {};
const ATTRACT_INIT_TIMEOUT_MS = 5000;

const overlay = document.getElementById('play-overlay');
const gameRoot = document.getElementById('game-root');

function setAmbientUiVisible(visible) {
    document.getElementById('background-game-canvas')?.classList.toggle('hide', !visible);
    document.getElementById('active-games-container')?.classList.toggle('hide', !visible);
}

// ─── Overlay ──────────────────────────────────────────────────────
function showOverlay(show) {
    overlay.classList.toggle('hide', !show);
}

// ─── DOM templates ────────────────────────────────────────────────
function createSPDOM() {
    const root = document.createElement('div');
    root.id = 'sp-root';
    root.innerHTML = `
        <div id="body">
            <div id="border">
                <canvas id="screen" width="960" height="600" class="hide" moz-opaque></canvas>
                <canvas id="visualFilterLayer" width="960" height="600"></canvas>
            </div>
            <div id="menuOverlay" class="hide"></div>
            <div id="menuToggler" class="hide"><span>Menu</span></div>
            <div id="menu">
                <div class="l1 back nosubmenu">&lt; Close</div>
                <div id="toggleFullscreen" class="l1 nosubmenu">Fullscreen</div>
                <div class="l1">Visual filter<div id="visualFilterSelect" class="items closed">
                    <div data-value="none">none</div>
                    <div data-value="scanlines">Scan lines</div>
                    <div data-value="bwTv">black and white TV</div>
                    <div data-value="colorTv">color TV</div>
                    <div data-value="greenC64monitor">green C64 monitor</div>
                </div></div>
                <div class="l1">Sounds<div id="soundSelect" class="items closed">
                    <div data-value="on">on</div>
                    <div data-value="off">off</div>
                </div></div>
                <div id="ctrlYellow" class="l1">Yellow warrior control<div id="yellowControlSelect" class="items closed">
                    <div data-value="keyboard">keyboard</div>
                    <div data-value="gamepad0">gamepad #1</div>
                    <div data-value="gamepad1">gamepad #2</div>
                    <div id="yellowBindUp">UP: -</div>
                    <div id="yellowBindDown">DOWN: -</div>
                    <div id="yellowBindLeft">LEFT: -</div>
                    <div id="yellowBindRight">RIGHT: -</div>
                    <div id="yellowBindFire">FIRE: -</div>
                </div></div>
                <div id="ctrlBlue" class="l1">Blue warrior control<div id="blueControlSelect" class="items closed">
                    <div data-value="keyboard">keyboard</div>
                    <div data-value="gamepad0">gamepad #1</div>
                    <div data-value="gamepad1">gamepad #2</div>
                    <div id="blueBindUp">UP: -</div>
                    <div id="blueBindDown">DOWN: -</div>
                    <div id="blueBindLeft">LEFT: -</div>
                    <div id="blueBindRight">RIGHT: -</div>
                    <div id="blueBindFire">FIRE: -</div>
                </div></div>
            </div>
        </div>
        <img src="/images/v4.0/noise.png" id="crtNoise" class="hide" alt="">
        <span style="font-family:WizardOfWor"></span>
    `;
    return root;
}

function createMPDOM() {
    const root = document.createElement('div');
    root.id = 'mp-root';
    root.innerHTML = `
        <div id="overlay">
            <h1>WIZARD OF WOR</h1>
            <p>2-Player Private Room</p>
            <div style="margin-top:20px;">
                <button class="btn blue" id="btnPairCreate">&#128279; CREATE ROOM</button>
                <div style="margin-top: 12px;">
                    <input id="pairCode" type="text" maxlength="12" placeholder="Room code"
                        style="padding: 10px 12px; font-family: inherit; width: 240px; text-transform: uppercase; letter-spacing: 2px;">
                    <button class="btn" id="btnPairJoin">JOIN ROOM</button>
                </div>
                <button class="btn dark" id="btnBackToMenu" style="margin-top:12px; background:#333;">&#9664; BACK</button>
            </div>
            <div id="status" role="status" aria-live="polite"></div>
        </div>
        <div id="body">
            <div id="border">
                <canvas id="screen" width="960" height="600" class="hide" moz-opaque></canvas>
                <canvas id="visualFilterLayer" width="960" height="600"></canvas>
            </div>
        </div>
        <img src="/images/v4.0/noise.png" id="crtNoise" class="hide" alt="">
        <span style="font-family:WizardOfWor"></span>
        <div id="hud" class="hide"><span id="hud-dungeon"></span></div>
        <div id="controls-hint">ARROWS + CTRL to move/shoot &nbsp;|&nbsp; ESC: back</div>
    `;
    return root;
}

// ─── CSS helper ───────────────────────────────────────────────────
function loadCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    return link;
}

// ─── Game event handlers (persistent while SP is alive) ───────────
function registerHandlers() {
    if (Object.keys(_handlers).length > 0) return;

    _handlers['swow:player-death'] = () => {
        if (_state !== 'playing' && _state !== 'gameover') return;
        gameRoot.classList.remove('shake');
        void gameRoot.offsetWidth;
        gameRoot.classList.add('shake');
    };

    _handlers['swow:game-over'] = (e) => {
        if (_state !== 'playing') return;
        buildGameOverOverlay(e.detail);
        _state = 'gameover';
    };

    _handlers['swow:game-restart'] = () => {
        document.getElementById('play-gameover')?.remove();
        if (_state === 'gameover' || _state === 'playing') _state = 'playing';
    };

    _handlers['swow:kill-score'] = (e) => {
        if (_state !== 'playing') return;
        const { score, x, y } = e.detail;
        const canvas = gameRoot.querySelector('canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const sx = rect.left + (x / 320) * rect.width;
        const sy = rect.top + (y / 200) * rect.height;
        const pop = document.createElement('div');
        pop.className = 'kill-popup';
        pop.textContent = '+' + score;
        pop.style.left = sx + 'px';
        pop.style.top = sy + 'px';
        document.body.appendChild(pop);
        setTimeout(() => pop.remove(), 800);
    };

    for (const [event, handler] of Object.entries(_handlers)) {
        document.addEventListener(event, handler);
    }
}

function unregisterHandlers() {
    for (const [event, handler] of Object.entries(_handlers)) {
        document.removeEventListener(event, handler);
    }
    _handlers = {};
}

// ─── SP attract engine (persistent background) ───────────────────
async function initAttract() {
    if (_spApp) return;

    if (!_spCSSLink) {
        _spCSSLink = loadCSS('/frontend/styles/singleplayer.css');
    }

    gameRoot.innerHTML = '';
    gameRoot.appendChild(createSPDOM());

    const mod = await loadSP();
    _spApp = mod.initSingleplayer();
    _activeMode = 'sp';

    // Wait for engine to initialize
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            clearInterval(check);
            reject(new Error('Timed out waiting for singleplayer attract engine'));
        }, ATTRACT_INIT_TIMEOUT_MS);

        const check = setInterval(() => {
            if (_spApp?.engine) {
                _engine = _spApp.engine;
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
            }
        }, 50);
    });

    // Notify engine controller
    if (window.engine) {
        window.engine._setSPApp(_spApp, _engine);
    }

    registerHandlers();
}

async function teardownSP() {
    unregisterHandlers();
    if (_spModule) {
        try { _spModule.destroySingleplayer(); } catch (_) { /* ok */ }
    }
    _spApp = null;
    _engine = null;
    _activeMode = null;
    document.getElementById('sp-root')?.remove();
    document.getElementById('play-gameover')?.remove();
    document.querySelectorAll('.kill-popup').forEach(el => el.remove());
    if (_spCSSLink) { _spCSSLink.remove(); _spCSSLink = null; }
}

// ─── Build game-over overlay ──────────────────────────────────────
function buildGameOverOverlay(detail) {
    const { p1Score, p2Score, numPlayers, isNewHigh, wave } = detail;
    const topScore = Math.max(p1Score, p2Score);

    document.getElementById('play-gameover')?.remove();

    const el = document.createElement('div');
    el.id = 'play-gameover';

    const gameUrl = window.location.origin + '/?challenge=' + topScore;
    const shareText = `I scored ${topScore} in Wizard of Wor (Wave ${wave}) — beat me! ${gameUrl}`;
    const twitterUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText);

    let html = '<div class="go-content">';
    if (isNewHigh) html += '<div class="go-newhigh">★ NEW HIGH SCORE ★</div>';
    html += `<div class="go-score">${topScore}</div>`;
    html += `<div class="go-wave">WAVE ${wave}</div>`;
    if (numPlayers > 1) html += `<div class="go-detail">P1: ${p1Score}  P2: ${p2Score}</div>`;
    html += '<div class="go-share">';
    html += `<a class="go-share-btn go-share-twitter" href="${twitterUrl}" target="_blank" rel="noopener">𝕏 SHARE</a>`;
    html += `<button class="go-share-btn go-share-copy" data-text="${shareText.replace(/"/g, '&quot;')}">📋 COPY</button>`;
    html += '</div>';
    html += '<div class="go-actions">';
    html += '<button class="go-replay-btn" id="go-replay">▶ PLAY AGAIN</button>';
    html += '</div>';
    html += '<div class="go-hint">PRESS FIRE TO RESTART</div>';
    html += '</div>';
    el.innerHTML = html;
    gameRoot.appendChild(el);

    el.querySelector('.go-share-copy')?.addEventListener('click', (ev) => {
        navigator.clipboard?.writeText(ev.currentTarget.dataset.text).then(() => {
            ev.currentTarget.textContent = '✓ COPIED';
        });
    });
    el.querySelector('#go-replay')?.addEventListener('click', () => {
        if (window.engine) {
            void window.engine.startNewGame(1);
            return;
        }
        void startGame(1);
    });
}

// ─── Build MP post-match overlay ──────────────────────────────────
function buildMPPostMatchOverlay(detail) {
    const { p1Score, p2Score, myPlayerNum, myScore } = detail;
    const opponentScore = myPlayerNum === 0 ? p2Score : p1Score;
    const won = myScore > opponentScore;
    const tied = myScore === opponentScore;

    document.getElementById('play-gameover')?.remove();

    const el = document.createElement('div');
    el.id = 'play-gameover';

    const resultText = tied ? 'DRAW' : (won ? 'YOU WIN!' : 'YOU LOSE');
    const resultClass = tied ? 'go-draw' : (won ? 'go-win' : 'go-lose');

    let html = '<div class="go-content">';
    html += `<div class="go-result ${resultClass}">${resultText}</div>`;
    html += `<div class="go-score">${myScore}</div>`;
    html += '<div class="go-detail">';
    html += `P1: ${p1Score} &nbsp;|&nbsp; P2: ${p2Score}`;
    html += '</div>';
    html += '<div class="go-actions" style="display:flex; flex-direction:column; gap:10px; align-items:center;">';
    html += '<button class="go-replay-btn" id="go-mp-newroom">⚔ NEW ROOM</button>';
    html += '<button class="go-share-btn" id="go-mp-back" style="padding:8px 20px;">◀ BACK TO MENU</button>';
    html += '</div>';
    html += '</div>';
    el.innerHTML = html;
    gameRoot.appendChild(el);

    el.querySelector('#go-mp-newroom')?.addEventListener('click', () => {
        document.getElementById('play-gameover')?.remove();
        if (window.engine) {
            void window.engine.createRoom();
            return;
        }
        void startMP(null, { autoConnect: 'create' });
    });
    el.querySelector('#go-mp-back')?.addEventListener('click', () => goToTitle());
}

// ─── Start game (instant — engine already running) ────────────────
async function startGame(numPlayers) {
    // Wait for engine to be ready
    if (!_engine) {
        console.log('[play.js] Engine not ready, initializing attract mode...');
        try {
            await initAttract();
        } catch (err) {
            console.error('[play.js] Failed to init engine:', err);
            return;
        }
    }
    
    if (!_engine) {
        console.error('[play.js] Engine still not available after init');
        return;
    }
    
    setAmbientUiVisible(false);
    showOverlay(false);
    document.getElementById('play-gameover')?.remove();
    _engine.startNewGame(numPlayers);
    _state = 'playing';
}

// ─── Go to title (show overlay over attract) ─────────────────────
async function goToTitle() {
    document.getElementById('play-gameover')?.remove();
    document.querySelectorAll('.kill-popup').forEach(el => el.remove());

    if (_activeMode === 'mp') {
        await teardownMP();
        await initAttract();
    }

    setAmbientUiVisible(true);
    showOverlay(true);
    _state = 'title';
}

// ─── Start Multiplayer ────────────────────────────────────────────
async function startMP(roomCode, options = {}) {
    const { autoConnect = null } = options;

    try {
        // Show loading if auto-joining from URL
        if (roomCode && _state === 'loading') {
            showOverlay(true);
            overlay.innerHTML = '<div class="play-loading">🎮 Connecting to multiplayer...</div>';
        }

        // Tear down existing mode (SP or MP)
        if (_activeMode === 'mp') {
            await teardownMP();
        } else {
            await teardownSP();
        }
        
        document.getElementById('play-gameover')?.remove();
        setAmbientUiVisible(false);
        showOverlay(false);
        _activeMode = 'mp';

        _mpCSSLinks.push(loadCSS('/frontend/styles/multiplayer.css'));
        gameRoot.appendChild(createMPDOM());

        const backBtn = gameRoot.querySelector('#btnBackToMenu');
        if (backBtn) backBtn.addEventListener('click', () => goToTitle());

        // MP post-match handler
        _mpGameOverHandler = (e) => buildMPPostMatchOverlay(e.detail);
        document.addEventListener('swow:mp-game-over', _mpGameOverHandler);

        // Set room URL param only if joining specific room, keep it in URL
        if (roomCode) {
            const url = new URL(window.location);
            url.searchParams.set('room', roomCode);
            window.history.replaceState({}, '', url);
        }

        const mod = await loadMP();
        const mpApp = mod.initMultiplayer();

        // Notify engine controller
        if (window.engine) {
            window.engine._setMPApp(mpApp);
            if (roomCode) {
                window.engine._setRoomCode(roomCode);
            }
        }

        if (autoConnect === 'create' && mpApp?._connect) {
            mpApp._connect(CLIENT_EVENTS.JOIN_PAIR);
        }

        _state = 'playing';
    } catch (err) {
        console.error('Failed to start multiplayer:', err);
        // Fall back to title screen on error
        await goToTitle();
        const banner = document.createElement('div');
        banner.className = 'play-challenge';
        banner.style.color = '#f44';
        banner.innerHTML = '❌ Failed to connect to multiplayer. Please try again.';
        overlay.insertBefore(banner, overlay.firstChild);
        setTimeout(() => banner.remove(), 5000);
    }
}

async function teardownMP() {
    if (_mpGameOverHandler) {
        document.removeEventListener('swow:mp-game-over', _mpGameOverHandler);
        _mpGameOverHandler = null;
    }
    if (_mpModule) {
        try { _mpModule.destroyMultiplayer(); } catch (_) { /* ok */ }
    }
    _activeMode = null;
    document.getElementById('mp-root')?.remove();
    _mpCSSLinks.forEach(l => l.remove());
    _mpCSSLinks = [];
}

// ─── Engine-driven initialization (for automation) ────────────────────

async function _startSPForEngine(numPlayers) {
    // Called by EngineController when automation requests SP game
    if (!_spApp) {
        await initAttract();
    }
    setAmbientUiVisible(false);
    showOverlay(false);
    document.getElementById('play-gameover')?.remove();
    _state = 'playing';
}

async function _startMPForEngine(roomCode, autoConnect = null) {
    // Called by EngineController when automation requests MP game
    await startMP(roomCode, { autoConnect });
}

function _teardownForEngine() {
    unregisterHandlers();
    _spApp = null;
    _engine = null;
    _activeMode = null;
    document.getElementById('sp-root')?.remove();
    document.getElementById('mp-root')?.remove();
    document.getElementById('play-gameover')?.remove();
    document.querySelectorAll('.kill-popup').forEach(el => el.remove());
    if (_mpGameOverHandler) {
        document.removeEventListener('swow:mp-game-over', _mpGameOverHandler);
        _mpGameOverHandler = null;
    }
    if (_spCSSLink) {
        _spCSSLink.remove();
        _spCSSLink = null;
    }
    _mpCSSLinks.forEach(link => link.remove());
    _mpCSSLinks = [];
}

// ─── Bind UI ──────────────────────────────────────────────────────
// UI buttons now trigger engine controller methods (can also use engine directly)
document.getElementById('btn-play')?.addEventListener('click', async () => {
    if (window.engine) {
        await window.engine.startNewGame(1);
        return;
    }
    await startGame(1);
});

document.getElementById('btn-2p')?.addEventListener('click', async () => {
    if (window.engine) {
        await window.engine.startNewGame(2);
        return;
    }
    await startGame(2);
});

document.getElementById('btn-multi')?.addEventListener('click', async () => {
    if (window.engine) {
        await window.engine.createRoom();
        return;
    }
    await startMP(null, { autoConnect: 'create' });
});

// Battle Royale mode buttons
document.getElementById('btn-br-endless')?.addEventListener('click', () => {
    window.location.href = '/mp?mode=endless';
});

// Keyboard shortcuts (global)
document.addEventListener('keydown', (e) => {
    if (_state === 'title') {
        switch (e.code) {
            case 'Space': case 'Enter': case 'Digit1':
                e.preventDefault();
                if (window.engine) {
                    void window.engine.startNewGame(1);
                } else {
                    void startGame(1);
                }
                return;
            case 'Digit2':
                e.preventDefault();
                if (window.engine) {
                    void window.engine.startNewGame(2);
                } else {
                    void startGame(2);
                }
                return;
        }
        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            if (window.engine) {
                void window.engine.createRoom();
            } else {
                void startMP(null, { autoConnect: 'create' });
            }
            return;
        }
        if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            window.location.href = '/mp?mode=endless';
            return;
        }
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            if (window.engine) {
                void window.engine.createRoom();
            } else {
                void startMP(null, { autoConnect: 'create' });
            }
            return;
        }
    }
    if (e.code === 'Escape' && (_state === 'playing' || _state === 'gameover')) {
        e.preventDefault();
        goToTitle();
    }
});

// ─── URL params: auto-join room / challenge banner / autoplay ────────
const _params = new URLSearchParams(window.location.search);
const _roomCode = _params.get('room') || _params.get('pair');
const _autoplay = _params.get('autoplay');

if (_autoplay) {
    // DETERMINISTIC AUTOPLAY: Chain with events
    (async () => {
        if (!window.engine) {
            console.error('[Autoplay] Engine not available');
            return;
        }
        
        try {
            // Wait for engine initialization
            await window.swowDebug.waitReady();
            console.log('[Autoplay] Engine ready');
            
            if (_autoplay === 'create') {
                // Create MP room and emit event when ready
                console.log('[Autoplay] Creating room...');
                const state = await window.engine.createRoom();
                
                // Wait for room to be fully created
                if (state.roomCode) {
                    console.log('[Autoplay] Room created:', state.roomCode);
                    
                    // Emit custom event for automation
                    window.dispatchEvent(new CustomEvent('autoplay:ready', {
                        detail: { mode: 'create', roomCode: state.roomCode, state }
                    }));
                }
            } else if (_roomCode) {
                console.log('[Autoplay] Joining room...');
                const state = await window.engine.joinRoom(_roomCode);

                if (_autoplay === 'bot') {
                    console.log('[Autoplay] Bot mode detected, loading bot...');

                    try {
                        const { SimpleBot } = await import('/frontend/app/SimpleBot.js');
                        window.bot = new SimpleBot();
                        window.bot.start();
                        console.log('[Autoplay] Bot started!');
                    } catch (err) {
                        console.error('[Autoplay] Failed to start bot:', err);
                    }
                }

                window.dispatchEvent(new CustomEvent('autoplay:ready', {
                    detail: {
                        mode: _autoplay === 'bot' ? 'bot' : 'mp',
                        roomCode: _roomCode,
                        state,
                    }
                }));
            } else {
                // Start SP game
                const players = parseInt(_params.get('players')) || 1;
                console.log(`[Autoplay] Starting ${players}P game...`);
                
                const state = await window.engine.startNewGame(players);
                
                if (state.state === 'playing') {
                    console.log('[Autoplay] Game started');
                    
                    // Check if bot mode requested
                    if (_autoplay === 'bot') {
                        console.log('[Autoplay] Bot mode detected, loading bot...');
                        
                        // Load and start bot
                        try {
                            const { SimpleBot } = await import('/frontend/app/SimpleBot.js');
                            window.bot = new SimpleBot();
                            window.bot.start();
                            console.log('[Autoplay] Bot started!');
                        } catch (err) {
                            console.error('[Autoplay] Failed to start bot:', err);
                        }
                    }
                    
                    // Emit custom event for automation
                    window.dispatchEvent(new CustomEvent('autoplay:ready', {
                        detail: { 
                            mode: _autoplay === 'bot' ? 'bot' : 'sp', 
                            players, 
                            state 
                        }
                    }));
                }
            }
        } catch (err) {
            console.error('[Autoplay] Failed:', err);
            
            // Emit error event
            window.dispatchEvent(new CustomEvent('autoplay:error', {
                detail: { error: err.message }
            }));
        }
    })();
} else if (_roomCode) {
    startMP(_roomCode);
} else {
    const challengeScore = parseInt(_params.get('challenge'));
    if (challengeScore && !isNaN(challengeScore)) {
        const banner = document.createElement('div');
        banner.className = 'play-challenge';
        banner.innerHTML = `🏆 Someone scored <strong>${challengeScore}</strong> — can you beat it?`;
        overlay.insertBefore(banner, overlay.firstChild);
        window.history.replaceState({}, '', window.location.pathname);
    }

    setAmbientUiVisible(true);
    // Start attract mode engine, then show overlay on top
    showOverlay(true);
    initAttract()
        .then(() => { _state = 'title'; })
        .catch(err => {
            console.error('[play.js] Failed to init attract mode:', err);
            _state = 'title'; // Show UI anyway
        });
}
