const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const MP_HOST = process.env.MP_HOST || '127.0.0.1';
const MP_PORT = process.env.MP_PORT || 5001;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
};

function cacheHeaders(urlPath) {
    // Game code changes frequently during deploys and browsers can otherwise
    // keep an old module graph that still contains fixed bugs (for example the
    // single-player black-screen teardown bug). Keep source files fresh while
    // allowing immutable media assets to be cached normally.
    if (urlPath.endsWith('.html') || urlPath.endsWith('.js') || urlPath.endsWith('.css')) {
        return {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
        };
    }
    return { 'Cache-Control': 'public, max-age=3600' };
}

function proxyMultiplayerRequest(req, res) {
    const upstreamReq = http.request({
        host: MP_HOST,
        port: MP_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers,
    }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
    });

    upstreamReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'multiplayer_proxy_error',
            message: err.message,
        }));
    });

    req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]; // strip query params
    if (urlPath === '/multiplayer/active-games' || urlPath === '/multiplayer/dungeon-topology') {
        proxyMultiplayerRequest(req, res);
        return;
    }
    if (urlPath === '/') urlPath = '/frontend/app/play.html';
    if (urlPath === '/platform') urlPath = '/frontend/app/play.html';
    if (urlPath === '/play') urlPath = '/frontend/app/play.html';
    if (urlPath === '/mp') urlPath = '/multiplayer.html';
    if (urlPath === '/spectate') urlPath = '/spectate.html';
    if (urlPath === '/minimap') urlPath = '/minimap.html';

    const filePath = path.join(ROOT, urlPath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.log(`404: ${urlPath}`);
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
            ...cacheHeaders(urlPath),
        });
        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`🎮 Wizard of Wor running at http://${HOST}:${PORT}`);
    console.log(`   Platform: http://localhost:${PORT}/`);
    console.log(`   Classic:  http://localhost:${PORT}/index.html`);
    console.log(`   WS proxy: /multiplayer → ${MP_HOST}:${MP_PORT}`);
    console.log(`   Press Ctrl+C to stop`);
});

// Proxy WebSocket upgrades on /multiplayer to the multiplayer server
// so the platform works in local dev without Caddy.
server.on('upgrade', (req, socket, head) => {
    const urlPath = req.url.split('?')[0];
    if (urlPath !== '/multiplayer') {
        socket.destroy();
        return;
    }

    const upstream = net.createConnection({ host: MP_HOST, port: MP_PORT }, () => {
        // Reconstruct the raw HTTP upgrade request and forward it
        const reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
        const headers = Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n');
        upstream.write(reqLine + headers + '\r\n\r\n');
        if (head && head.length) upstream.write(head);

        // Bi-directional pipe
        socket.pipe(upstream);
        upstream.pipe(socket);
    });

    upstream.on('error', () => {
        try { socket.end(); } catch (_) { /* noop */ }
    });
    socket.on('error', () => {
        try { upstream.end(); } catch (_) { /* noop */ }
    });
});
