import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { BottomTabBar } from "@/components/nav/bottom-tab-bar";
import { Sidebar } from "@/components/nav/sidebar";
import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
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
};

// viewport-fit=cover is required for env(safe-area-inset-bottom) in the
// bottom tab bar to resolve to anything other than 0 - without it, iOS
// treats the viewport as if there's no notch/home-indicator to avoid.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [accounts, categories] = user
    ? await Promise.all([
        listAccounts(supabase, user.id),
        listCategories(supabase, user.id),
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
          <Sidebar accounts={accounts} categories={categories} />
          {/* 4rem matches BottomTabBar's own min-h-16, so content clears
              the fixed bar exactly rather than by a guessed margin. lg:
              swaps that for left clearance under the persistent sidebar,
              which replaces the tab bar entirely at that width. */}
          <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
            {children}
          </div>
          <BottomTabBar accounts={accounts} categories={categories} />
        </Providers>
      </body>
    </html>
  );
}
