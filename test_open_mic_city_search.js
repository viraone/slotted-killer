const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const context = {};
vm.createContext(context);

for (const name of [
  'getOpenMicCity',
  'compactOpenMicSearchText',
  'spacedOpenMicSearchText',
  'openMicMatchesSearch',
  'filterOpenMicsBySearch',
  'getOpenMicCityCounts',
  'getOpenMicSearchTitle',
  'getOpenMicCitySuggestions',
  'getOpenMicSuggestionSplit',
  'getOpenMicSearchSuggestions'
]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in app.js`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
}

const mics = [
  { id: 'uisce', name: 'Uisce Irish Pub', venue: '', address: '1409 Cornwall Ave, Bellingham, WA 98225' },
  { id: 'rickshaw', name: 'Read The Room', venue: 'Rickshaw Restaurant', address: 'Rickshaw Restaurant, 322 N 105th St, Seattle, WA 98133' },
  { id: 'darrens', name: 'Spice of Life Variety Open Mic', venue: '', address: "Darren's Speakeasy, Renton, WA" },
  { id: 'seatac', name: 'Airport Laughs', venue: '', address: '18205 Des Moines Memorial Dr, SeaTac, WA 98148' },
  { id: 'mrb', name: "Mr. B's Mead Center (White Center) Open Mic", venue: '', address: '9444 Delridge Way SW, Seattle, WA 98106' },
  { id: 'redmond', name: 'Redmond Mic', venue: '', address: '15770 Redmond Way, Redmond, WA 98052' },
  { id: 'noaddress', name: 'Mystery Mic', venue: '', address: '' }
];
const allIds = 'uisce,rickshaw,darrens,seatac,mrb,redmond,noaddress';
const ids = (query) => context.filterOpenMicsBySearch(mics, query).map((mic) => mic.id).join(',');
const title = (query) => context.getOpenMicSearchTitle(context.filterOpenMicsBySearch(mics, query), query);

// The city is the part before ", WA" (or any two-letter state).
assert.equal(context.getOpenMicCity(mics[0]), 'Bellingham');
assert.equal(context.getOpenMicCity(mics[1]), 'Seattle');
assert.equal(context.getOpenMicCity(mics[2]), 'Renton');
assert.equal(context.getOpenMicCity(mics[3]), 'SeaTac');
assert.equal(context.getOpenMicCity(mics[6]), '');
assert.equal(context.getOpenMicCity(null), '');
assert.equal(context.getOpenMicCity({ address: '123 Main St, Portland, OR 97201' }), 'Portland');

// An empty search keeps every mic.
assert.equal(ids(''), allIds);
assert.equal(ids('   '), allIds);

// Case, spaces and partial city names.
assert.equal(ids('bellingham'), 'uisce');
assert.equal(ids('BELLINGHAM'), 'uisce');
assert.equal(ids('  Bellingham '), 'uisce');
assert.equal(ids('bell'), 'uisce');
assert.equal(ids('sea'), 'rickshaw,seatac,mrb');
assert.equal(ids('sea-tac'), 'seatac');
assert.equal(ids('Sea Tac'), 'seatac');
assert.equal(ids('redmond'), 'redmond');

// Streets are not searched, and a match must start a word.
assert.equal(ids('des moines'), '');
assert.equal(ids('redmond way'), '');
assert.equal(ids('ham'), '');
assert.equal(ids('ice'), '');
assert.equal(ids('portland'), '');

// Mic names and venues are searched by word.
assert.equal(ids('rickshaw'), 'rickshaw');
assert.equal(ids('white center'), 'mrb');
assert.equal(ids("mr. b's"), 'mrb');

// City counts: most mics first, then A to Z.
assert.equal(
  context.getOpenMicCityCounts(mics).map((entry) => `${entry.city}:${entry.count}`).join(','),
  'Seattle:2,Bellingham:1,Redmond:1,Renton:1,SeaTac:1'
);

// The title is the city only when the search names one city.
assert.equal(title('bell'), 'Bellingham');
assert.equal(title('sea'), 'Search results');
assert.equal(title('rickshaw'), 'Search results');
assert.equal(title('portland'), 'Search results');

// A city match wins: "ta" is Tacoma only, and mic names are used when no city starts with the text.
const tavernMics = [
  { id: 'tacoma', name: 'Comedy Night', venue: '', address: '933 Market St, Tacoma, WA 98402' },
  { id: 'tap', name: '1928 Tap & Grill Open Mic', venue: '', address: '14525 Aurora Ave N, Shoreline, WA 98133' }
];
const tavernIds = (query) => context.filterOpenMicsBySearch(tavernMics, query).map((mic) => mic.id).join(',');
assert.equal(tavernIds('ta'), 'tacoma');
assert.equal(tavernIds('tacoma'), 'tacoma');
assert.equal(tavernIds('tap'), 'tap');
assert.equal(tavernIds('grill'), 'tap');

// Suggestions while typing: cities that start with the typed text; none when empty or already complete.
const counts = context.getOpenMicCityCounts(mics);
const suggest = (query) => context.getOpenMicCitySuggestions(counts, query).map((entry) => entry.city).join(',');
assert.equal(suggest(''), '');
assert.equal(suggest('s'), 'Seattle,SeaTac');
assert.equal(suggest('re'), 'Redmond,Renton');
assert.equal(suggest('bell'), 'Bellingham');
assert.equal(suggest('bellingham'), '');
assert.equal(suggest('Sea Tac'), '');
assert.equal(suggest('x'), '');
assert.equal(context.getOpenMicSuggestionSplit('Bellingham', 'bell'), 4);
assert.equal(context.getOpenMicSuggestionSplit('SeaTac', 'sea t'), 4);
assert.equal(context.getOpenMicSuggestionSplit('Seattle', ''), 0);

// The drop-down offers cities first, then mic or venue names; nothing once the text is complete.
const offer = (query) => context.getOpenMicSearchSuggestions(mics, query)
  .map((entry) => `${entry.kind}:${entry.label}:${entry.detail}`).join('|');
assert.equal(offer(''), '');
assert.equal(offer('r'), 'city:Redmond:1 mic|city:Renton:1 mic|mic:Read The Room:Seattle|mic:Redmond Mic:Redmond');
assert.equal(offer('rick'), 'mic:Rickshaw Restaurant:Seattle');
assert.equal(offer('white center'), "mic:Mr. B's Mead Center (White Center) Open Mic:Seattle");
assert.equal(offer('Read The Room'), '');
assert.equal(offer('bellingham'), '');

// Every mic on the live list must have a city the search can read.
const records = JSON.parse(fs.readFileSync('data/open-mics.json', 'utf8'));
for (const record of records) {
  assert.notEqual(
    context.getOpenMicCity({ address: String(record.location || '') }),
    '',
    `no city found in the address of "${record.name}": "${record.location}"`
  );
}

console.log('test_open_mic_city_search.js passed');
