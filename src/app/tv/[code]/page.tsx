import { TvRoom } from '../../../components/room-client';

export default async function TvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TvRoom code={code} />;
}
