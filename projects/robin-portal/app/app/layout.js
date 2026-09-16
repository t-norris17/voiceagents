import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Robin",
  description: "One front door for Robin: survey, grader, knowledge factory, question tester, calls.",
};

const DOORS = [
  { href: "/survey/", label: "Survey" },
  { href: "/grader", label: "Grader" },
  { href: "/factory/", label: "Knowledge Factory" },
  { href: "/robin-q-tester/", label: "Question Tester" },
  { href: "/calls", label: "Calls" },
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="sheet">
          <div className="mast">
            <Link className="wm" href="/">Robin</Link>
            <nav aria-label="Sections">
              {DOORS.map((d) => (
                <a key={d.href} href={d.href}>{d.label}</a>
              ))}
            </nav>
          </div>
          {children}
          <footer>
            <span>Robin · Vertex Manufacturing 401(k)</span>
            <span>Robin's own call path never runs through this portal.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
