import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Edge Proof Factory — Partner Portal",
  description:
    "Runnable SUSE Edge/AI proof kits and their partner hand-off kits, with the factory's build ledger.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
          {children}
        </main>
        <footer className="border-t border-black/10 px-6 py-6 text-center text-xs text-black/50 dark:border-white/10 dark:text-white/50">
          Facts and steps only — see the reference kit&apos;s handoff docs for
          sourced versions and hardware floors.
        </footer>
      </body>
    </html>
  );
}
