import { IconHeadphones, IconLink } from './icons';

export default function TopBar({ onOpenMood, onOpenShare }) {
  return (
    <header className="topbar">
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
          <div className="brand-title">Raat Ka Safar</div>
          <div className="brand-sub">NIGHT DRIVES · OLD SONGS</div>
        </div>
      </div>
      <button className="pill-btn mood-btn" onClick={onOpenMood}>
        <IconHeadphones width={16} height={16} /> <span>Mood</span>
      </button>
      <button className="share-icon-btn" onClick={onOpenShare} title="Vibe Together">
        <IconLink width={17} height={17} />
      </button>
    </header>
  );
}
