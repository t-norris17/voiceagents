# SPEC — Vertex Manufacturing Demo Site

**Slug:** vertex-demo-site
**Status:** active
**Last updated:** 2026-09-30

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Site | Static HTML, one CSS file, one JS file | Nothing to build, nothing to break; the widget is the only moving part. |
| Fonts | Barlow Condensed, IBM Plex Sans, IBM Plex Mono (Google Fonts) | Industrial, drawn-on-a-spec-sheet feel. |
| Widget | `@elevenlabs/convai-widget-embed` 0.18.3, hosted with the site (`assets/vendor`, MIT) | Official embed with no public-CDN dependency, so it works on networks that block shared hosts. Attributes verified from the bundle. |
| Agent | `Robin (web demo)` `agent_0101m3sjqvfyejsa9kn127ez26mm` | Duplicate of live Robin. |
| Hosting | (1) Vercel project `vertex-demo-site`, standalone; (2) mounted in the Robin portal at `/demo-website/` via `copy-modules.mjs` | (2) serves it from flyrobin.app behind the portal password, for people whose networks block shared domains. |

## Architecture

```
visitor ──▶ vercel static site ──▶ <elevenlabs-convai agent-id=…> ──▶ ElevenLabs
                 │                        │                              │
        assets/site.js injects the        text + browser voice           Robin (web demo)
        widget and wires "Ask Robin"      from one launcher              same prompt/KB/tools
        buttons via elevenlabs-agent:expand                              post-call webhook (workspace)
```

## File / folder structure

```
projects/vertex-demo-site/
  SCOPE.md SPEC.md BUILD.md
  site/
    index.html about.html careers.html benefits.html contact.html
    tester-guide.html      # noindex, unlinked; personas, parity script, prove-it status, "Open the chat widget" button
    assets/style.css       # design tokens + components
    assets/site.js         # ROBIN config, widget injection, expand buttons, reveal-on-scroll
    assets/favicon.svg
    vercel.json            # clean URLs, noindex header
```

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| ElevenLabs widget | Chat and voice on the page | Public agent id; origin allowlist on the agent | Live agent; allowlist pending deploy URL |
| ElevenLabs post-call webhook | Conversation record (workspace level, already set) | HMAC | Existing; chat delivery unverified |
| Vercel | Hosting | Team project | Pending |

## Key decisions

- **Duplicate the agent, do not reuse live Robin.** Keeps demo traffic out of tester-wave survey and quality numbers. Verified identical on prompt (18,315 chars), four procedure bodies, tool ids, KB, data-collection, LLM and webhook; TTS stability and audio tags were drifted by the duplicate and pinned back to live values.
- **Page-level `override-first-message`, agent unchanged.** Live greeting says "Thank you for calling NestEgg U support", which is wrong on a website. The override is allowed by the agent (`first_message: true`) and leaves the agent config identical.
- **Robin is invisible on the public site; the widget is the only surface.** A real employer's pages do not advertise their help-desk assistant, so the site carries no "Ask Robin" buttons, nav items or retirement marketing blocks (changed 2026-09-30 on Tanner's feedback). The benefits page is ordinary HR copy with one generic line pointing to the chat in the corner.
- **No plan facts on the site.** The 401(k) line is generic ("eligibility, contributions and account access are in the plan documents"), so any accuracy gap is Robin's and never a site-versus-KB contradiction. Eligibility rules, match, vesting and fees are deliberately absent.
- **Tester instructions live only on the unlisted `/tester-guide`**, not linked from any page. Share the URL with testers directly. SMS status lives there too.
- **Fictional-company footer on every page.**

## Open questions

- [ ] Widget `text-only` mode is not available (`supports_text_only: false`, `conversation.text_only` override off). The full variant with `text_input_enabled: true` covers typing and voice; a dedicated typing-only surface would need a config change.
- [ ] Wildcard allowlist support.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Public widget on a public URL means anyone can start conversations against the duplicate | Medium | Origin allowlist plus `require_origin_header`; 600s call cap already set; delete or disable the duplicate when the test ends. Origin header is spoofable outside a browser, so this limits casual use, not a determined caller. |
| Voice-shaped procedures ("stay on the line", `skip_turn`, `transfer_to_number`) behave oddly in chat | High | That is the finding to capture, not a bug to hide. Config stays identical. |
| `transfer_to_number` cannot connect from a browser widget | Certain | Documented in docs/elevenlabs-reference.md; chat escalation is the next prove-it item. |
| Preview URL behind Vercel auth blocks testers | Medium | Check deployment protection after first deploy. |

---

*Spec last updated: 2026-09-30*
