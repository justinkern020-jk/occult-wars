type Props = {
  onEnter: () => void;
};

export function TitleScreen({ onEnter }: Props) {
  return (
    <div
      className="title-screen"
      style={{ backgroundImage: 'url(/assets/titles/app-cover.jpg)' }}
      data-testid="title-screen"
    >
      <div className="title-plate">
        <p className="title-presents">Kern presents...</p>
        <h1 className="title-word">Occult Wars</h1>
        <div className="title-rule" />
        <p className="title-epithet">Six orders · one leaden hour</p>
        <button
          type="button"
          className="brass-btn brass-btn-solid title-enter"
          onClick={onEnter}
        >
          Enter the circle
        </button>
      </div>
    </div>
  );
}
