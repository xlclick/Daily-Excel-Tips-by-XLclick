'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// GitHub Actions helpers (no @actions/core dependency required)
// ---------------------------------------------------------------------------

function getInput(name) {
  const val = process.env[`INPUT_${name.toUpperCase().replace(/ /g, '_')}`] || '';
  return val.trim();
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// CSV parser — handles semicolon delimiter and RFC 4180 double-quote escaping
// ---------------------------------------------------------------------------

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseCSV(content) {
  const lines = content.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] !== undefined ? values[i] : '';
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// State — persisted to data/state.json so reruns don't repeat the same tip
// ---------------------------------------------------------------------------

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadState(stateFile) {
  if (!fs.existsSync(stateFile)) {
    return { lastSentDate: null, lastSentTipId: null, history: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      lastSentDate: parsed.lastSentDate || null,
      lastSentTipId: parsed.lastSentTipId || null,
      history: Array.isArray(parsed.history) ? parsed.history.map(String) : [],
    };
  } catch {
    return { lastSentDate: null, lastSentTipId: null, history: [] };
  }
}

function saveState(stateFile, state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

// Pick the next tip whose id is not in `history`. When every tip has been
// sent in the current cycle, the history resets and rotation starts again.
function pickNextTip(tips, history) {
  let sent = new Set(history.map(String));

  if (sent.size >= tips.length) {
    // Full cycle completed — start over, but keep the most recent tip in
    // the new history so we never send it twice back-to-back.
    sent = new Set(history.length > 0 ? [String(history[history.length - 1])] : []);
  }

  const next = tips.find(t => !sent.has(String(t.id)));
  // Fallback: with the reset above this should always find a tip, but if
  // somehow it doesn't, fall back to the first tip rather than crashing.
  return { tip: next || tips[0], cycleReset: sent.size !== new Set(history.map(String)).size };
}

// ---------------------------------------------------------------------------
// Message formatter — Telegram HTML mode
// ---------------------------------------------------------------------------

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessage(tip) {
  const title = escapeHTML(tip.functionality || tip.title);
  const description = escapeHTML(tip.description);
  const url = tip['post-slug'];

  return [
    '💡 <b>Excel Tip of the Day</b>',
    '',
    `🔧 <b>${title}</b>`,
    '',
    description,
    '',
    `📖 <a href="${url}">Full tutorial →</a>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Telegram sender
// ---------------------------------------------------------------------------

function sendTelegramMessage(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          return reject(new Error(`Invalid JSON from Telegram: ${data}`));
        }

        if (parsed.ok) {
          resolve(parsed);
        } else {
          reject(new Error(`Telegram API error ${parsed.error_code}: ${parsed.description}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run() {
  try {
    const telegramKey = getInput('telegram_key');
    const chatId = getInput('chat_id');

    if (!telegramKey) throw new Error('Input "telegram_key" is required but was not provided.');
    if (!chatId) throw new Error('Input "chat_id" is required but was not provided.');

    const dataDir = path.join(__dirname, '..', 'data');
    const csvPath = path.join(dataDir, 'tips.csv');
    const statePath = path.join(dataDir, 'state.json');

    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const tips = parseCSV(csvContent);
    if (tips.length === 0) throw new Error('No tips found in data/tips.csv');

    const state = loadState(statePath);
    const today = todayUTC();

    // Idempotency: if a tip was already sent today, do nothing.
    if (state.lastSentDate === today) {
      console.log(`⏭  Tip already sent today (${today}, tip #${state.lastSentTipId}). Skipping.`);
      setOutput('skipped', 'true');
      setOutput('tip_id', state.lastSentTipId || '');
      return;
    }

    const { tip, cycleReset } = pickNextTip(tips, state.history);
    const message = formatMessage(tip);

    await sendTelegramMessage(telegramKey, chatId, message);

    const newHistory = cycleReset
      ? [String(tip.id)]
      : [...state.history.map(String), String(tip.id)];

    saveState(statePath, {
      lastSentDate: today,
      lastSentTipId: String(tip.id),
      history: newHistory,
    });

    setOutput('skipped', 'false');
    setOutput('tip_id', tip.id);
    setOutput('tip_name', tip.functionality);
    setOutput('cycle_reset', cycleReset ? 'true' : 'false');

    console.log(`✅ Sent tip #${tip.id}: ${tip.functionality}${cycleReset ? ' (new cycle started)' : ''}`);
  } catch (err) {
    setFailed(err.message);
  }
}

// Export internals for unit tests; only run when invoked directly.
if (require.main === module) {
  run();
}

module.exports = {
  parseCSV,
  parseCSVLine,
  loadState,
  saveState,
  pickNextTip,
  todayUTC,
  formatMessage,
};
