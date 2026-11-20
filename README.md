# MyAFKBot

A Mineflayer-based Minecraft Java bot with anti-AFK actions, automatic reconnect, respawn handling, and a lightweight native Node.js HTTP status server.

## Local setup

```powershell
npm install
$env:MC_HOST="your-java-server-address"
$env:MC_PORT="25565"
$env:MC_USERNAME="AFK_Bot"
npm start
```

## Environment variables

Configure these in your hosting provider's Environment settings:

| Variable | Required | Default |
|---|---:|---|
| `MC_HOST` | Yes | — |
| `MC_PORT` | No | `25565` |
| `MC_USERNAME` | No | `AFK_Bot` |
| `MC_VERSION` | No | Auto-detect |
| `MC_VIEW_DISTANCE` | No | `2` |
| `AFK_MIN_MS` | No | `15000` |
| `AFK_MAX_MS` | No | `30000` |
| `RECONNECT_MIN_MS` | No | `10000` |
| `RECONNECT_MAX_MS` | No | `120000` |
| `PORT` | No | `3000` |

Do not put server details, passwords, Microsoft tokens, or local settings in Git. Keep secrets and personal connection details in the hosting provider's environment settings.

## HTTP endpoints

- `/` and `/ping`: return `Bot is running!`
- `/health`: JSON connection status
- `/status`: simple status page

## Render

Use a Node.js Web Service with build command `npm install` and start command `npm start`. Render provides free web instances for testing, but free web services spin down after 15 minutes without inbound HTTP or WebSocket traffic. A monitor request every five minutes may count as inbound traffic, but it does not create a 24/7 service guarantee, and platform limits or acceptable-use policies still apply.

A free Render Background Worker is not available; background workers require a paid compute plan. Confirm the plan and terms in your Render Dashboard before creating a paid service.
