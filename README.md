# Minecraft AFK Bot (Mineflayer)

Set these in your hosting provider's Environment settings:
- MC_HOST (required): Minecraft Java server hostname
- MC_PORT (default 25565)
- MC_USERNAME (default AFK_Bot)
- MC_VERSION (optional; blank means auto-detect)
- MC_VIEW_DISTANCE (default 2)
- AFK_MIN_MS and AFK_MAX_MS (defaults 15000 and 30000)

HTTP health checks: / and /health return "Bot is running!".

Start command: npm start

IMPORTANT: an HTTP health endpoint and an external monitor do not override free-tier sleep, runtime, or acceptable-use restrictions. Confirm your provider's current plan supports a continuously running process before deployment.
