import Ably from 'ably';

// Server-side token issuance — the real Ably API key stays here, never
// reaches the browser. Client requests a short-lived token from this
// route instead (standard Ably auth pattern).
export async function GET() {
  const client = new Ably.Rest(process.env.ABLY_API_KEY);
  const tokenRequestData = await client.auth.createTokenRequest({
    clientId: `vibe-${Math.random().toString(36).slice(2)}`,
  });
  return Response.json(tokenRequestData);
}
