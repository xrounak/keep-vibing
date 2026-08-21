import { IconHeadphones, IconLink } from './icons';

export default function TopBar({ onOpenMood, onOpenShare }) {
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="brand">
          <a
            href="https://www.instagram.com/unknowngmr02/"
            target="_blank"
            rel="noopener noreferrer"
            className="brand-mark"
            title="@unknowngmr02"
          >
            <img src="/me.jpg" alt="@unknowngmr02" />
          </a>
          <div>
            <div className="brand-title-row">
              <span className="brand-title">Raat Ka Safar</span>
              <button className="mood-inline-btn" onClick={onOpenShare} title="Vibe Together">
                <IconLink width={13} height={13} />
              </button>
            </div>
            <div className="brand-sub">NIGHT DRIVES · OLD SONGS</div>
          </div>
        </div>
        <button className="share-icon-btn" onClick={onOpenMood} title="Mood">
          <IconHeadphones width={17} height={17} />
        </button>
      </div>
    </header>
  );
}
