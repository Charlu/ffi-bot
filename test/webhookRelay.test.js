const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { normalizeMessage, filterAndFormatMessage } = require('../src/relay');
const { createGatewayBot } = require('../src/discordBot');
const { startServer, initializeDiscordServices } = require('../src/server');

test('normalizes a simple payload into a Discord-ready message', () => {
  const payload = {
    source: 'home-assistant',
    title: 'Doorbell',
    message: 'Motion detected at the front door.'
  };

  const result = normalizeMessage(payload);

  assert.equal(result.content, 'Doorbell');
  assert.match(result.embeds[0].description, /Motion detected/);
  assert.equal(result.embeds[0].author.name, 'home-assistant');
});

test('handles payloads with nested fields and falls back to a generic title', () => {
  const payload = {
    data: {
      event: 'backup_failed',
      details: 'Disk usage is above 90%'
    }
  };

  const result = normalizeMessage(payload);

  assert.equal(result.content, 'Homelab notification');
  assert.match(result.embeds[0].description, /Disk usage/);
});

test('formats a placeholder message before sending to the Discord bot', () => {
  const payload = {
    source: 'home-assistant',
    title: 'Doorbell',
    message: 'Motion detected at the front door.'
  };

  const result = filterAndFormatMessage(payload);

  assert.match(result.content, /\*\*Doorbell\*\*/);
  assert.match(result.content, /Motion detected/);
  assert.match(result.content, /home-assistant/);
});

test('creates a Discord gateway bot connection with the identify payload', () => {
  const sentPayloads = [];
  const fakeWebSocket = {
    on: (event, callback) => {
      if (event === 'message') {
        callback(Buffer.from(JSON.stringify({
          op: 10,
          d: { heartbeat_interval: 1000 }
        })));
      }
    },
    send: (payload) => {
      sentPayloads.push(JSON.parse(payload));
    },
    close: () => {}
  };

  const FakeWebSocket = function () {
    return fakeWebSocket;
  };

  createGatewayBot({
    token: 'abc',
    onReady: () => {},
    onCommand: () => {},
    WebSocketImpl: FakeWebSocket
  });

  const identifyPayload = sentPayloads.find((payload) => payload.op === 2);
  assert.ok(identifyPayload);
  assert.equal(identifyPayload.d.token, 'abc');
  assert.equal(identifyPayload.d.properties.$browser, 'ffi-bot');
});

test('initializes Discord gateway and slash command registration from the main startup path', async () => {
  process.env.DISCORD_BOT_TOKEN = 'bot-token';
  process.env.DISCORD_APP_ID = 'app-id';
  process.env.DISCORD_GUILD_ID = 'guild-id';

  let botStarted = false;
  let slashCommandCalled = false;

  const originalCreateGatewayBot = require('../src/discordBot').createGatewayBot;
  const originalRegisterSlashCommand = require('../src/discordBot').registerSlashCommand;

  require('../src/discordBot').createGatewayBot = () => {
    botStarted = true;
    return { on: () => {} };
  };

  require('../src/discordBot').registerSlashCommand = async () => {
    slashCommandCalled = true;
  };

  try {
    await initializeDiscordServices();
    assert.equal(botStarted, true);
    assert.equal(slashCommandCalled, true);
  } finally {
    require('../src/discordBot').createGatewayBot = originalCreateGatewayBot;
    require('../src/discordBot').registerSlashCommand = originalRegisterSlashCommand;
  }
});

test('includes CORS headers on preflight and webhook responses', async () => {
  process.env.DISCORD_BOT_TOKEN = 'bot-token';
  process.env.DISCORD_CHANNEL_ID = '123456';

  const server = startServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const optionsResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/webhook',
      method: 'OPTIONS'
    }, (res) => {
      resolve(res);
    });

    req.on('error', reject);
    req.end();
  });

  assert.equal(optionsResponse.statusCode, 204);
  assert.equal(optionsResponse.headers['access-control-allow-origin'], '*');

  const postResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      resolve(res);
    });

    req.on('error', reject);
    req.write(JSON.stringify({ source: 'test', title: 'hello', message: 'world' }));
    req.end();
  });

  assert.equal(postResponse.statusCode, 200);
  assert.equal(postResponse.headers['access-control-allow-origin'], '*');

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});
