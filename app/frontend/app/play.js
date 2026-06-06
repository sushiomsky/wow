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

    engine.on('roomCode', ({ roomCode }) => {
        if (currentSetupMode === 'network_owner') {
            const joinUrl = `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`;
            const input = document.getElementById('share-link-input');
            if (input) input.value = joinUrl;
            
            const spinner = document.getElementById('network-spinner');
            if (spinner) spinner.classList.add('hide');
            
            const linkSec = document.getElementById('network-link-section');
            if (linkSec) linkSec.classList.remove('hide');
            
            const status = document.getElementById('network-status');
            if (status) status.textContent = 'Waiting for player 2 to join...';
        }
    });

    engine.on('playing', () => {
        setAmbientUiVisible(false);
        showOverlay(false);
        _state = 'playing';
    });

    engine.on('error', (err) => {
        const status = document.getElementById('network-status');
        if (status) status.textContent = `Error: ${err.message}`;
        const spinner = document.getElementById('network-spinner');
        if (spinner) spinner.classList.add('hide');
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

// Setup Panel Variables & Control Customization
let currentSetupMode = null; // 'sp' | 'local2p' | 'network_owner' | 'network_joiner'
let currentRebindPlayer = null;
let currentRebindIndex = 0;
let rebindingKeys = {};
const rebindActions = ['up', 'down', 'left', 'right', 'fire'];

function getKeyCodeLabel(code) {
    const map = {
        8: 'Backspace',
        9: 'Tab',
        13: 'Enter',
        16: 'L-Shift',
        17: 'Ctrl',
        18: 'Alt',
        20: 'Caps',
        27: 'Esc',
        32: 'Space',
        37: 'Left',
        38: 'Up',
        39: 'Right',
        40: 'Down',
    };
    if (map[code]) return map[code];
    if (code >= 48 && code <= 57) return String.fromCharCode(code);
    if (code >= 65 && code <= 90) return String.fromCharCode(code).toUpperCase();
    return `Key ${code}`;
}

function showRebindModal(player) {
    currentRebindPlayer = player;
    currentRebindIndex = 0;
    rebindingKeys = {};
    
    const subtitle = document.getElementById('modal-subtitle');
    if (subtitle) subtitle.textContent = player === 1 ? 'P1 (Yellow Warrior)' : 'P2 (Blue Warrior)';
    
    const modal = document.getElementById('controls-modal');
    if (modal) modal.classList.remove('hide');
    
    // Clear display rows
    rebindActions.forEach(act => {
        const row = document.getElementById(`modal-row-${act}`);
        if (row) {
            row.classList.remove('active', 'done');
            const span = row.querySelector('span');
            if (span) span.textContent = '-';
        }
    });
    
    // Set first action active
    setActiveRebindAction(rebindActions[0]);
    
    // Bind keydown event
    document.addEventListener('keydown', handleRebindKeyDown);
}

function setActiveRebindAction(act) {
    const prompt = document.getElementById('modal-prompt');
    if (prompt) prompt.textContent = `PRESS KEY FOR ${act.toUpperCase()}`;
    const row = document.getElementById(`modal-row-${act}`);
    if (row) row.classList.add('active');
}

function handleRebindKeyDown(e) {
    e.preventDefault();
    const keyCode = e.keyCode || e.which;
    
    if (keyCode === 27) { // Escape key
        closeRebindModal();
        return;
    }
    
    const act = rebindActions[currentRebindIndex];
    rebindingKeys[act] = keyCode;
    
    // Mark row as done
    const row = document.getElementById(`modal-row-${act}`);
    if (row) {
        row.classList.remove('active');
        row.classList.add('done');
        const span = row.querySelector('span');
        if (span) span.textContent = getKeyCodeLabel(keyCode);
    }
    
    currentRebindIndex++;
    if (currentRebindIndex < rebindActions.length) {
        setActiveRebindAction(rebindActions[currentRebindIndex]);
    } else {
        // Complete!
        saveReboundKeys(currentRebindPlayer, rebindingKeys);
        closeRebindModal();
    }
}

function closeRebindModal() {
    const modal = document.getElementById('controls-modal');
    if (modal) modal.classList.add('hide');
    document.removeEventListener('keydown', handleRebindKeyDown);
}

function saveReboundKeys(player, keys) {
    const binding = {
        device: 'keyboard',
        gamepadIndex: 0,
        layout: 'custom',
        actions: {
            up: { kind: 'key', code: keys.up },
            down: { kind: 'key', code: keys.down },
            left: { kind: 'key', code: keys.left },
            right: { kind: 'key', code: keys.right },
            fire: { kind: 'key', code: keys.fire }
        }
    };
    
    const storageKey = player === 1 ? 'yellowControlBinding' : 'blueControlBinding';
    localStorage.setItem(storageKey, JSON.stringify(binding));
    
    if (player === 1) {
        localStorage.setItem('multiplayerControlBinding', JSON.stringify(binding));
        localStorage.setItem('multiplayerControlsConfirmed.v1', 'true');
    }
    
    syncControlsDisplay();
}

function useDefaultKeys(player) {
    let binding;
    if (player === 1) {
        binding = {
            device: 'keyboard',
            gamepadIndex: 0,
            layout: 'arrows',
            actions: {
                up: { kind: 'key', code: 38 },
                down: { kind: 'key', code: 40 },
                left: { kind: 'key', code: 37 },
                right: { kind: 'key', code: 39 },
                fire: { kind: 'key', code: 16 } // Left Shift
            }
        };
        localStorage.setItem('yellowControlBinding', JSON.stringify(binding));
        localStorage.setItem('multiplayerControlBinding', JSON.stringify(binding));
        localStorage.setItem('multiplayerControlsConfirmed.v1', 'true');
    } else {
        binding = {
            device: 'keyboard',
            gamepadIndex: 0,
            layout: 'wasd',
            actions: {
                up: { kind: 'key', code: 87 },
                down: { kind: 'key', code: 83 },
                left: { kind: 'key', code: 65 },
                right: { kind: 'key', code: 68 },
                fire: { kind: 'key', code: 32 } // Space
            }
        };
        localStorage.setItem('blueControlBinding', JSON.stringify(binding));
    }
    syncControlsDisplay();
}

function syncControlsDisplay() {
    // Player 1 Display
    const p1Raw = localStorage.getItem('yellowControlBinding');
    let p1Binding;
    if (p1Raw) {
        try { p1Binding = JSON.parse(p1Raw); } catch(e) {}
    }
    if (!p1Binding) {
        p1Binding = {
            device: 'keyboard',
            gamepadIndex: 0,
            layout: 'arrows',
            actions: {
                up: { kind: 'key', code: 38 },
                down: { kind: 'key', code: 40 },
                left: { kind: 'key', code: 37 },
                right: { kind: 'key', code: 39 },
                fire: { kind: 'key', code: 16 }
            }
        };
    }
    const p1Up = document.getElementById('p1-key-up');
    const p1Down = document.getElementById('p1-key-down');
    const p1Left = document.getElementById('p1-key-left');
    const p1Right = document.getElementById('p1-key-right');
    const p1Fire = document.getElementById('p1-key-fire');
    if (p1Up) p1Up.textContent = getKeyCodeLabel(p1Binding.actions.up.code);
    if (p1Down) p1Down.textContent = getKeyCodeLabel(p1Binding.actions.down.code);
    if (p1Left) p1Left.textContent = getKeyCodeLabel(p1Binding.actions.left.code);
    if (p1Right) p1Right.textContent = getKeyCodeLabel(p1Binding.actions.right.code);
    if (p1Fire) p1Fire.textContent = getKeyCodeLabel(p1Binding.actions.fire.code);

    // Player 2 Display
    const p2Raw = localStorage.getItem('blueControlBinding');
    let p2Binding;
    if (p2Raw) {
        try { p2Binding = JSON.parse(p2Raw); } catch(e) {}
    }
    if (!p2Binding) {
        p2Binding = {
            device: 'keyboard',
            gamepadIndex: 0,
            layout: 'wasd',
            actions: {
                up: { kind: 'key', code: 87 },
                down: { kind: 'key', code: 83 },
                left: { kind: 'key', code: 65 },
                right: { kind: 'key', code: 68 },
                fire: { kind: 'key', code: 32 }
            }
        };
    }
    const p2Up = document.getElementById('p2-key-up');
    const p2Down = document.getElementById('p2-key-down');
    const p2Left = document.getElementById('p2-key-left');
    const p2Right = document.getElementById('p2-key-right');
    const p2Fire = document.getElementById('p2-key-fire');
    if (p2Up) p2Up.textContent = getKeyCodeLabel(p2Binding.actions.up.code);
    if (p2Down) p2Down.textContent = getKeyCodeLabel(p2Binding.actions.down.code);
    if (p2Left) p2Left.textContent = getKeyCodeLabel(p2Binding.actions.left.code);
    if (p2Right) p2Right.textContent = getKeyCodeLabel(p2Binding.actions.right.code);
    if (p2Fire) p2Fire.textContent = getKeyCodeLabel(p2Binding.actions.fire.code);
}

function showPanel(panelName) {
    const modes = document.getElementById('panel-modes');
    const setup = document.getElementById('panel-setup');
    const insertText = document.getElementById('play-insert-text');
    if (panelName === 'modes') {
        if (modes) modes.classList.remove('hide');
        if (setup) setup.classList.add('hide');
        if (insertText) insertText.textContent = 'CHOOSE YOUR MODE';
    } else if (panelName === 'setup') {
        if (modes) modes.classList.add('hide');
        if (setup) setup.classList.remove('hide');
        if (insertText) insertText.textContent = 'SETUP CONFIGURATION';
    }
}

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
        const appOptions = window.engine ? window.engine.options : { palette: 'default', visualFilter: 'none' };
        const mpApp = mod.initMultiplayer(appOptions);

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

// Mode selection triggers Setup panel
document.getElementById('btn-play')?.addEventListener('click', () => {
    currentSetupMode = 'sp';
    const modeTitle = document.getElementById('setup-mode-title');
    if (modeTitle) modeTitle.textContent = 'SINGLE PLAYER SETUP';
    
    const cardP1 = document.getElementById('card-p1');
    const cardP2 = document.getElementById('card-p2');
    const cardNet = document.getElementById('card-network');
    const startBtn = document.getElementById('btn-setup-start');
    if (cardP1) cardP1.classList.remove('hide');
    if (cardP2) cardP2.classList.add('hide');
    if (cardNet) cardNet.classList.add('hide');
    if (startBtn) {
        startBtn.classList.remove('hide');
        startBtn.textContent = 'START GAME';
    }
    
    showPanel('setup');
    syncControlsDisplay();
});

document.getElementById('btn-2p')?.addEventListener('click', () => {
    currentSetupMode = 'local2p';
    const modeTitle = document.getElementById('setup-mode-title');
    if (modeTitle) modeTitle.textContent = '2 PLAYER LOCAL SETUP';
    
    const cardP1 = document.getElementById('card-p1');
    const cardP2 = document.getElementById('card-p2');
    const cardNet = document.getElementById('card-network');
    const startBtn = document.getElementById('btn-setup-start');
    if (cardP1) cardP1.classList.remove('hide');
    if (cardP2) cardP2.classList.remove('hide');
    if (cardNet) cardNet.classList.add('hide');
    if (startBtn) {
        startBtn.classList.remove('hide');
        startBtn.textContent = 'START GAME';
    }
    
    showPanel('setup');
    syncControlsDisplay();
});

document.getElementById('btn-multi')?.addEventListener('click', () => {
    currentSetupMode = 'network_owner';
    const modeTitle = document.getElementById('setup-mode-title');
    if (modeTitle) modeTitle.textContent = '2 PLAYER NETWORK SETUP';
    
    const cardP1 = document.getElementById('card-p1');
    const cardP2 = document.getElementById('card-p2');
    const cardNet = document.getElementById('card-network');
    const startBtn = document.getElementById('btn-setup-start');
    const spinner = document.getElementById('network-spinner');
    const linkSec = document.getElementById('network-link-section');
    const netStatus = document.getElementById('network-status');
    
    if (cardP1) cardP1.classList.remove('hide');
    if (cardP2) cardP2.classList.add('hide');
    if (cardNet) cardNet.classList.remove('hide');
    if (spinner) spinner.classList.remove('hide');
    if (linkSec) linkSec.classList.add('hide');
    if (netStatus) netStatus.textContent = 'Creating room...';
    if (startBtn) startBtn.classList.add('hide');
    
    showPanel('setup');
    syncControlsDisplay();
    
    if (window.engine) {
        void window.engine.createRoom();
    } else {
        void startMP(null, { autoConnect: 'create' });
    }
});

// Control setup action buttons (defaults / customize)
document.getElementById('btn-p1-default')?.addEventListener('click', () => useDefaultKeys(1));
document.getElementById('btn-p1-custom')?.addEventListener('click', () => showRebindModal(1));
document.getElementById('btn-p2-default')?.addEventListener('click', () => useDefaultKeys(2));
document.getElementById('btn-p2-custom')?.addEventListener('click', () => showRebindModal(2));

// Copy link button
document.getElementById('btn-copy-link')?.addEventListener('click', async () => {
    const input = document.getElementById('share-link-input');
    if (!input || !input.value) return;
    try {
        await navigator.clipboard.writeText(input.value);
        const btn = document.getElementById('btn-copy-link');
        if (btn) {
            btn.textContent = 'COPIED!';
            setTimeout(() => { btn.textContent = 'COPY'; }, 2000);
        }
    } catch (e) {
        // Fallback
    }
});

// Modal cancel
document.getElementById('btn-modal-cancel')?.addEventListener('click', () => closeRebindModal());

// Start Action
document.getElementById('btn-setup-start')?.addEventListener('click', async () => {
    if (currentSetupMode === 'sp') {
        if (window.engine) {
            await window.engine.startNewGame(1);
        } else {
            await startGame(1);
        }
    } else if (currentSetupMode === 'local2p') {
        if (window.engine) {
            await window.engine.startNewGame(2);
        } else {
            await startGame(2);
        }
    } else if (currentSetupMode === 'network_joiner') {
        if (window.engine) {
            await window.engine.joinRoom(_roomCode);
        } else {
            await startMP(_roomCode);
        }
    }
});

// Cancel Setup Panel Action
document.getElementById('btn-setup-cancel')?.addEventListener('click', async () => {
    if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
    }
    if (window.engine) {
        await window.engine.reset();
    }
    showPanel('modes');
});

// Battle Royale mode buttons
document.getElementById('btn-br-endless')?.addEventListener('click', () => {
    window.location.href = '/mp?mode=endless';
});

// Keyboard shortcuts (global)
document.addEventListener('keydown', (e) => {
    if (_state === 'title') {
        // Do not process shortcuts if controls rebind modal is open
        const modal = document.getElementById('controls-modal');
        if (modal && !modal.classList.contains('hide')) {
            return;
        }
        
        switch (e.code) {
            case 'Space': case 'Enter': case 'Digit1':
                e.preventDefault();
                document.getElementById('btn-play')?.click();
                return;
            case 'Digit2':
                e.preventDefault();
                document.getElementById('btn-2p')?.click();
                return;
        }
        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            document.getElementById('btn-multi')?.click();
            return;
        }
        if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            window.location.href = '/mp?mode=endless';
            return;
        }
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            document.getElementById('btn-multi')?.click();
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
    // Show the Joiner setup first instead of auto-joining directly.
    // This allows the user to check/rebind their controls.
    setTimeout(() => {
        currentSetupMode = 'network_joiner';
        const title = document.getElementById('setup-mode-title');
        if (title) title.textContent = 'JOIN 2-PLAYER GAME';
        
        const cardP1 = document.getElementById('card-p1');
        const cardP2 = document.getElementById('card-p2');
        const cardNet = document.getElementById('card-network');
        const spinner = document.getElementById('network-spinner');
        const linkSec = document.getElementById('network-link-section');
        const status = document.getElementById('network-status');
        const startBtn = document.getElementById('btn-setup-start');
        
        if (cardP1) cardP1.classList.add('hide');
        if (cardP2) cardP2.classList.remove('hide');
        if (cardNet) cardNet.classList.remove('hide');
        if (spinner) spinner.classList.add('hide');
        if (linkSec) linkSec.classList.add('hide');
        if (status) status.textContent = `Ready to join room: ${_roomCode}`;
        if (startBtn) {
            startBtn.classList.remove('hide');
            startBtn.textContent = 'JOIN & PLAY';
        }
        showPanel('setup');
        syncControlsDisplay();
    }, 100);
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
