// Shown while a server-rendered page waits on its data (About and the landing page read Robin live from
// ElevenLabs). Next streams this first, then replaces it with the page.
import NestLoader from "./components/NestLoader.js";

export default function Loading() {
  return <NestLoader size={200} label="Loading" />;
}
