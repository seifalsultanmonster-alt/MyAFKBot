'use strict';

const http = require('node:http');
const mineflayer = require('mineflayer');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.MC_HOST;
const MC_PORT = Number(process.env.MC_PORT || 25565);
const USERNAME = process.env.MC_USERNAME || 'AFK_Bot';
const VERSION = process.env.MC_VERSION || false;
const VIEW_DISTANCE = Number(process.env.MC_VIEW_DISTANCE || 2);
const MIN_INTERVAL = Math.max(5000, Number(process.env.AFK_MIN_MS || 15000));
const MAX_INTERVAL = Math.max(MIN_INTERVAL, Number(process.env.AFK_MAX_MS || 30000));

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, {'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
    return res.end('Bot is running!');
  }
  res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
  res.end('Not found');
});
server.listen(PORT, '0.0.0.0', () => console.log('[HTTP] Health endpoint on port ' + PORT));

const log = (level, message) => console.log('[' + new Date().toISOString() + '] [' + level + '] ' + message);
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

let bot = null;
let reconnectTimer = null;
let afkTimer = null;
let connecting = false;
let stopping = false;

function scheduleAfk(instance) {
  clearTimeout(afkTimer);
  if (stopping || bot !== instance || !instance.entity) return;
  afkTimer = setTimeout(async () => {
    if (stopping || bot !== instance || !instance.entity) return;
    try {
      const action = ['look', 'jump', 'sneak'][random(0, 2)];
      if (action === 'look') {
        await instance.look(
          instance.entity.yaw + (Math.random() - 0.5) * 0.7,
          Math.max(-0.4, Math.min(0.4, instance.entity.pitch + (Math.random() - 0.5) * 0.2)),
          true
        );
      } else {
        instance.setControlState(action, true);
        setTimeout(() => {
          if (bot === instance && instance.entity) instance.setControlState(action, false);
        }, action === 'jump' ? 350 : 800);
      }
      log('INFO', 'AFK action: ' + action);
    } catch (error) {
      log('WARN', 'AFK action failed: ' + error.message);
    } finally {
      scheduleAfk(instance);
    }
  }, random(MIN_INTERVAL, MAX_INTERVAL));
}

function reconnect(reason) {
  if (stopping || reconnectTimer) return;
  connecting = false;
  clearTimeout(afkTimer);
  log('WARN', reason + '; reconnecting in 10 seconds');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 10000);
}

function connect() {
  if (stopping || connecting) return;
  if (!HOST) {
    log('ERROR', 'Set MC_HOST in the hosting Environment settings.');
    return reconnect('Missing MC_HOST');
  }
  connecting = true;
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
    return reconnect('Connection setup failed');
  }

  instance.once('login', () => {
    connecting = false;
    log('INFO', 'Minecraft login successful');
  });
  instance.once('spawn', () => {
    connecting = false;
    log('INFO', 'Bot spawned and is ready');
    scheduleAfk(instance);
  });
  instance.on('death', () => {
    log('WARN', 'Bot died; waiting for server respawn');
    clearTimeout(afkTimer);
  });
  instance.on('respawn', () => {
    log('INFO', 'Bot respawned');
    scheduleAfk(instance);
  });
  instance.on('kicked', reason => {
    log('WARN', 'Kicked: ' + (typeof reason === 'string' ? reason : JSON.stringify(reason)));
    reconnect('Kicked by server');
  });
  instance.on('error', error => {
    log('ERROR', 'Minecraft error: ' + error.message);
    reconnect('Minecraft connection error');
  });
  instance.on('end', reason => {
    if (bot === instance) bot = null;
    log('WARN', 'Connection ended: ' + (reason || 'unknown reason'));
    reconnect('Disconnected');
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log('INFO', 'Received ' + signal + '; shutting down');
  clearTimeout(afkTimer);
  clearTimeout(reconnectTimer);
  try { if (bot) bot.quit('Service shutting down'); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', error => {
  log('ERROR', 'Uncaught exception: ' + (error.stack || error.message));
  reconnect('Unexpected exception');
});
process.on('unhandledRejection', reason => {
  log('ERROR', 'Unhandled rejection: ' + (reason && (reason.stack || reason) || 'unknown'));
});

log('INFO', 'Starting Mineflayer AFK bot');
connect();
