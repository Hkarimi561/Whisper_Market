import Link from 'next/link';
import { GoodIcon, Lantern, WaxSeal } from '../../components/art';
import { fa } from '../../i18n/fa';
import { GOODS, type Good } from '../../engine/config';

const ART: (() => React.ReactNode)[] = [
  () => <Lantern size={40} />,
  () => <WaxSeal size={46}>✉</WaxSeal>,
  () => <span className="text-4xl">🗣️</span>,
  () => <GoodIcon good="iron" size={46} />,
  () => <span className="text-4xl">👣</span>,
  () => <GoodIcon good="medicine" size={46} />,
  () => <span className="text-4xl">⛈️</span>,
];

export default function HowToPlay() {
  const h = fa.howto;
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <Link href="/" className="btn btn-ghost !min-h-11 text-sm">
        ← {fa.common.back}
      </Link>
      <h1 className="brass-text mt-5 text-4xl font-black">{h.title}</h1>
      <p className="mt-2 text-paper/90">{h.intro}</p>
      <div className="mt-4 flex gap-2" aria-hidden>
        {GOODS.map((g: Good) => (
          <div key={g} className="plank grid size-11 place-items-center">
            <GoodIcon good={g} size={30} />
          </div>
        ))}
      </div>
      <ol className="mt-6 grid gap-4">
        {h.steps.map((s, i) => (
          <li key={s.t} className="paper flex gap-4 p-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-ink/10">{ART[i]()}</div>
            <div>
              <h2 className="text-lg font-black">{s.t}</h2>
              <p className="mt-1 text-sm leading-7 text-ink/85">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="glass mt-6 p-4 text-center font-bold text-lantern">{h.tips}</p>
      <Link href="/" className="btn btn-brass mt-6 w-full">
        {h.play}
      </Link>
    </main>
  );
}
