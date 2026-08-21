'use client';

import { useEffect, useState, useRef } from 'react';
import { IconClose } from './icons';

const DISMISS_KEY = 'rks-install-prompt-dismissed-at';
const RESURFACE_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // don't nag every visit — only resurface after a few days

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari's own flag
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const deferredPromptRef = useRef(null);
  const iosRef = useRef(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed, never nag

    iosRef.current = isIOS();

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt < RESURFACE_AFTER_MS) return;

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanInstall(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // wait a bit before popping up — not the first thing a visitor sees
    const timer = setTimeout(() => setVisible(true), 8000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    deferredPromptRef.current = null;
    setCanInstall(false);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="install-overlay" onClick={dismiss}>
      <div className="install-modal glass" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn install-close" onClick={dismiss}>
          <IconClose width={15} height={15} />
        </button>

        <h3>Add to Home Screen</h3>

        {iosRef.current ? (
          <p>
            Tap the Share icon in Safari, then <strong>Add to Home Screen</strong> — opens
            fullscreen next time, no browser bar in the way.
          </p>
        ) : (
          <p>Install this as an app for a fullscreen, no-browser-chrome experience.</p>
        )}

        <div className="install-actions">
          {!iosRef.current && canInstall && (
            <button className="pill-btn" onClick={install}>Install</button>
          )}
          <button className="leave-room-btn" onClick={dismiss}>Not now</button>
        </div>

        <p className="install-credit">made by @unknowngmr02</p>
      </div>
    </div>
  );
}
