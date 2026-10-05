import "./globals.css";
import HomeLink from "./components/HomeLink.js";
import Masthead from "./components/Masthead.js";
import { PRE_PAINT, CONTROL_JS } from "../lib/theme.js";
import { mastCss, MAST_JS } from "../lib/mast.js";

export const metadata = {
  title: "Birdnest · all your eggs in one place",
  description: "Birdnest: one place to listen to, measure and improve Robin. Interactions, quality, accuracy, knowledge factory, dry run.",
};

export default function RootLayout({ children }) {
  return (
    // data-theme lands on <html> before hydration (PRE_PAINT), which React did not render, so the
    // mismatch warning is suppressed on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
        <style dangerouslySetInnerHTML={{ __html: mastCss(1120) }} />
        <link rel="stylesheet" href="/loader/loader.css" />
      </head>
      <body>
        <Masthead />
        <div className="sheet">
          {children}
          <HomeLink />
          <footer>
            <span>Birdnest · Vertex Manufacturing 401(k)</span>
            <span>Robin's own call path never runs through this portal.</span>
          </footer>
        </div>
        <script dangerouslySetInnerHTML={{ __html: CONTROL_JS }} />
        <script dangerouslySetInnerHTML={{ __html: MAST_JS }} />
        {/* The guided-tour engine (copied from the broker by scripts/copy-modules.mjs). A page
            with no steps registered gets nothing from it; Quality registers its own. */}
        <script src="/robin-tour.js" defer />
      </body>
    </html>
  );
}
