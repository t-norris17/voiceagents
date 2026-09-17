// Plain-words view of Robin's live configuration for the About page. Keyed on the live names
// ElevenLabs returns, never on a file in this repo. Anything live that is not mapped here still
// shows by its raw name, so the page can never hide something Robin actually has; the raw name
// stays visible in small type beside the plain one, so a reader can check the mapping.
const TOPICS = [
  [/loan/i, "Taking a loan from the plan: who qualifies, how much, repayment, and contributing while you repay"],
  [/leaving/i, "Leaving your employer: what happens to your balance and to an outstanding loan"],
  [/rolling|rollover/i, "Rolling money into the plan, or out of it"],
  [/retirement savings|plan overview|summary plan|401\(k\) retirement/i, "Plan basics: enrolling, contributions, the employer match, vesting, fees"],
  [/reset|password|nestegg/i, "Resetting a NestEgg U login (left over from the earlier demo)"],
];

const ABILITIES = {
  verify_caller: "Verify who is calling from their member ID and date of birth",
  get_balance: "Look up a verified caller's balance, vested balance and loan status",
  transfer_to_number: "Transfer the caller to a person",
  document_resolution: "Record how the call ended",
  send_reset_email: "Send a password-reset email (left over from the earlier demo)",
  skip_turn: "Wait quietly while the caller thinks or looks something up",
  end_call: "End the call",
  language_detection: "Switch language when the caller does",
};

export function describeKnowledge(names = []) {
  const out = [];
  for (const name of names) {
    const hit = TOPICS.find(([re]) => re.test(String(name)));
    const label = hit ? hit[1] : String(name);
    const row = out.find((r) => r.label === label);
    if (row) row.raw.push(String(name));
    else out.push({ label, raw: [String(name)], mapped: !!hit });
  }
  return out;
}

export function describeAbilities(tools = []) {
  return tools.map((t) => ({ label: ABILITIES[t] || String(t), raw: String(t), mapped: !!ABILITIES[t] }));
}
