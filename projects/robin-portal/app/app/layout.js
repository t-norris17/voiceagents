import "./globals.css";
import Link from "next/link";
import HomeLink from "./components/HomeLink.js";
import { PRE_PAINT, CONTROL_JS } from "../lib/theme.js";

export const metadata = {
  title: "Robin",
  description: "One front door for Robin: quality, accuracy, knowledge factory, question tester, calls.",
};

const DOORS = [
  { href: "/survey/", label: "Quality" },
  { href: "/grader", label: "Accuracy" },
  { href: "/factory/", label: "Knowledge Factory" },
  { href: "/robin-q-tester/", label: "Question Tester" },
  { href: "/calls", label: "Calls" },
  { href: "/about", label: "About Robin" },
];

export default function RootLayout({ children }) {
  return (
    // data-theme lands on <html> before hydration (PRE_PAINT), which React did not render, so the
    // mismatch warning is suppressed on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      </head>
      <body>
        <div className="sheet">
          <div className="mast">
            <Link className="wm" href="/">Robin</Link>
            <nav aria-label="Sections">
              {DOORS.map((d) => (
                <a key={d.href} href={d.href}>{d.label}</a>
              ))}
            </nav>
            <div className="rp-theme" role="group" aria-label="Theme">
              <button type="button" data-theme-set="light" aria-pressed="false">Light</button>
              <button type="button" data-theme-set="dark" aria-pressed="false">Dark</button>
            </div>
          </div>
          {children}
          <HomeLink />
          <footer>
            <span>Robin · Vertex Manufacturing 401(k)</span>
            <span>Robin's own call path never runs through this portal.</span>
          </footer>
        </div>
        <script dangerouslySetInnerHTML={{ __html: CONTROL_JS }} />
      </body>
    </html>
  );
}
