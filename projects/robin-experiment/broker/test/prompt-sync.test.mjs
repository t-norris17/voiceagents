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

// Line wrapping in the prompt is cosmetic; every phrase check runs against normalised whitespace.
const flat = PRODUCTION_SYSTEM.replace(/\s+/g, " ");

test("the caller's name is asked for, and is never treated as identification", () => {
  // Both halves matter and they pull against each other: ask warmly, trust nothing.
  assert.match(flat, /who am I speaking with\?/i);
  assert.match(flat, /A SPOKEN NAME IS NEVER IDENTIFICATION/);
  // The two asks must stay in separate turns — merging them is what made the call feel like a form.
  assert.match(flat, /Never ask for the name and the Member ID in the same breath/);
});

test("a name already offered is never asked for again", () => {
  // This lived as a sub-bullet under a heading that said ASK, which is how a model ends up asking
  // anyway. It has to be the first branch, stated before the ask, or it doesn't survive contact.
  assert.match(flat, /NEVER ASK FOR ONE YOU ALREADY HAVE/);
  assert.match(flat, /THEY ALREADY TOLD YOU/);
  // The skip branch must come before the ask branch in the text.
  assert.ok(
    flat.indexOf("THEY ALREADY TOLD YOU") < flat.indexOf("who am I speaking with"),
    "the skip case must be stated before the ask, or the ask wins"
  );
  // Applies whenever they offered it, not only in their opening line.
  assert.match(flat, /at any point, not just in their opening line/);
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
  assert.match(flat, /Never infer, state, or confirm a company or plan from a name/);
});
