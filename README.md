# ffi-bot

A tiny self-hosted webhook relay for your homelab. It accepts POST requests at `/webhook`, normalizes incoming payloads, logs them, and exposes a Discord gateway bot with a `/status` slash command.

## Features

- Simple HTTP webhook endpoint
- JSON payload normalization for common homelab tools
- Logs received webhook payloads for inspection
- Discord gateway bot with a `/status` command
- Direct DM support for a configured Discord user
- No user management or database required
- Works well for one-person homelab notifications

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in the required values:

   ```env
   PORT=3000
   DISCORD_BOT_TOKEN=your-discord-bot-token
   DISCORD_APP_ID=your-discord-application-id
   DISCORD_GUILD_ID=your-discord-guild-id
   DISCORD_USER_ID=your-discord-user-id
   ```

3. Install dependencies and start the app:

   ```bash
   npm install
   npm start
   ```

4. The bot will connect to the Discord gateway automatically and register `/status`.
5. Send a POST request to:

   ```text
   http://localhost:3000/webhook
   ```

VS Code debugging is already configured in [.vscode/launch.json](.vscode/launch.json). It loads values from `.env` and falls back to `.env.example`, so the Discord variables are available when you run the server from the editor.

## Docker deployment

This project can be built as a Docker image and published to GitHub Container Registry from GitHub Actions.

### Build locally

```bash
docker build -t ffi-bot:local .
```

### Run locally with Docker

```bash
docker run --rm -p 3000:3000 --env-file .env ffi-bot:local
```

## Docker Compose deployment

The repository includes [docker-compose.yml](docker-compose.yml). It reads the same values from `.env` and passes them into the container.

1. Create `.env` from `.env.example` and set the Discord values.
2. Run:

   ```bash
   docker compose up -d
   ```

3. To stop it:

   ```bash
   docker compose down
   ```

The compose file uses the GitHub Container Registry image tag:

```yaml
image: ghcr.io/${GITHUB_REPOSITORY_OWNER:-your-github-user}/ffi-bot:latest
```

The GitHub Actions workflow in [.github/workflows/docker-build.yml](.github/workflows/docker-build.yml) builds and pushes the image to GHCR automatically.

## Example payload

```json
{
  "source": "home-assistant",
  "title": "Doorbell",
  "message": "Motion detected at the front door."
}
```

You can also send nested payloads such as:

```json
{
  "data": {
    "event": "backup_failed",
    "details": "Disk usage is above 90%"
  }
}
```

## Notes

- The server listens on port `3000` by default.
- You can override it with `PORT` in `.env`.
- This is intentionally designed for a single user and a single Discord destination.
