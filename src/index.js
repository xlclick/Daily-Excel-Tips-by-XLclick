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
        // Escaped double-quote inside a quoted field
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
// Tip selection — deterministic daily rotation based on day-of-year
// ---------------------------------------------------------------------------

function selectTipForToday(tips) {
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
  return tips[dayOfYear % tips.length];
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

    const csvPath = path.join(__dirname, '..', 'data', 'tips.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const tips = parseCSV(csvContent);

    if (tips.length === 0) throw new Error('No tips found in data/tips.csv');

    const tip = selectTipForToday(tips);
    const message = formatMessage(tip);

    await sendTelegramMessage(telegramKey, chatId, message);

    setOutput('tip_id', tip.id);
    setOutput('tip_name', tip.functionality);

    console.log(`✅ Sent tip #${tip.id}: ${tip.functionality}`);
  } catch (err) {
    setFailed(err.message);
  }
}

run();
