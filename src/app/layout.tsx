import type { Metadata, Viewport } from "next";
import { Chakra_Petch } from "next/font/google";
import Providers from "@/components/Providers";
import { GameLaunchProvider } from "@/components/GameLaunch";
import MobileNav from "@/components/MobileNav";
import InstallPrompt from "@/components/InstallPrompt";
import "./globals.css";

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

/// `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` resolve, so the
/// bottom nav can sit above the iOS home indicator. Zoom is intentionally left
/// enabled (maximumScale 5) for accessibility.
///
/// `interactiveWidget: "resizes-content"` makes the layout shrink when the
/// on-screen keyboard opens, so a focused field stays visible instead of being
/// covered. The default (`resizes-visual`) only shrinks the visual viewport, which
/// leaves `position: fixed` elements — the bottom nav, the sheets — sitting behind
/// the keyboard while the input they belong to is hidden.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#060d17" },
  ],
};

export const metadata: Metadata = {
  title: "Airen — A Retro-Futuristic Sneaker Game",
  description:
    "Enter a pixel-art sneaker universe. Collect the Astra, Sol, and Luna virtual sneaker families, play, upgrade, stake, and trade on Polygon.",
  applicationName: "Airen",
  appleWebApp: {
    capable: true,
    title: "Airen",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${chakraPetch.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* Wraps the app so the launch loader can cover the viewport on navigation. */}
          <GameLaunchProvider>
            {children}
            {/* Single instance for the whole app so it never remounts on navigation. */}
            <MobileNav />
            {/* Mounted here because Chrome fires `beforeinstallprompt` early —
                a listener inside a route can miss it. */}
            <InstallPrompt />
          </GameLaunchProvider>
        </Providers>
      </body>
    </html>
  );
}
