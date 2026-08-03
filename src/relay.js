const DEFAULT_WEBHOOK_PORT = 3000;

function normalizeMessage(payload = {}) {
  const source =
    payload.source ||
    payload.service ||
    payload.app ||
    payload.data?.source ||
    payload.data?.service ||
    'Homelab';

  const preferredTitle =
    payload.title ||
    payload.name ||
    payload.data?.title ||
    payload.data?.name;

  const fallbackTitle =
    payload.event && !payload.data?.event ? payload.event : 'Homelab notification';

  const title = preferredTitle || fallbackTitle || 'Homelab notification';

  const description =
    payload.message ||
    payload.text ||
    payload.body ||
    payload.summary ||
    payload.details ||
    payload.data?.message ||
    payload.data?.text ||
    payload.data?.details ||
    'No additional details were provided.';

  return {
    content: title,
    embeds: [
      {
        title: title,
        description: String(description),
        color: 0x5865f2,
        author: {
          name: source
        },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function filterAndFormatMessage(payload = {}) {
  const normalized = normalizeMessage(payload);
  const title = String(normalized.content || 'Homelab notification');
  const description = String(normalized.embeds?.[0]?.description || 'No additional details were provided.');
  const source = String(normalized.embeds?.[0]?.author?.name || 'Homelab');

  return {
    content: `**${title}**\n${description}\n\n_Source: ${source}_`
  };
}

function buildDiscordPayload(payload) {
  return filterAndFormatMessage(payload);
}

module.exports = {
  DEFAULT_WEBHOOK_PORT,
  normalizeMessage,
  filterAndFormatMessage,
  buildDiscordPayload
};
