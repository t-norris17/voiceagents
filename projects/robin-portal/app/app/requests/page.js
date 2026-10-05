// Requests: the call center's queue of after-hours callback requests (components/RequestsQueue.js).
// A server wrapper only so the page can carry its own title; the queue itself runs in the browser.
import RequestsQueue from "../components/RequestsQueue.js";

export const metadata = { title: "Requests · Birdnest" };

export default function RequestsPage() {
  return <RequestsQueue />;
}
