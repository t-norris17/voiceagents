// Requests: the call center's queue of after-hours callback requests. When the call center is closed and
// a member needs a person, Robin files a request; this page is where the team works them.
//
// Today it is the door and an honest empty state: Robin does not file requests yet (the broker side is
// still being built, see projects/robin-portal/requests/SPEC.md and IMPLEMENTATION-PLAN.md Phases 4 to 6).
// No sample rows are shown, so nothing here can be mistaken for a real member's request. Everyone who can
// open Birdnest can open this page: there are no per-person accounts in this proof of concept.
//
// Call center hours are deliberately NOT written here. They live in one place, the broker's
// lib/hours.js, and this page will read them from there when the queue is wired.

export const metadata = { title: "Requests · Birdnest" };

export default function RequestsPage() {
  return (
    <>
      <div className="kicker">Listen · after-hours requests</div>
      <div className="page-h">
        <div>
          <h1>Requests</h1>
          <p>Members who called after hours and need a person. Call back on the number shown, verify them first, then log what happened.</p>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><div className="n tnum">0</div><div className="k">Open</div></div>
      </div>
      <p className="empty">
        No requests yet. When the call center is closed and a member needs a person, Robin will file a
        request here with what they need and the callback time she promised them.
      </p>
    </>
  );
}
