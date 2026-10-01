// Channel detection and the grader's per-channel wording.
//
// Two things this file protects. A chat has to be recognised as one (and a phone call as a phone
// call) from the payload ElevenLabs already sends, with no phone number ever leaving the server. And
// phone grading must stay byte-identical: only a chat gets different wording.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNEL_COLS, CHANNEL_LABELS, VOICE_ANCHOR, channelOf, systemForChannel, withChannel } from "../lib/channel.js";

test("the three channels classify from the fields the live table carries", () => {
  // The three shapes found in ai_call_events on 2026-10-01: 211 phone, 5 web voice, 3 chat.
  assert.equal(channelOf({ text_only: "false", phone_type: "twilio" }), "phone");
  assert.equal(channelOf({ text_only: "false", phone_type: null }), "web_voice");
  assert.equal(channelOf({ text_only: "true", phone_type: null }), "chat");
});

test("text_only wins, and a payload with neither marker is unknown rather than guessed", () => {
  assert.equal(channelOf({ text_only: "true", phone_type: "twilio" }), "chat");
  assert.equal(channelOf({ text_only: true, phone_type: null }), "chat"); // a real boolean, not just the string
  assert.equal(channelOf({ text_only: null, phone_type: null }), null);
  assert.equal(channelOf({}), null);
  assert.equal(channelOf(undefined), null);
});

test("withChannel adds channel and removes both helper fields, so nothing extra leaves the server", () => {
  const out = withChannel([
    { conversation_id: "a", topic: "x", text_only: "true", phone_type: null },
    { conversation_id: "b", topic: "y", text_only: "false", phone_type: "twilio" },
  ]);
  assert.deepEqual(out, [
    { conversation_id: "a", topic: "x", channel: "chat" },
    { conversation_id: "b", topic: "y", channel: "phone" },
  ]);
  assert.deepEqual(withChannel(null), []);
});

test("the select never asks for the caller's phone number", () => {
  assert.ok(!/external_number/.test(CHANNEL_COLS));
  assert.ok(/phone_call->>type/.test(CHANNEL_COLS));
});

test("every channel has a label", () => {
  for (const c of ["phone", "web_voice", "chat"]) assert.ok(CHANNEL_LABELS[c]);
});

test("phone, web voice and unknown get the grader prompt UNCHANGED (same string, so grading is identical)", () => {
  const base = `${VOICE_ANCHOR} You are given the transcript.\n\n=== 1. CLAIMS ===\n...`;
  for (const ch of ["phone", "web_voice", null, undefined]) assert.equal(systemForChannel(base, ch), base);
});

test("a chat swaps the voice-call opening and appends the channel note, leaving the rubric intact", () => {
  const base = `${VOICE_ANCHOR} You are given the transcript.\n\n=== 1. CLAIMS ===\nkeep this verbatim`;
  const chat = systemForChannel(base, "chat");
  assert.ok(!chat.includes("recorded call handled by a voice agent"));
  assert.ok(chat.includes("typed web-chat conversation"));
  assert.ok(chat.includes("=== CHANNEL: TYPED CHAT ==="));
  assert.ok(chat.includes("=== 1. CLAIMS ===\nkeep this verbatim"));
});

test("a chat fails loudly if the grader prompt's opening was reworded without updating the adaptation", () => {
  assert.throws(() => systemForChannel("You review a call.", "chat"), /no longer opens with the voice-call sentence/);
});

test("the real grader prompt still opens with the sentence the chat adaptation swaps, exactly once", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "api", "grade.js"), "utf8");
  assert.equal(src.split(VOICE_ANCHOR).length - 1, 1);
});
