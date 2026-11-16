import { PlayerRoom } from '../../../components/room-client';

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayerRoom code={code} />;
}
