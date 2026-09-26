import { unlockAudio, brassClick } from '../game/sfx';

type Props = {
  onEnter: () => void;
  dailyGranted?: number;
};

const COVER = '/assets/titles/app-cover.jpg';

export function TitleScreen({ onEnter, dailyGranted = 0 }: Props) {
  return (
    <div className="title-screen" data-testid="title-screen">
      <img
        className="title-cover-img"
        src={COVER}
        alt=""
        decoding="async"
        fetchPriority="high"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="title-plate">
        <p className="title-presents">Kern presents...</p>
        <h1 className="title-word">Occult Wars</h1>
        <div className="title-rule" />
        <p className="title-epithet">Six orders · one leaden hour</p>
        {dailyGranted > 0 && (
          <p className="title-daily" data-testid="day-purse">
            The day-purse opens: {dailyGranted.toLocaleString()} shards.
          </p>
        )}
        <button
          type="button"
          className="brass-btn brass-btn-solid title-enter"
          data-testid="enter-circle"
          onClick={() => {
            unlockAudio();
            brassClick();
            onEnter();
          }}
        >
          Enter the circle
        </button>
      </div>
    </div>
  );
}
