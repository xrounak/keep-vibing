'use client';

import { useEffect, useRef, useState } from 'react';

// Looping background video. Serves a lighter re-encode on narrow
// viewports so mobile connections aren't stuck pulling the desktop file.
// The source itself is already optimized for smooth start:
//   - trimmed to a short loop, downscaled from the original 4K/2GB source
//   - H.264 CRF encode, no audio track (autoplay requires muted anyway)
//   - -movflags +faststart so the moov atom is at the front of the file,
//     letting playback begin before the whole file has downloaded
export default function BackgroundVideo() {
  const videoRef = useRef(null);
  const [src, setSrc] = useState('/video/bg.mp4');

  useEffect(() => {
    if (window.innerWidth < 768) setSrc('/video/bg-mobile.mp4');
  }, []);

  // if a network hiccup ever stalls playback, retry a resume rather than
  // leaving the frame frozen — background video has no user-visible
  // controls to recover with otherwise
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const resume = () => video.play().catch(() => {});
    video.addEventListener('stalled', resume);
    video.addEventListener('suspend', resume);
    return () => {
      video.removeEventListener('stalled', resume);
      video.removeEventListener('suspend', resume);
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        className="bg-video"
        src={src}
        poster="/video/bg-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="bg-scrim" />
    </>
  );
}
