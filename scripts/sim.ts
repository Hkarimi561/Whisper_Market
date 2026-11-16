// Play a full bot game headlessly and print a summary:  npm run sim -- [seed] [bots]
import { runBotMatch } from '../src/engine/sim';
import { GOOD_NAMES } from '../src/engine/describe';

const seed = Number(process.argv[2] ?? 12345);
const bots = Number(process.argv[3] ?? 4);
const res = runBotMatch({ seed, bots });
const s = res.state;
console.log(`seed ${seed} · ${bots} bots · ${s.rounds.length} rounds · ${res.actionsApplied} actions · ${res.conservationChecks} conservation checks`);
for (const r of s.rounds) {
  console.log(`R${r.n}${r.storm ? ' ⛈' : ''}: ` + r.events.map((e) => `${GOOD_NAMES[e.target]}${e.direction === 'up' ? '▲' : '▼'}${e.magnitude}${e.clued ? '' : '(hidden)'}`).join(', '));
}
console.log('ranking:', s.final!.ranking.map((r) => `${r.rank}. ${r.playerId} ${r.total}`).join(' | '));
console.log('titles:', s.final!.titles.map((t) => `${t.id}→${t.playerId}`).join(' '));
if (res.errors.length) {
  console.error('ERRORS:', res.errors);
  process.exit(1);
}
