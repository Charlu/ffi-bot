const WebSocket = require('ws');
const https = require('node:https');

function registerSlashCommand({ botToken, applicationId, guildId, command }) {
  if (!botToken) {
    throw new Error('DISCORD_BOT_TOKEN is not configured');
  }

  if (!applicationId) {
    throw new Error('DISCORD_APP_ID is not configured');
  }

  const commandBody = JSON.stringify(command || {
    name: 'status',
    description: 'Check whether the bot is online and listening for events.',
    type: 1
  });

  const urlPath = guildId
    ? `/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `/api/v10/applications/${applicationId}/commands`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'discord.com',
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
          'Content-Length': Buffer.byteLength(commandBody)
        }
      },
      (res) => {
        let response = '';
        res.on('data', (chunk) => {
          response += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Slash command registration failed with status ${res.statusCode}: ${response}`));
            return;
          }

          resolve({ statusCode: res.statusCode, body: response });
        });
      }
    );

    req.on('error', reject);
    req.write(commandBody);
    req.end();
  });
}

function sendDirectMessage({ botToken, userId, content }) {
  if (!botToken) {
    throw new Error('DISCORD_BOT_TOKEN is not configured');
  }

  if (!userId) {
    throw new Error('DISCORD_USER_ID is not configured');
  }

  const createDmBody = JSON.stringify({ recipient_id: userId });

  return new Promise((resolve, reject) => {
    const createDmRequest = https.request(
      {
        hostname: 'discord.com',
        path: '/api/v10/users/@me/channels',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
          'Content-Length': Buffer.byteLength(createDmBody)
        }
      },
      (createDmResponse) => {
        let response = '';
        createDmResponse.on('data', (chunk) => {
          response += chunk.toString();
        });

        createDmResponse.on('end', () => {
          if (createDmResponse.statusCode < 200 || createDmResponse.statusCode >= 300) {
            reject(new Error(`Failed to create DM channel: ${createDmResponse.statusCode}: ${response}`));
            return;
          }

          const dmChannel = JSON.parse(response);
          const messageBody = JSON.stringify({ content });

          const sendRequest = https.request(
            {
              hostname: 'discord.com',
              path: `/api/v10/channels/${dmChannel.id}/messages`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bot ${botToken}`,
                'Content-Length': Buffer.byteLength(messageBody)
              }
            },
            (sendResponse) => {
              let sendData = '';
              sendResponse.on('data', (chunk) => {
                sendData += chunk.toString();
              });

              sendResponse.on('end', () => {
                if (sendResponse.statusCode < 200 || sendResponse.statusCode >= 300) {
                  reject(new Error(`Failed to send DM: ${sendResponse.statusCode}: ${sendData}`));
                  return;
                }

                resolve({ statusCode: sendResponse.statusCode, body: sendData });
              });
            }
          );

          sendRequest.on('error', reject);
          sendRequest.write(messageBody);
          sendRequest.end();
        });
      }
    );

    createDmRequest.on('error', reject);
    createDmRequest.write(createDmBody);
    createDmRequest.end();
  });
}

function replyToInteraction({ token, interactionId, botToken, content }) {
  if (!token || !interactionId || !botToken) {
    throw new Error('Discord interaction reply is missing required fields');
  }

  const body = JSON.stringify({
    type: 4,
    data: {
      content
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'discord.com',
        path: `/api/v10/interactions/${interactionId}/${token}/callback`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let response = '';
        res.on('data', (chunk) => {
          response += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: response });
            return;
          }

          reject(new Error(`Discord interaction reply failed with status ${res.statusCode}: ${response}`));
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function createGatewayBot({ token, onCommand, onReady, WebSocketImpl = WebSocket }) {
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not configured');
  }

  const ws = new WebSocketImpl('wss://gateway.discord.gg/?v=10&encoding=json');
  let heartbeatTimer = null;
  let sequence = null;

  ws.on('open', () => {
    console.log('Connected to Discord gateway');
  });

  ws.on('message', (data) => {
    const payload = JSON.parse(data.toString());
    console.log('Message received : ' + data.toString());
    const { op, t, d, s } = payload;
    const intents = 32256;

    // Save the sequence number for heartbeats
    if (s !== null) sequence = s;

    switch (op) {
      case 10: // HELLO Event
        const { heartbeat_interval } = d;
        
        // 1. Start the Heartbeat loop to keep connection alive
        startHeartbeat(ws, heartbeat_interval);

        // 2. Identify your bot to bring it online
        identify(ws, token, intents);
        break;

      case 11: // HEARTBEAT ACK
        // Discord acknowledged our heartbeat; safely ignore
        break;

      case 0: // DISPATCH Events (Ready, Message Created, etc.)
        if (t === 'READY') {
          console.log(`Logged in as ${d.user.username}`);
          if (onReady) onReady(d.user);
        }
        if (t === 'MESSAGE_CREATE' && onCommand) {
          onCommand(d);
        }
        break;
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
    clearInterval(heartbeatTimer);
  });

  ws.on('BKP_message', (raw) => {
    const payload = JSON.parse(raw.toString());

    if (payload.s) {
      sequence = payload.s;
    }

    if (payload.op === 10) {
      const intervalMs = payload.d.heartbeat_interval;
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token,
          intents: 0,
          properties: {
            $os: 'linux',
            $browser: 'ffi-bot',
            $device: 'ffi-bot'
          }
        }
      }));

      heartbeatTimer = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: sequence }));
      }, intervalMs);
    }

    if (payload.op === 0 && payload.t === 'READY') {
      onReady?.(payload.d);
    }

    if (payload.op === 0 && payload.t === 'INTERACTION_CREATE') {
      const commandName = payload.d?.data?.name;
      console.log('Received Discord interaction:', commandName || payload.d);

      if (commandName === 'status') {
        onCommand?.({
          ...payload.d,
          commandName,
          responseMessage: 'Status: online and logging incoming webhook payloads.'
        });
        return;
      }

      onCommand?.(payload.d);
    }
  });

  ws.on('BKP_close', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  });

  // Helper function to send heartbeats
  function startHeartbeat(ws, interval) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      ws.send(JSON.stringify({
        op: 1, // Heartbeat opcode
        d: sequence
      }));
    }, interval);
  }

  // Helper function to authenticate
  function identify(ws, token, intents) {
    ws.send(JSON.stringify({
      op: 2, // Identify opcode
      d: {
        token: token,
        intents: intents, // Integer representing your bot permissions
        properties: {
          os: 'linux',
          browser: 'my_custom_library',
          device: 'my_custom_library'
        },
        presence: {
          status: 'online', // Force bot to appear online
          afk: false
        }
      }
    }));
  }

  return ws;
}

module.exports = {
  createGatewayBot,
  replyToInteraction,
  sendDirectMessage,
  registerSlashCommand
};
