'use strict';

const http = require('node:http');
const mineflayer = require('mineflayer');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.MC_HOST || '';
const MC_PORT = Number(process.env.MC_PORT || 25565);
const USERNAME = process.env.MC_USERNAME || 'AFK_Bot';
const VERSION = process.env.MC_VERSION || false;
const VIEW_DISTANCE = Number(process.env.MC_VIEW_DISTANCE || 2);
const MIN_INTERVAL = Math.max(5000, Number(process.env.AFK_MIN_MS || 15000));
const MAX_INTERVAL = Math.max(MIN_INTERVAL, Number(process.env.AFK_MAX_MS || 30000));
const MIN_RECONNECT = Math.max(5000, Number(process.env.RECONNECT_MIN_MS || 10000));
const MAX_RECONNECT = Math.max(MIN_RECONNECT, Number(process.env.RECONNECT_MAX_MS || 120000));

const state = {
  status: 'starting',
  username: USERNAME,
  server: HOST || 'not configured',
  connectedSince: null,
  lastError: null,
  lastAction: null,
  reconnectDelayMs: MIN_RECONNECT
};

function send(res, statusCode, type, body) {
  res.writeHead(statusCode, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

const statusPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Minecraft Bot Status</title>
<style>
body{font:16px system-ui;max-width:680px;margin:50px auto;padding:0 18px;background:#111827;color:#f9fafb}
main{background:#1f2937;padding:24px;border-radius:14px}dt{color:#9ca3af;margin-top:16px}
dd{margin:4px 0;font-weight:600;overflow-wrap:anywhere}a{color:#93c5fd}
</style></head><body><main><h1>MyAFKBot Status</h1><dl>
<dt>Status</dt><dd id="status">Loading</dd><dt>Username</dt><dd id="username"></dd>
<dt>Server</dt><dd id="server"></dd><dt>Connected since</dt><dd id="since"></dd>
<dt>Last AFK action</dt><dd id="action"></dd><dt>Last error</dt><dd id="error"></dd>
</dl><p><a href="/health">JSON health endpoint</a></p></main>
<script>
async function update(){try{const r=await fetch('/health',{cache:'no-store'});const s=await r.json();
for(const [id,key] of Object.entries({status:'status',username:'username',server:'server',since:'connectedSince',action:'lastAction',error:'lastError'})){
document.getElementById(id).textContent=s[key]??'—'}}catch(e){document.getElementById('status').textContent='Dashboard error'}}
update();setInterval(update,5000);
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
  }
  if (url.pathname === '/' || url.pathname === '/ping') {
    return send(res, 200, 'text/plain; charset=utf-8', 'Bot is running!');
  }
  if (url.pathname === '/health') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(state));
  }
  if (url.pathname === '/status') {
    return send(res, 200, 'text/html; charset=utf-8', statusPage);
  }
  return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[HTTP] Health server listening on 0.0.0.0:' + PORT);
});

const log = (level, message) => {
  console.log('[' + new Date().toISOString() + '] [' + level + '] ' + message);
};
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

let bot = null;
let afkTimer = null;
let reconnectTimer = null;
let connecting = false;
let stopping = false;

function clearAfkTimer() {
  if (afkTimer) clearTimeout(afkTimer);
  afkTimer = null;
}

function scheduleAfk(instance) {
  clearAfkTimer();
  if (stopping || bot !== instance || !instance.entity) return;

  afkTimer = setTimeout(async () => {
    if (stopping || bot !== instance || !instance.entity) return;

    try {
      const action = ['look', 'jump', 'sneak', 'walk'][random(0, 3)];

      if (action === 'look') {
        const yaw = instance.entity.yaw + (Math.random() - 0.5) * 0.8;
        const pitch = Math.max(-0.4, Math.min(0.4,
          instance.entity.pitch + (Math.random() - 0.5) * 0.25));
        await instance.look(yaw, pitch, true);
      } else {
        const control = action === 'walk'
          ? (Math.random() < 0.5 ? 'forward' : 'back')
          : action;
        instance.setControlState(control, true);
        setTimeout(() => {
          if (bot === instance && instance.entity) {
            try { instance.setControlState(control, false); } catch {}
          }
        }, action === 'jump' ? 350 : action === 'sneak' ? 900 : random(500, 1000));
      }

      state.lastAction = action;
      log('INFO', 'AFK action: ' + action);
    } catch (error) {
      log('WARN', 'AFK action failed: ' + error.message);
    } finally {
      scheduleAfk(instance);
    }
  }, random(MIN_INTERVAL, MAX_INTERVAL));
}

function scheduleReconnect(reason, instance) {
  if (stopping || reconnectTimer) return;

  clearAfkTimer();
  connecting = false;
  state.status = 'reconnecting';
  state.connectedSince = null;
  state.lastError = String(reason);
  const delay = state.reconnectDelayMs;

  if (instance && bot === instance) {
    bot = null;
    try { instance.quit('Reconnecting'); } catch {}
  }

  log('WARN', reason + '; reconnecting in ' + Math.round(delay / 1000) + ' seconds');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
  state.reconnectDelayMs = Math.min(delay * 2, MAX_RECONNECT);
}

function connect() {
  if (stopping || connecting || bot) return;

  if (!HOST) {
    state.status = 'configuration error';
    state.lastError = 'MC_HOST environment variable is missing';
    log('ERROR', state.lastError);
    return scheduleReconnect('Missing MC_HOST');
  }

  connecting = true;
  state.status = 'connecting';
  log('INFO', 'Connecting to ' + HOST + ':' + MC_PORT + ' as ' + USERNAME);

  let instance;
  try {
    instance = mineflayer.createBot({
      host: HOST,
      port: MC_PORT,
      username: USERNAME,
      version: VERSION || false,
      viewDistance: VIEW_DISTANCE
    });
    bot = instance;
  } catch (error) {
    connecting = false;
    log('ERROR', 'Could not create bot: ' + error.message);
    return scheduleReconnect('Connection setup failed');
  }

  instance.once('login', () => {
    if (bot !== instance) return;
    connecting = false;
    state.status = 'logged-in';
    state.username = instance.username || USERNAME;
    state.connectedSince = new Date().toISOString();
    state.lastError = null;
    state.reconnectDelayMs = MIN_RECONNECT;
    log('INFO', 'Login successful as ' + state.username);
  });

  instance.once('spawn', () => {
    if (bot !== instance) return;
    connecting = false;
    state.status = 'online';
    state.connectedSince = state.connectedSince || new Date().toISOString();
    state.lastError = null;
    state.reconnectDelayMs = MIN_RECONNECT;
    log('INFO', 'Bot spawned and is ready');
    scheduleAfk(instance);
  });

  instance.on('death', () => {
    if (bot !== instance) return;
    state.status = 'dead';
    log('WARN', 'Bot died; attempting to respawn');
    clearAfkTimer();
    setTimeout(() => {
      if (stopping || bot !== instance || !instance.entity) return;
      try {
        if (typeof instance.respawn === 'function') {
          instance.respawn();
          log('INFO', 'Respawn request sent');
        } else {
          log('WARN', 'This Mineflayer version does not expose respawn()');
        }
      } catch (error) {
        log('WARN', 'Respawn request failed: ' + error.message);
      }
    }, 1500);
  });

  instance.on('respawn', () => {
    if (bot !== instance) return;
    state.status = 'online';
    log('INFO', 'Bot respawned');
    scheduleAfk(instance);
  });

  instance.on('kicked', reason => {
    const message = typeof reason === 'string' ? reason : JSON.stringify(reason);
    log('WARN', 'Kicked: ' + message);
    scheduleReconnect('Kicked: ' + message, instance);
  });

  instance.on('error', error => {
    log('ERROR', 'Minecraft client error: ' + error.message);
    scheduleReconnect('Minecraft connection error: ' + error.message, instance);
  });

  instance.on('end', reason => {
    if (bot === instance) bot = null;
    if (stopping) return;
    log('WARN', 'Connection ended: ' + (reason || 'unknown reason'));
    scheduleReconnect('Disconnected', instance);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log('INFO', 'Received ' + signal + '; shutting down');
  clearAfkTimer();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const currentBot = bot;
  bot = null;
  if (currentBot) {
    try { currentBot.quit('Service shutting down'); } catch {}
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', error => {
  log('FATAL', 'Uncaught exception: ' + (error.stack || error.message));
  shutdown('uncaughtException');
  setTimeout(() => process.exit(1), 100).unref();
});
process.on('unhandledRejection', reason => {
  log('ERROR', 'Unhandled promise rejection: ' + String(reason));
});

log('INFO', 'Starting Mineflayer AFK bot');
connect();
