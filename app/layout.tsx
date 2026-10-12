import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { BottomTabBar } from "@/components/nav/bottom-tab-bar";
import { Sidebar } from "@/components/nav/sidebar";
import { getContext } from "@/lib/context";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { ensureRecurringPosted } from "@/lib/recurring-sync";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { LedgerProvider } from "@/components/spaces/ledger-provider";
import { LedgerBar } from "@/components/spaces/ledger-bar";
import { ChromeGate } from "@/components/nav/chrome-gate";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

// Space Grotesk + JetBrains Mono, not the shadcn/Geist default - the mono
// face is used specifically for amounts (see components/ui/amount.tsx),
// not for general code-like text, so JetBrains Mono's clean tabular
// digits matter more here than its ligatures ever will.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dinero",
  description: "Personal expense tracker",
  // iOS ignores most of the manifest: these are what make "Add to Home
  // Screen" open full-screen with the right name and icon.
  appleWebApp: { capable: true, title: "Dinero", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// viewport-fit=cover is required for env(safe-area-inset-bottom) in the
// bottom tab bar to resolve to anything other than 0 - without it, iOS
// treats the viewport as if there's no notch/home-indicator to avoid.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Browser chrome / status bar follows the app's own light and dark
  // backgrounds (a manifest can only hold one color).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();

  // Before the balance reads below, so a rule that came due is already in
  // the ledger when they are computed.
  if (ctx) await ensureRecurringPosted();

  const [accounts, categories] = ctx
    ? await Promise.all([
        listAccounts(ctx.supabase, ctx.scope),
        listCategories(ctx.supabase, ctx.scope),
      ])
    : [[], []];

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets .dark before first paint, ahead of hydration - a class
            React didn't render server-side, hence suppressHydrationWarning
            above (the standard, documented tradeoff for a flash-free
            theme). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          {ctx ? (
            <LedgerProvider
              value={{
                activeSpaceId: ctx.scope.spaceId,
                role: ctx.role,
                canWrite: ctx.canWrite,
                spaces: ctx.spaces,
              }}
            >
              <ChromeGate
                sidebar={<Sidebar accounts={accounts} categories={categories} />}
                ledgerBar={<LedgerBar />}
                bottomBar={<BottomTabBar accounts={accounts} categories={categories} />}
              >
                {children}
              </ChromeGate>
            </LedgerProvider>
          ) : (
            // Nobody is signed in (this is the login screen): no navigation,
            // no accounts, no ledger - nothing of the app to show or reach.
            <div className="flex flex-1 flex-col">{children}</div>
          )}
        </Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
