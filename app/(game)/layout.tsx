import PusherProvider from '@/components/PusherProvider';

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PusherProvider>{children}</PusherProvider>;
}
