'use client';

import { useEffect, useState } from 'react';
import { IconInstagram } from './icons';

const MIN_DELAY_MS = 60 * 1000;
const MAX_DELAY_MS = 180 * 1000;
const VISIBLE_MS = 5000;

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

// A small, non-blocking badge that pops in on its own cadence and fades
// back out — never an overlay, never demands a click or dismissal.
export default function InstaBadge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let showTimer, hideTimer;

    function scheduleShow() {
      showTimer = setTimeout(() => {
        setVisible(true);
        hideTimer = setTimeout(() => {
          setVisible(false);
          scheduleShow();
        }, VISIBLE_MS);
      }, randomDelay());
    }

    scheduleShow();
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <a
      href="https://www.instagram.com/unknowngmr02/"
      target="_blank"
      rel="noopener noreferrer"
      className={`insta-badge glass ${visible ? 'visible' : ''}`}
    >
      <IconInstagram width={14} height={14} />
      <span>@unknowngmr02</span>
    </a>
  );
}
