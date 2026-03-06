import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdversarialBench",
  description: "Adversarial LLM benchmark dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        <footer className="max-w-7xl mx-auto px-6 py-6 border-t border-border mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
            <a
              href="https://github.com/montanaflynn/AdversarialBench"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-secondary"
            >
              GitHub
            </a>
            {process.env.NEXT_PUBLIC_GIT_SHA && (
              <span>
                <a
                  href={`https://github.com/montanaflynn/AdversarialBench/commit/${process.env.NEXT_PUBLIC_GIT_SHA}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:text-text-secondary"
                >
                  {process.env.NEXT_PUBLIC_GIT_SHA}
                </a>
                {process.env.NEXT_PUBLIC_GIT_MSG && (
                  <span className="ml-1.5">{process.env.NEXT_PUBLIC_GIT_MSG}</span>
                )}
              </span>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
