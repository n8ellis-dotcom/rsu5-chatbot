import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RSU5 Community Assistant',
  description: 'Ask questions about RSU5 board meetings, budgets, policies and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
