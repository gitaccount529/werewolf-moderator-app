import SocketProvider from '@/components/SocketProvider';

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SocketProvider>{children}</SocketProvider>;
}
