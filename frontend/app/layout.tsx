import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText, Sparkles } from "lucide-react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Dizin Studio",
  description: "PDF dizin sayfa numarası çevirici ve doğrulama çalışma alanı",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        <Providers>
          <div className="relative min-h-screen overflow-x-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40"
            />

            <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/[0.78] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/[0.62]">
              <div className="mx-auto flex h-16 w-[calc(100vw-32px)] max-w-none items-center justify-between px-2 sm:px-3 lg:px-4">
                <Link href="/" className="group inline-flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/20 transition-transform group-hover:-rotate-3 group-hover:scale-105">
                    <BookOpenText className="h-5 w-5" />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-base font-semibold tracking-tight text-slate-950">
                      Dizin Studio
                    </span>
                    <span className="hidden text-xs font-medium text-slate-500 sm:inline">
                      Akıllı sayfa eşleme ve kontrol paneli
                    </span>
                  </span>
                </Link>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  Modern review workflow
                </div>
              </div>
            </header>

            <main className="mx-auto flex w-[calc(100vw-32px)] max-w-none flex-1 flex-col px-1 py-4 sm:px-2 lg:px-3">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
