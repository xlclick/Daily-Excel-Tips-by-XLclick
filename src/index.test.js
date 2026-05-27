'use strict';

// Minimal self-contained smoke test — run with: node src/index.test.js

const fs = require('fs');
const path = require('path');

// --- inline the helpers we want to test ---

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ';' && !inQuotes) {
      fields.push(current.trim()); current = '';
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
    headers.forEach((h, i) => { obj[h] = values[i] !== undefined ? values[i] : ''; });
    return obj;
  });
}

function selectTipForToday(tips) {
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
  return tips[dayOfYear % tips.length];
}

// --- tests ---

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

console.log('\nRunning tests...\n');

// 1. CSV parsing
const csvPath = path.join(__dirname, '..', 'data', 'tips.csv');
const tips = parseCSV(fs.readFileSync(csvPath, 'utf8'));

assert(tips.length === 34, `tips.csv contains 34 tips (got ${tips.length})`);
assert(tips[0].id === '0', 'First tip has id 0');
assert(tips[0].functionality === 'Deep Refresh', 'First tip functionality correct');
assert(tips[1].description.includes('gmail'), 'Escaped double-quotes parsed correctly');
assert(tips[tips.length - 1].id === '33', 'Last tip has id 33');

// 2. All tips have required fields
const requiredFields = ['id', 'title', 'functionality', 'description', 'post-slug'];
const allHaveFields = tips.every(t => requiredFields.every(f => t[f] && t[f].length > 0));
assert(allHaveFields, 'All tips have required fields');

// 3. All post-slug values are valid URLs
const allUrls = tips.every(t => t['post-slug'].startsWith('https://xlclick.com/'));
assert(allUrls, 'All post-slug values are xlclick.com URLs');

// 4. Rotation always returns a tip
const tip = selectTipForToday(tips);
assert(tip !== undefined, 'selectTipForToday returns a tip');
assert(typeof tip.id === 'string', 'Selected tip has an id');

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exitCode = 1;
