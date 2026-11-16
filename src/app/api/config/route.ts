// Runtime (not build-time) public config, so GOOGLE_CLIENT_ID can be set through docker-compose / .env.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? null });
}
