import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Conduit — control plane for AI coding agents",
  description:
    "On-prem control plane for AI coding agents: per-engineer spend attribution, egress governance, and context-rot observability — inside your own cloud.",
};

// Inline pre-hydration script: apply the saved theme before React mounts so
// dark-mode users don't see a flash of light theme.
const themeScript = `(function(){try{var t=localStorage.getItem('conduit-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
