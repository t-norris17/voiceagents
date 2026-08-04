// The prompt exists in two places on purpose: PRODUCTION_SYSTEM is the source of truth, and
// robin-system-prompt.txt is the plain-text copy a human pastes into the ElevenLabs dashboard.
// A third copy lived in elevenlabs-experiment-setup.md and silently drifted — it still named the
// wrong plan months after the agent moved, and was missing every rule added after live-call testing.
// This test makes the remaining two impossible to drift the same way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTION_SYSTEM } from "../lib/robin-prompt.js";

const txt = readFileSync(new URL("../../robin-system-prompt.txt", import.meta.url), "utf8");

test("robin-system-prompt.txt matches PRODUCTION_SYSTEM", () => {
  assert.equal(
    txt.trim(),
    PRODUCTION_SYSTEM.trim(),
    "regenerate it: node --input-type=module -e \"import {PRODUCTION_SYSTEM} from './broker/lib/robin-prompt.js'; " +
      "import {writeFileSync} from 'node:fs'; writeFileSync('robin-system-prompt.txt', PRODUCTION_SYSTEM.trim()+'\\n');\""
  );
});

test("the caller's name is asked for, and is never treated as identification", () => {
  // Both halves matter and they pull against each other: ask warmly, trust nothing.
  assert.match(PRODUCTION_SYSTEM, /who am I speaking with\?/i);
  assert.match(PRODUCTION_SYSTEM, /A SPOKEN NAME IS NEVER IDENTIFICATION/);
  // The two asks must stay in separate turns — merging them is what made the call feel like a form.
  assert.match(PRODUCTION_SYSTEM, /Never ask for the name and the Member ID in the same breath/);
});

test("the rules that came out of live calls are still present", () => {
  for (const rule of [
    "ASK FOR BOTH AT ONCE, EVERY TIME",           // Member ID + DOB never split
    "CONFIRM THE PLAN BEFORE YOU ANSWER ANYTHING", // she invented an employer without this
    "THE LOAN TRAP, SPECIFICALLY",                 // missed an existing loan on a live call
    "TRANSFER, DON'T DELEGATE",                    // handed out a phone number instead of connecting
    "IDENTITY GATE",
  ]) assert.ok(PRODUCTION_SYSTEM.includes(rule), `lost the rule: ${rule}`);
});

test("no plan is named that the tool didn't hand back", () => {
  // Robin may only speak a plan name that verify_caller returned. The prompt names Vertex as the
  // agent's own context; it must never instruct her to assert one from a caller's name.
  // Line wrapping in the prompt is cosmetic, so normalise whitespace before matching.
  const flat = PRODUCTION_SYSTEM.replace(/\s+/g, " ");
  assert.match(flat, /Never infer, state, or confirm a company or plan from a name/);
});
