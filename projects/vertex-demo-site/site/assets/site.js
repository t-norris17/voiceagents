/* Vertex Manufacturing demo site: Robin widget wiring.
 *
 * ROBIN is the only place the agent is named. Point agentId at another agent and every page follows.
 * The agent (Robin (web demo)) is a duplicate of live Robin. The first message is overridden here,
 * not on the agent, so the agent config stays identical to live Robin.
 */
const ROBIN = {
  agentId: "agent_0101m3sjqvfyejsa9kn127ez26mm",
  firstMessage:
    "Hi, this is Robin with the Vertex Manufacturing 401(k) help desk. Using your full name, who am I speaking with today?",
  dynamicVariables: { channel: "web_widget", site: "vertex-demo" },
  embedSrc: "https://unpkg.com/@elevenlabs/convai-widget-embed@0.18.3",
};

(function mountRobin() {
  // The widget is a custom element; it needs its script once per page.
  const el = document.createElement("elevenlabs-convai");
  el.setAttribute("agent-id", ROBIN.agentId);
  el.setAttribute("override-first-message", ROBIN.firstMessage);
  el.setAttribute("dynamic-variables", JSON.stringify(ROBIN.dynamicVariables));
  document.body.appendChild(el);

  const s = document.createElement("script");
  s.src = ROBIN.embedSrc;
  s.async = true;
  s.type = "text/javascript";
  document.body.appendChild(s);
})();

// Any element with data-ask-robin opens the widget. Event shape verified in the 0.18.3 bundle:
// document listens for "elevenlabs-agent:expand" with detail.action of expand | collapse | toggle.
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-ask-robin]");
  if (!t) return;
  e.preventDefault();
  document.dispatchEvent(
    new CustomEvent("elevenlabs-agent:expand", { detail: { action: "expand" } })
  );
});

// Mobile nav
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

// Reveal on scroll (content stays visible if IntersectionObserver is missing)
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => en.isIntersecting && (en.target.classList.add("in"), io.unobserve(en.target))),
    { threshold: 0.12 }
  );
  reveals.forEach((r) => io.observe(r));
} else {
  reveals.forEach((r) => r.classList.add("in"));
}
