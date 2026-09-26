import { CombatDemo } from './components/CombatDemo';
import { Catalog } from './components/Catalog';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Cabals · dual-Power</p>
        <h1>Occult Wars</h1>
        <p className="tagline">
          Ten orders · one leaden hour. Power is vitality and damage — one
          number. Fast strikes first; Slow strikes last; otherwise the street
          answers in the same breath.
        </p>
        <p className="links">
          <a href="https://occultwar.grok.me" target="_blank" rel="noreferrer">
            Live on grok.me
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/justinkern020-jk/occult-wars"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </p>
      </header>
      <CombatDemo />
      <Catalog />
      <footer className="foot">
        <p>
          Combat engine: <code>src/game/combat.ts</code>. Card Power converted
          with <code>Math.max(attack, health)</code> from the Grok app catalog.
          Deploy via Vercel from this GitHub repo.
        </p>
      </footer>
    </div>
  );
}
