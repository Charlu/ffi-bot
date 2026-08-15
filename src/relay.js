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
  //return filterAndFormatMessage(payload);
  return formatSeerrRequestMessage(payload);
}

/**
 * Formats a Seerr Media Request JSON payload into a Discord message.
 *
 * @param {string} jsonString - Raw JSON payload received from the webhook.
 * @returns {string} A formatted Markdown string for Discord.
 */
function formatSeerrRequestMessage(jsonString) {
  try {
    const payload = jsonString;

    const title = payload.subject ? `**${payload.subject}**` : '🎬 **New Media Request**';
    const lines = [];

    lines.push(`🔔 ${title}`);
    lines.push('---');

    // Description / Message
    if (payload.message) {
      lines.push(`> ${payload.message}`);
      lines.push('');
    }

    // Media Details & Conditional ID Linking
    if (payload.media) {
      const isTv = payload.media.media_type?.toLowerCase() === 'tv';
      const mediaTypeLabel = isTv ? 'TV Show' : 'Movie';
      const statusLabel = payload.media.status ? `\`${payload.media.status.toUpperCase()}\`` : '`UNKNOWN`';

      lines.push(`🎥 **Type:** ${mediaTypeLabel} (Status: ${statusLabel})`);

      // Use TVDB for TV shows, TMDB for Movies
      if (isTv && payload.media.tvdbId) {
        lines.push(`🔗 **TVDB:** https://www.thetvdb.com/dereferrer/series/${payload.media.tvdbId}`);
      } else if (!isTv && payload.media.tmdbId) {
        lines.push(`🔗 **TMDB:** https://www.themoviedb.org/movie/${payload.media.tmdbId}`);
      }
    }

    // Request Information
    if (payload.request?.requestedBy_username) {
      lines.push(`👤 **Requested By:** \`${payload.request.requestedBy_username}\``);
    }

    // Target User Notification
    if (payload.notifyuser_username) {
      lines.push(`\n*Notified user: @${payload.notifyuser_username}*`);
    }

    return lines.join('\n');
  } catch (error) {
    console.error('Failed to parse webhook JSON payload:', error);
    return '❌ **Error:** Failed to process the media request payload.';
  }
}

module.exports = {
  DEFAULT_WEBHOOK_PORT,
  normalizeMessage,
  filterAndFormatMessage,
  buildDiscordPayload,
  formatSeerrRequestMessage
};
