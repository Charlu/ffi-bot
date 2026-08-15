const http = require('node:http');
const { URL } = require('node:url');
const { buildDiscordPayload } = require('./relay');
const discordBot = require('./discordBot');

const PORT = Number(process.env.PORT || 3000);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function startServer() {
    const server = http.createServer(async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, corsHeaders);
            res.end();
            return;
        }

        if (req.method !== 'POST') {
            res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Only POST requests are supported' }));
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);

        if (url.pathname !== '/webhook') {
            res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }

        let rawBody = '';

        req.on('data', (chunk) => {
            rawBody += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const payload = rawBody ? JSON.parse(rawBody) : {};
                console.log('Received webhook payload:', payload);

                const discordPayload = buildDiscordPayload(payload);
                console.log('Discord formatted message :', discordPayload);
                const userId = process.env.DISCORD_USER_ID;
                const botToken = process.env.DISCORD_BOT_TOKEN;

                if (botToken && userId) {
                    await discordBot.sendDirectMessage({
                        botToken,
                        userId,
                        content: discordPayload.content
                    });
                }

                console.log('Prepared Discord payload:', discordPayload);

                res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, message: 'Webhook received and logged' }));
            } catch (error) {
                console.error('Webhook processing failed:', error.message);
                res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    });

    return server;
}

const server = startServer();

async function initializeDiscordServices() {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const applicationId = process.env.DISCORD_APP_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!botToken) {
        return;
    }

    discordBot.createGatewayBot({
        token: botToken,
        onCommand: async (interaction) => {
            const responseMessage = interaction.responseMessage || 'Status: online and logging incoming webhook payloads.';

            try {
                await discordBot.replyToInteraction({
                    token: interaction.token,
                    interactionId: interaction.id,
                    botToken,
                    content: responseMessage
                });
            } catch (error) {
                console.error('Discord interaction reply failed:', error.message);
            }
        }
    });

    if (applicationId && false) {
        try {
            await discordBot.registerSlashCommand({
                botToken,
                applicationId,
                guildId,
                command: {
                    name: 'status',
                    description: 'Check whether the bot is online and listening for events.',
                    type: 1
                }
            });
            console.log('Slash command /status registered with Discord');
        } catch (error) {
            console.error('Slash command registration failed:', error.message);
        }
    }
}

if (require.main === module) {
    initializeDiscordServices();

    server.listen(PORT, () => {
        console.log(`Webhook listener running on http://localhost:${PORT}/webhook`);
    });
}

module.exports = { server, startServer, initializeDiscordServices };
