import { readdirSync } from 'fs';
import { join } from 'path';

// Lists public/bg/bgN.<ext> — any count, any time. No hardcoded list on
// the client; the folder is the source of truth.
export async function GET() {
  const dir = join(process.cwd(), 'public', 'bg');
  let files = [];
  try {
    files = readdirSync(dir);
  } catch (_) {
    return Response.json([]);
  }

  const images = files
    .map((name) => {
      const match = name.match(/^bg(\d+)\.(png|jpe?g|webp)$/i);
      return match ? { name, n: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n)
    .map((f) => `/bg/${f.name}`);

  return Response.json(images);
}
