/**
 * EngineController.js
 * 
 * Global engine singleton for automation, testing, and programmatic control.
 * Decouples game engine from UI, making it accessible via window.engine and window.swowDebug.
 * 
 * Goals:
 * - Engine initializes automatically on page load
 * - No user interaction required
 * - Fully automatable (Playwright, bots, AI players)
 * - State introspection for testing
 * - Support autoplay mode via URL params
 */

class EngineController {
    constructor() {
        this.initialized = false; // STRICT: true only when fully ready
        this.state = 'loading';   // loading | menu | playing | gameover | error
        this.mode = null;         // 'sp' | 'mp' | null
        this.roomCode = null;
        this.playerId = null;
        this.playerNum = null;
        
        this._spModule = null;
        this._mpModule = null;
        this._spApp = null;
        this._mpApp = null;
        this._engine = null;
        this._lastMpState = null;
        this._transitioning = null;
        this._lastMultiplayerError = null;
        
        this._initPromise = null;
        this._listeners = {};
        
        // Defer auto-initialization until the page is idle to avoid
        // aborting in-flight module fetches during automated test page loads.
        const defer = typeof requestIdleCallback === 'function'
            ? cb => requestIdleCallback(cb, { timeout: 2000 })
            : cb => setTimeout(cb, 100);
        defer(() => this._autoInit());
    }
    
    async _autoInit() {
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = (async () => {
            try {
                // Pre-load SP module (lightweight, for attract mode)
                this._spModule = await import('../game/singleplayer/App.js');
                this.state = 'menu';
                this.initialized = true; // CRITICAL: now ready for use
                this._emit('ready');
            } catch (err) {
                console.error('[EngineController] Failed to initialize:', err);
                this.state = 'error';
                this.initialized = false;
                this._emit('error', { message: err.message });
            }
        })();
        
        return this._initPromise;
    }
    
    // ─── Lifecycle Methods ────────────────────────────────────────────
    
    async startNewGame(numPlayers = 1) {
        return this._runTransition('startNewGame', async () => {
            await this._initPromise;

            try {
                await this._teardown();

                this.mode = 'sp';
                this.state = 'loading';
                this.roomCode = null;
                this.playerId = null;
                this.playerNum = null;
                this._lastMpState = null;
                this._emit('gameStarting', { numPlayers, mode: 'sp' });
                this._emit('startSP', { numPlayers });

                await this._waitForSPReady();

                if (!this._engine?.startNewGame) {
                    throw new Error('Singleplayer engine not ready');
                }

                this._engine.startNewGame(numPlayers);
                this.state = 'playing';
                this._emit('gameStart', { numPlayers, mode: 'sp' });
                this._emit('playing', this.getState());
                return this.getState();
            } catch (err) {
                console.error('[EngineController] Failed to start game:', err);
                this.state = 'error';
                this._emit('error', { action: 'startNewGame', message: err.message });
                return this.getState();
            }
        });
    }
    
    async createRoom() {
        return this._runTransition('createRoom', async () => {
            await this._initPromise;

            try {
                await this._teardown();

                this.mode = 'mp';
                this.state = 'loading';
                this.roomCode = null;
                this.playerId = null;
                this.playerNum = null;
                this._lastMpState = null;
                this._lastMultiplayerError = null;
                this._emit('roomCreating');

                if (!this._mpModule) {
                    this._mpModule = await import('../game/multiplayer/client/MultiplayerApp.js');
                }

                this._emit('startMP', { roomCode: null, autoConnect: 'create' });

                await this._waitForMPReady();
                await this._waitForEvent(
                    'roomCode',
                    () => this.roomCode,
                    10000,
                    'private room code'
                );

                this._emit('roomCreated', { roomCode: this.roomCode });
                return this.getState();
            } catch (err) {
                console.error('[EngineController] Failed to create room:', err);
                this.state = 'error';
                this._emit('error', { action: 'createRoom', message: err.message });
                return this.getState();
            }
        });
    }
    
    async joinRoom(code) {
        return this._runTransition('joinRoom', async () => {
            await this._initPromise;

            try {
                await this._teardown();

                this.mode = 'mp';
                this.state = 'loading';
                this.roomCode = code;
                this.playerId = null;
                this.playerNum = null;
                this._lastMpState = null;
                this._lastMultiplayerError = null;
                this._emit('roomJoining', { roomCode: code });

                if (!this._mpModule) {
                    this._mpModule = await import('../game/multiplayer/client/MultiplayerApp.js');
                }

                this._emit('startMP', { roomCode: code, autoConnect: 'join' });

                await this._waitForMPReady();
                await this._waitForEvent(
                    'multiplayerReady',
                    () => this.playerId !== null && this.playerNum !== null,
                    10000,
                    `multiplayer init for room ${code}`
                );

                this._emit('roomJoined', { roomCode: code });
                return this.getState();
            } catch (err) {
                console.error('[EngineController] Failed to join room:', err);
                this.state = 'error';
                this._emit('error', { action: 'joinRoom', roomCode: code, message: err.message });
                return this.getState();
            }
        });
    }
    
    async reset() {
        return this._runTransition('reset', async () => {
            await this._teardown();
            this.state = 'menu';
            this.mode = null;
            this.roomCode = null;
            this.playerId = null;
            this.playerNum = null;
            this._lastMpState = null;
            this._lastMultiplayerError = null;
            this._emit('reset');
            return this.getState();
        });
    }
    
    // ─── State Introspection ──────────────────────────────────────────
    
    getState() {
        // STRICT CONTRACT: Always return valid structure
        // Never return undefined or partial state
        
        if (!this.initialized) {
            return {
                ready: false,
                initialized: false,
                state: this.state || 'loading',
                mode: null,
                isMultiplayer: false,
                roomCode: null,
                playerId: null,
                playerNum: null,
                tick: 0,
                scene: null,
                players: [],
                startedAt: null,
                gameOverAt: null,
            };
        }
        
        const base = {
            ready: true,
            initialized: true,
            state: this.state,
            mode: this.mode,
            isMultiplayer: this.mode === 'mp',
            roomCode: this.roomCode || null,
            playerId: this.playerId || null,
            playerNum: this.playerNum !== null ? this.playerNum : null,
            tick: 0,
            scene: null,
            players: [],
            startedAt: null,
            gameOverAt: null,
        };
        
        // Try to get detailed state from active engine
        if (this.mode === 'sp' && this._engine) {
            try {
                const scene = this._engine.getCurrentScene?.() || null;
                base.scene = scene?.name || scene?.constructor?.name || null;
                base.tick = this._engine.tickCount || 0;
                
                // Try to get player data
                if (this._engine.player) {
                    base.players.push({
                        score: this._engine.player.score || 0,
                        lives: this._engine.player.lives || 0,
                        status: this._engine.player.status || 'unknown',
                    });
                }
            } catch (err) {
                // Ignore errors in state extraction
            }
        }
        
        if (this.mode === 'mp' && this._mpApp) {
            try {
                if (this._mpApp.session) {
                    base.playerId = this._mpApp.session.playerId;
                    base.playerNum = this._mpApp.session.playerNum;
                }
                
                const mpState = this._lastMpState || this._mpApp.lastState || null;
                if (mpState) {
                    base.scene = mpState.scene;
                    base.players = mpState.players || [];
                    base.tick = mpState.scanFrameCounter || 0;
                }
            } catch (err) {
                // Ignore errors
            }
        }
        
        return base;
    }
    
    // ─── Bot Control API ──────────────────────────────────────────────
    
    /**
     * Simulate key press for bot control
     * @param {string} action - 'up', 'down', 'left', 'right', 'fire'
     * @param {number} player - Player number (1 or 2, defaults to 1)
     */
    pressAction(action, player = 1) {
        if (!this.initialized || this.state !== 'playing') {
            console.warn('[Engine] Cannot press action - game not playing');
            return false;
        }
        
        const validActions = ['up', 'down', 'left', 'right', 'fire'];
        if (!validActions.includes(action)) {
            console.warn('[Engine] Invalid action:', action);
            return false;
        }
        
        try {
            if (this.mode === 'sp' && this._spApp) {
                // Get the control binding for this player
                const binding = this._spApp.getControlBinding?.(player);
                if (binding && this._spApp.controlsRuntime) {
                    this._spApp.controlsRuntime.setHold(binding, action);
                    return true;
                }
            } else if (this.mode === 'mp' && this._mpApp) {
                const binding = this._mpApp.options?.controlBinding;
                if (binding && this._mpApp.controlsRuntime) {
                    this._mpApp.controlsRuntime.setHold(binding, action);
                    return true;
                }
            }
        } catch (err) {
            console.error('[Engine] pressAction error:', err);
        }
        
        return false;
    }
    
    /**
     * Release all held keys (useful for bot state cleanup)
     */
    releaseAll() {
        if (!this.initialized) return;
        
        try {
            if (this.mode === 'sp' && this._spApp?.controlsRuntime) {
                this._clearControlsRuntime(this._spApp.controlsRuntime);
            }
            if (this.mode === 'mp' && this._mpApp?.controlsRuntime) {
                this._clearControlsRuntime(this._mpApp.controlsRuntime);
            }
        } catch (err) {
            console.error('[Engine] releaseAll error:', err);
        }
    }
    
    // ─── Event System ─────────────────────────────────────────────────
    
    on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
    }
    
    off(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    }
    
    _emit(event, data) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(handler => {
            try {
                handler(data);
            } catch (err) {
                console.error(`[EngineController] Event handler error (${event}):`, err);
            }
        });
    }
    
    // ─── Internal Helpers ─────────────────────────────────────────────
    
    async _teardown() {
        // The title/attract screen boots the singleplayer app before the
        // controller mode is set to "sp".  A later startNewGame() used to skip
        // destroying that app because mode was still null, then kept stale
        // _spApp/_engine references while play.js removed the DOM on the
        // teardown event. The controller would then start the stale engine and
        // leave the fresh canvas hidden/black.
        if (this.mode === 'sp' || this._spApp || this._engine) {
            try {
                this._spModule?.destroySingleplayer?.();
            } catch (_) { /* ok */ }
            this._spApp = null;
            this._engine = null;
        }
        
        if (this.mode === 'mp' || this._mpApp) {
            try {
                this._mpModule?.destroyMultiplayer?.();
            } catch (_) { /* ok */ }
            this._mpApp = null;
        }
        
        this._emit('teardown');
    }
    
    async _waitForSPReady() {
        return this._waitForEvent(
            'spReady',
            () => this._spApp && this._engine,
            3000,
            'singleplayer engine'
        );
    }
    
    async _waitForMPReady() {
        return this._waitForEvent(
            'mpAppReady',
            () => this._mpApp,
            5000,
            'multiplayer app bootstrap'
        );
    }

    _runTransition(name, callback) {
        if (this._transitioning) {
            return Promise.reject(new Error(`Cannot start ${name} while ${this._transitioning} is in progress`));
        }

        this._transitioning = name;
        return Promise.resolve()
            .then(callback)
            .finally(() => {
                this._transitioning = null;
            });
    }

    _waitForEvent(event, predicate, timeout, label) {
        return new Promise((resolve, reject) => {
            if (typeof predicate === 'function') {
                const currentValue = predicate();
                if (currentValue) {
                    resolve(currentValue);
                    return;
                }
            }

            const cleanup = () => {
                clearTimeout(timeoutId);
                this.off(event, onEvent);
                this.off('error', onError);
            };

            const onEvent = (data) => {
                if (typeof predicate === 'function') {
                    const currentValue = predicate(data);
                    if (!currentValue) return;
                    cleanup();
                    resolve(currentValue);
                    return;
                }

                cleanup();
                resolve(data);
            };

            const onError = (data) => {
                cleanup();
                reject(new Error(data?.message || `Failed while waiting for ${label}`));
            };

            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for ${label}`));
            }, timeout);

            this.on(event, onEvent);
            this.on('error', onError);
        });
    }

    _clearControlsRuntime(runtime) {
        if (!runtime) return;
        for (const key of Object.keys(runtime.pressedKeys || {})) {
            runtime.pressedKeys[key] = false;
        }
        runtime.heldGamepadInputs?.clear?.();
    }
    
    // ─── Internal Setters (called by play.js) ────────────────────────
    
    _setSPApp(app, engine) {
        this._spApp = app;
        this._engine = engine;
        this._emit('spReady', { app, engine });
    }
    
    _setMPApp(app) {
        this._mpApp = app;
        if (app && app.session) {
            this.playerId = app.session.playerId;
            this.playerNum = app.session.playerNum;
        }
        this._emit('mpAppReady', { app });
    }
    
    _setRoomCode(code) {
        this.roomCode = code;
        this._emit('roomCode', { roomCode: code });
    }

    _setMultiplayerSession(session) {
        if (!session) return;
        this._lastMultiplayerError = null;
        this.playerId = session.playerId ?? this.playerId;
        this.playerNum = session.playerNum ?? this.playerNum;

        if (this.mode === 'mp' && this.playerId !== null && this.playerNum !== null) {
            const wasPlaying = this.state === 'playing';
            this.state = 'playing';
            this._emit('multiplayerReady', this.getState());
            if (!wasPlaying) {
                this._emit('gameStart', {
                    mode: 'mp',
                    roomCode: this.roomCode,
                    playerId: this.playerId,
                    playerNum: this.playerNum,
                });
                this._emit('playing', this.getState());
            }
        }
    }

    _setMultiplayerState(state) {
        this._lastMpState = state || null;

        if (this.mode !== 'mp') return;

        if (state?.scene === 'gameOver' && this.state !== 'gameover') {
            this.state = 'gameover';
            this._emit('gameOver', this.getState());
            return;
        }

        if (state?.scene && state.scene !== 'gameOver' && this.playerId !== null && this.playerNum !== null) {
            this.state = 'playing';
        }
    }

    _setMultiplayerError(message) {
        this._lastMultiplayerError = message || 'Unknown multiplayer error';
        this._emit('error', { action: 'multiplayer', message: this._lastMultiplayerError });
    }
}

// ─── Singleton Export ─────────────────────────────────────────────────

const engineController = new EngineController();

// Expose as window.engine
if (typeof window !== 'undefined') {
    window.engine = engineController;
}

// ─── Debug API ────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.swowDebug = {
        start: async (numPlayers = 1) => {
            try {
                return await window.engine.startNewGame(numPlayers);
            } catch (err) {
                console.error('[swowDebug] start() failed:', err);
                return window.engine.getState();
            }
        },
        
        createRoom: async () => {
            try {
                return await window.engine.createRoom();
            } catch (err) {
                console.error('[swowDebug] createRoom() failed:', err);
                return window.engine.getState();
            }
        },
        
        join: async (code) => {
            try {
                return await window.engine.joinRoom(code);
            } catch (err) {
                console.error('[swowDebug] join() failed:', err);
                return window.engine.getState();
            }
        },
        
        reset: async () => {
            try {
                return await window.engine.reset();
            } catch (err) {
                console.error('[swowDebug] reset() failed:', err);
                return window.engine.getState();
            }
        },
        
        // ─── Bot Control API ──────────────────────────────────────────
        
        /**
         * Press an action (for bot control)
         * @param {string} action - 'up', 'down', 'left', 'right', 'fire'
         * @param {number} player - Player number (defaults to 1)
         */
        press: (action, player = 1) => {
            try {
                return window.engine.pressAction(action, player);
            } catch (err) {
                console.error('[swowDebug] press() failed:', err);
                return false;
            }
        },
        
        /**
         * Convenience methods for bot control
         */
        move: (direction) => {
            const valid = ['up', 'down', 'left', 'right'];
            if (!valid.includes(direction)) {
                console.error('[swowDebug] Invalid direction:', direction);
                return false;
            }
            return window.swowDebug.press(direction);
        },
        
        shoot: () => {
            return window.swowDebug.press('fire');
        },
        
        /**
         * Release all held keys (cleanup for bots)
         */
        releaseAll: () => {
            try {
                return window.engine.releaseAll();
            } catch (err) {
                console.error('[swowDebug] releaseAll() failed:', err);
            }
        },
        
        // ─── State & Introspection ────────────────────────────────────
        
        getState: () => {
            try {
                return window.engine.getState();
            } catch (err) {
                console.error('[swowDebug] getState() failed:', err);
                return { ready: false, state: 'error', error: err.message };
            }
        },
        
        isReady: () => {
            try {
                return window.engine && window.engine.initialized === true;
            } catch (err) {
                return false;
            }
        },
        
        waitReady: (timeout = 5000) => {
            return new Promise((resolve, reject) => {
                // If already ready, resolve immediately
                if (window.swowDebug.isReady()) {
                    resolve();
                    return;
                }
                
                // Otherwise wait for 'ready' event
                const handleReady = () => {
                    clearTimeout(timeoutId);
                    window.engine.off('ready', handleReady);
                    resolve();
                };
                const timeoutId = setTimeout(() => {
                    window.engine.off('ready', handleReady);
                    reject(new Error('Timeout waiting for engine ready'));
                }, timeout);
                
                window.engine.on('ready', handleReady);
            });
        },
        
        // EVENT SYSTEM: Allow automation to subscribe to events
        on: (event, handler) => {
            if (!window.engine) {
                console.warn('[swowDebug] Engine not available yet');
                return;
            }
            window.engine.on(event, handler);
        },
        
        off: (event, handler) => {
            if (!window.engine) return;
            window.engine.off(event, handler);
        },
        
        // Helper: Wait for specific event
        waitFor: (event, timeout = 10000) => {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    window.engine.off(event, handler);
                    reject(new Error(`Timeout waiting for event: ${event}`));
                }, timeout);
                
                const handler = (data) => {
                    clearTimeout(timeoutId);
                    window.engine.off(event, handler);
                    resolve(data);
                };
                
                window.engine.on(event, handler);
            });
        },
    };
}

export default engineController;
