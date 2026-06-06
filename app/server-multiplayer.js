'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { GameServer } = require('./frontend/game/multiplayer/server/GameServer');

const PORT = process.env.MP_PORT || 5001;
const ROOT = __dirname;
let gameServer = null;

const MIME = {
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.css':  'text/css',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.ogg':  'audio/ogg',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.json': 'application/json',
};

const httpServer = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let urlPath = requestUrl.pathname;

    if (req.method === 'GET' && urlPath === '/multiplayer/active-games') {
        const snapshot = gameServer ? gameServer.getActiveGamesSnapshot() : {
            generated_at: new Date().toISOString(),
            total_games: 0,
            total_players: 0,
            queued_sitngo_players: 0,
            games: [],
        };
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(snapshot));
        return;
    }
    
    if (req.method === 'GET' && urlPath === '/multiplayer/dungeon-topology') {
        const topology = gameServer ? gameServer.getDungeonTopology() : {
            dungeons: [],
            total_dungeons: 0,
            topology: 'independent'
        };
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(topology));
        return;
    }

    if (urlPath === '/') urlPath = '/multiplayer.html';

    const filePath = path.join(ROOT, urlPath);
    console.log(`[HTTP] ${req.method} ${urlPath} -> ${filePath}`);
    if (!filePath.startsWith(ROOT)) { 
        console.log('[HTTP] Forbidden - path outside ROOT');
        res.writeHead(403); 
        res.end('Forbidden'); 
        return; 
    }

    fs.readFile(filePath, (err, data) => {
        if (err) { 
            console.log(`[HTTP] 404 - ${filePath}: ${err.message}`);
            res.writeHead(404); 
            res.end('Not found'); 
            return; 
        }
        const ext = path.extname(filePath).toLowerCase();
        console.log(`[HTTP] 200 - ${filePath} (${data.length} bytes, ${MIME[ext] || 'application/octet-stream'})`);
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
    });
});

gameServer = new GameServer(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Wizard of Wor — Multiplayer server on http://0.0.0.0:${PORT}`);
    console.log(`   Open http://localhost:${PORT}/multiplayer.html`);
    console.log(`   Press Ctrl+C to stop`);
});

process.on('SIGINT', () => { gameServer.stop(); process.exit(0); });

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
