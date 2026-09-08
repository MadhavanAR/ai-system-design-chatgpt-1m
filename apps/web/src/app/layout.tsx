import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI System Design — ChatGPT Architecture for 1M Users',
  description: 'Production-oriented reference architecture and runnable implementation of a ChatGPT-like AI system for 1M users.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#212121] text-gray-100 antialiased h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
