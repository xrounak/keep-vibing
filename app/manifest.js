export default function manifest() {
  return {
    name: 'Raat Ka Safar',
    short_name: 'Raat Ka Safar',
    description: 'night drives, old songs, borrowed nostalgia',
    start_url: '/',
    display: 'fullscreen',
    background_color: '#14100c',
    theme_color: '#14100c',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
