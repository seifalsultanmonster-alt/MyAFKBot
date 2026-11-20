const fs = require('fs')
const express = require('express')
const mineflayer = require('mineflayer')

const settingsPath = './settings.json'
if (!fs.existsSync(settingsPath)) {
  fs.copyFileSync('./settings.example.json', settingsPath)
  console.log('Created settings.json from example. Review it, then restart.')
  process.exit(0)
}

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
const app = express()
const state = {
  status: 'starting',
  username: settings.bot.username,
  server: settings.server.host,
  connectedSince: null,
  lastError: null,
  reconnectDelay: settings.reconnect.minDelayMs
}

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Minecraft Bot Status</title>
<style>body{font:16px system-ui;max-width:680px;margin:50px auto;padding:0 18px;background:#111827;color:#f9fafb}main{background:#1f2937;padding:24px;border-radius:14px}dt{color:#9ca3af;margin-top:16px}dd{margin:4px 0;font-weight:600}a{color:#93c5fd}</style></head>
<body><main><h1>MyAFKBot Status</h1><dl>
<dt>Status</dt><dd id="status">Loading</dd>
<dt>Username</dt><dd id="username"></dd>
<dt>Server</dt><dd id="server"></dd>
<dt>Connected since</dt><dd id="since"></dd>
<dt>Last error</dt><dd id="error"></dd>
</dl><p><a href="/health">JSON health</a></p></main>
<script>async function update(){try{const r=await fetch('/health');const s=await r.json();for(const [id,key] of Object.entries({status:'status',username:'username',server:'server',since:'connectedSince',error:'lastError'})){document.getElementById(id).textContent=s[key]??'—'}}catch(e){document.getElementById('status').textContent='Dashboard error'}}update();setInterval(update,5000)</script></body></html>`)
})
app.get('/health', (_req, res) => res.json(state))
app.get('/ping', (_req, res) => res.send('ok'))
app.listen(settings.dashboard.port, () => console.log('Dashboard on port ' + settings.dashboard.port))

let stopping = false
let retryTimer
let bot

function connect() {
  if (stopping) return
  state.status = 'connecting'
  console.log('Connecting to ' + settings.server.host + ':' + settings.server.port)

  bot = mineflayer.createBot({
    host: settings.server.host,
    port: settings.server.port,
    username: settings.bot.username,
    version: settings.server.version || false
  })

  bot.once('login', () => {
    state.status = 'logged-in'
    state.username = bot.username
    state.connectedSince = new Date().toISOString()
    state.lastError = null
    state.reconnectDelay = settings.reconnect.minDelayMs
    console.log('Logged in as ' + bot.username)
  })

  bot.once('spawn', () => {
    state.status = 'online'
    console.log('Spawned in world.')
  })

  bot.on('kicked', reason => {
    state.lastError = String(reason)
    console.log('Kicked:', state.lastError)
  })

  bot.on('error', err => {
    state.lastError = err.message
    console.log('Bot error:', err.message)
  })

  bot.on('end', () => {
    state.status = 'disconnected'
    state.connectedSince = null
    if (stopping) return
    const delay = Math.min(state.reconnectDelay, settings.reconnect.maxDelayMs)
    console.log('Disconnected; retrying in ' + Math.round(delay / 1000) + 's')
    retryTimer = setTimeout(connect, delay)
    state.reconnectDelay = Math.min(delay * 2, settings.reconnect.maxDelayMs)
  })
}

process.on('SIGINT', () => {
  stopping = true
  if (retryTimer) clearTimeout(retryTimer)
  if (bot) bot.quit('Shutting down')
  process.exit(0)
})

connect()
