'use strict';

// Minimal self-contained smoke test — run with: node src/index.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseCSV,
  loadState,
  saveState,
  pickNextTip,
  todayUTC,
  formatMessage,
} = require('./index');

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 1. CSV parsing
// ---------------------------------------------------------------------------

const csvPath = path.join(__dirname, '..', 'data', 'tips.csv');
const tips = parseCSV(fs.readFileSync(csvPath, 'utf8'));

assert(tips.length === 34, `tips.csv contains 34 tips (got ${tips.length})`);
assert(tips[0].id === '0', 'First tip has id 0');
assert(tips[0].functionality === 'Deep Refresh', 'First tip functionality correct');
assert(tips[1].description.includes('gmail'), 'Escaped double-quotes parsed correctly');
assert(tips[tips.length - 1].id === '33', 'Last tip has id 33');

const requiredFields = ['id', 'title', 'functionality', 'description', 'post-slug'];
const allHaveFields = tips.every(t => requiredFields.every(f => t[f] && t[f].length > 0));
assert(allHaveFields, 'All tips have required fields');

const allUrls = tips.every(t => t['post-slug'].startsWith('https://xlclick.com/'));
assert(allUrls, 'All post-slug values are xlclick.com URLs');

// ---------------------------------------------------------------------------
// 2. pickNextTip — never repeats within a cycle
// ---------------------------------------------------------------------------

const fakeTips = [
  { id: '0', functionality: 'A' },
  { id: '1', functionality: 'B' },
  { id: '2', functionality: 'C' },
];

const first = pickNextTip(fakeTips, []);
assert(first.tip.id === '0', 'Empty history picks first tip');
assert(first.cycleReset === false, 'No cycle reset on empty history');

const second = pickNextTip(fakeTips, ['0']);
assert(second.tip.id === '1', 'History [0] picks tip 1');

const third = pickNextTip(fakeTips, ['0', '1']);
assert(third.tip.id === '2', 'History [0,1] picks tip 2');

// ---------------------------------------------------------------------------
// 3. pickNextTip — cycle reset when all sent, but never immediate repeat
// ---------------------------------------------------------------------------

const afterCycle = pickNextTip(fakeTips, ['0', '1', '2']);
assert(afterCycle.cycleReset === true, 'Cycle resets when all tips sent');
assert(afterCycle.tip.id !== '2', 'After cycle reset, does not immediately repeat last tip');
assert(afterCycle.tip.id === '0', 'After cycle reset, picks first non-recent tip');

// ---------------------------------------------------------------------------
// 4. loadState / saveState round-trip
// ---------------------------------------------------------------------------

const tmpFile = path.join(os.tmpdir(), `state-test-${Date.now()}.json`);

// Missing file → default state
const defaultState = loadState(tmpFile);
assert(defaultState.lastSentDate === null, 'Default state has null lastSentDate');
assert(Array.isArray(defaultState.history) && defaultState.history.length === 0, 'Default state has empty history');

// Round-trip
saveState(tmpFile, { lastSentDate: '2026-05-27', lastSentTipId: '7', history: ['7'] });
const loaded = loadState(tmpFile);
assert(loaded.lastSentDate === '2026-05-27', 'Round-trip preserves lastSentDate');
assert(loaded.lastSentTipId === '7', 'Round-trip preserves lastSentTipId');
assert(loaded.history.length === 1 && loaded.history[0] === '7', 'Round-trip preserves history');

// Corrupt JSON → graceful default
fs.writeFileSync(tmpFile, '{not valid json');
const corrupted = loadState(tmpFile);
assert(corrupted.lastSentDate === null, 'Corrupt state file falls back to defaults');
fs.unlinkSync(tmpFile);

// ---------------------------------------------------------------------------
// 5. todayUTC format
// ---------------------------------------------------------------------------

const today = todayUTC();
assert(/^\d{4}-\d{2}-\d{2}$/.test(today), `todayUTC returns YYYY-MM-DD (got ${today})`);

// ---------------------------------------------------------------------------
// 6. formatMessage produces expected structure
// ---------------------------------------------------------------------------

const msg = formatMessage(tips[0]);
assert(msg.includes('Excel Tip of the Day'), 'Message contains header');
assert(msg.includes(tips[0].functionality), 'Message contains tip functionality');
assert(msg.includes(tips[0]['post-slug']), 'Message contains tutorial URL');

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exitCode = 1;
