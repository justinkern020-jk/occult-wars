import { useState } from 'react';
import { Battlefield } from './components/Battlefield';
import { CombatDemo } from './components/CombatDemo';
import { Catalog } from './components/Catalog';
import { TitleScreen } from './components/TitleScreen';
import { MenuAtelier } from './components/MenuAtelier';
import './App.css';

type Screen = 'title' | 'menu' | 'field' | 'archive' | 'sandbox';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [mapId, setMapId] = useState('ashen-cross');

  if (screen === 'title') {
    return <TitleScreen onEnter={() => setScreen('menu')} />;
  }

  if (screen === 'menu') {
    return (
      <MenuAtelier
        selectedMapId={mapId}
        onSelectMap={setMapId}
        onTraining={() => setScreen('field')}
        onCollection={() => setScreen('archive')}
        onSandbox={() => setScreen('sandbox')}
      />
    );
  }

  return (
    <div className="app app-shell">
      <nav className="shell-bar" aria-label="Game shell">
        <button
          type="button"
          className="brass-btn brass-btn-ghost shell-back"
          onClick={() => setScreen('menu')}
        >
          Return to the atelier
        </button>
        <p className="shell-brand">
          <span>Occult Wars</span>
          <em>
            {screen === 'field'
              ? 'The Field'
              : screen === 'archive'
                ? 'The Collection'
                : 'Rites desk'}
          </em>
        </p>
      </nav>

      {screen === 'field' && (
        <Battlefield
          initialMapId={mapId}
          onLeave={() => setScreen('menu')}
        />
      )}
      {screen === 'archive' && <Catalog />}
      {screen === 'sandbox' && <CombatDemo />}
    </div>
  );
}
