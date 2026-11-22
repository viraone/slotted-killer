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
  'getOpenMicSearchSuggestions',
  'stripOpenMicSearchState',
  'isOpenMicSearchTypo',
  'parseOpenMicSearchQuery',
  'filterOpenMicSearchEntriesByDay',
  'planOpenMicSearch'
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

// Streets are searched too, and a match must start a word.
assert.equal(ids('des moines'), 'seatac');
assert.equal(ids('redmond way'), 'redmond');
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

// Forgiving matching: a trailing state is ignored and a one-letter typo still finds the city.
assert.equal(ids('bellingham wa'), 'uisce');
assert.equal(ids('Bellingham, WA'), 'uisce');
assert.equal(ids('bellingham washington'), 'uisce');
assert.equal(ids('renton wa'), 'darrens');
assert.equal(ids('Belingham'), 'uisce');
assert.equal(ids('bellinghamm'), 'uisce');
assert.equal(ids('Bellingahm'), 'uisce');
assert.equal(ids('belingham wa'), 'uisce');
assert.equal(ids('seattel'), 'rickshaw,mrb');
assert.equal(title('Belingham'), 'Bellingham');
assert.equal(title('bellingham wa'), 'Bellingham');
assert.equal(context.isOpenMicSearchTypo('ham', 'sam'), false);
assert.equal(context.isOpenMicSearchTypo('portland', 'seattle'), false);
assert.equal(context.isOpenMicSearchTypo('seattle', 'seattle'), false);

// Addresses are searched by word: zip codes and street names.
assert.equal(ids('98225'), 'uisce');
assert.equal(ids('98133'), 'rickshaw');
assert.equal(ids('cornwall'), 'uisce');
assert.equal(ids('105th'), 'rickshaw');
assert.equal(title('98225'), 'Search results');

// Hosts and mic types are searched by word; the details text is used only when nothing else matches.
const extraMics = [
  { id: 'spice', name: 'Spice of Life', venue: '', address: "Darren's Speakeasy, Renton, WA", host: 'Yogi Paliwal', micType: 'Variety Open Mic', notes: 'Comedy, music, poetry, etc.' },
  { id: 'vera', name: 'Veracity', venue: 'The Vera Project', address: '305 Harrison St, Seattle, WA 98109', host: '', micType: 'Mix Music Mic / Comedy', notes: 'All acts welcome.' },
  { id: 'club', name: 'Club Night', venue: '', address: '933 Market St, Tacoma, WA 98402', host: 'Mike Lowry', micType: 'Only Comedy', notes: 'No music.' }
];
const extraIds = (query) => context.filterOpenMicsBySearch(extraMics, query).map((mic) => mic.id).join(',');
assert.equal(extraIds('yogi'), 'spice');
assert.equal(extraIds('Yogi Paliwal'), 'spice');
assert.equal(extraIds('lowry'), 'club');
assert.equal(extraIds('music'), 'vera');
assert.equal(extraIds('comedy'), 'vera,club');
assert.equal(extraIds('variety'), 'spice');
assert.equal(extraIds('poetry'), 'spice');

// Day words are split from the rest of the search.
const parse = (query) => {
  const parsed = context.parseOpenMicSearchQuery(query);
  return `${parsed.text}|${parsed.day}`;
};
assert.equal(parse('Tacoma Friday'), 'Tacoma|Friday');
assert.equal(parse('friday'), '|Friday');
assert.equal(parse('Fridays'), '|Friday');
assert.equal(parse('Tues'), '|Tuesday');
assert.equal(parse('tonight'), '|today');
assert.equal(parse('Tacoma tonight'), 'Tacoma|today');
assert.equal(parse('tomorrow'), '|tomorrow');
assert.equal(parse('Seattle on Sunday'), 'Seattle|Sunday');
assert.equal(parse('constructor'), 'constructor|');
assert.equal(parse('Tacoma'), 'Tacoma|');
assert.equal(parse(''), '|');

// A day word narrows the results; a city or a full mic name still wins.
const dayMics = [
  { id: 'tac-fri', name: 'Friday Laughs', venue: '', address: '1 A St, Tacoma, WA 98402', days: { Friday: true } },
  { id: 'tac-mon', name: 'Monday Mic', venue: '', address: '2 B St, Tacoma, WA 98402', days: { Monday: true, Thursday: true } },
  { id: 'sea-sun', name: 'Rickshaw Sunday Open Mic', venue: '', address: '3 C St, Seattle, WA 98133', days: { Sunday: true } },
  { id: 'monroe', name: 'Monroe Mic', venue: '', address: '4 D St, Monroe, WA 98272', days: { Wednesday: true } }
];
const buildEntries = (list) => list.map((mic) => {
  const dayName = Object.keys(mic.days)[0];
  return { mic, isToday: dayName === 'Sunday', date: 1, dayName, dateLabel: `${dayName} label` };
});
const plan = (query) => {
  const result = context.planOpenMicSearch(dayMics, query, buildEntries, 'Monday label');
  return `${result.query}|${result.day}|${result.entries.map((entry) => entry.mic.id).join(',')}`;
};
assert.equal(plan('Tacoma Friday'), 'Tacoma|Friday|tac-fri');
assert.equal(plan('friday'), '|Friday|tac-fri');
assert.equal(plan('tonight'), '|today|sea-sun');
assert.equal(plan('tomorrow'), '|tomorrow|tac-mon');
assert.equal(plan('Tacoma tomorrow'), 'Tacoma|tomorrow|tac-mon');
assert.equal(plan('Tacoma Thursday'), 'Tacoma|Thursday|tac-mon');
assert.equal(plan('thursday'), '|Thursday|tac-mon');
assert.equal(plan('Tacoma Saturday'), 'Tacoma Saturday||');
assert.equal(plan('Rickshaw Sunday Open Mic'), 'Rickshaw Sunday Open Mic||sea-sun');
assert.equal(plan('Sunday'), '|Sunday|sea-sun');
assert.equal(plan('mon'), 'mon||monroe');
assert.equal(plan('Tacoma'), 'Tacoma||tac-fri,tac-mon');

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
