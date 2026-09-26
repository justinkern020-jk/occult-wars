import { useState } from 'react';
import { Battlefield } from './components/Battlefield';
import { CombatDemo } from './components/CombatDemo';
import { Catalog } from './components/Catalog';
import './App.css';

type Tab = 'field' | 'combat' | 'catalog';

export default function App() {
  const [tab, setTab] = useState<Tab>('field');

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Kern presents · Cabals dual-Power</p>
        <h1>Occult Wars</h1>
        <p className="tagline">
          Ten orders · one leaden hour. Power is vitality and damage — one number.
          Loyalty banks the muster. Fast strikes first; Slow strikes last.
        </p>
        <nav className="app-tabs" aria-label="Sections">
          <button
            type="button"
            className={`brass-btn ${tab === 'field' ? 'brass-btn-solid' : ''}`}
            onClick={() => setTab('field')}
          >
            Battlefield
          </button>
          <button
            type="button"
            className={`brass-btn ${tab === 'combat' ? 'brass-btn-solid' : ''}`}
            onClick={() => setTab('combat')}
          >
            Combat sandbox
          </button>
          <button
            type="button"
            className={`brass-btn ${tab === 'catalog' ? 'brass-btn-solid' : ''}`}
            onClick={() => setTab('catalog')}
          >
            Catalog
          </button>
        </nav>
        <p className="links">
          <a href="https://occultwar.grok.me" target="_blank" rel="noreferrer">
            Reference on grok.me
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

      {tab === 'field' && <Battlefield />}
      {tab === 'combat' && <CombatDemo />}
      {tab === 'catalog' && <Catalog />}

      <footer className="foot">
        <p>
          Combat coin = <strong>Power</strong> (dual vitality/damage). Loyalty coin ={' '}
          <strong>muster cost</strong> from the loyalty bank — never swapped. Engine:{' '}
          <code>src/game/combat.ts</code>.
        </p>
      </footer>
    </div>
  );
}
