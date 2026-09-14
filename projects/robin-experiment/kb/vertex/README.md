# Vertex Manufacturing 401(k) — Knowledge Base sources

Robin's **live** Knowledge Base is five documents in the ElevenLabs dashboard. Until 2026-09-14 none
had a source in this repo. This folder is where that changes, one document at a time, as each is
edited. A file here is the source of truth for the live document it names; the live document is
updated **from** this file, never edited in the dashboard directly.

| Live document | id | Source here |
|---|---|---|
| Vertex Manufacturing 401(k) — Loans From Your Account | `omgR8I0aJlWd7BAUptbJ` | [`vertex-401k-loans.md`](./vertex-401k-loans.md) |
| Vertex Manufacturing 401(k) Retirement Savings Plan — Plan Overview | `mTEvJXWfY3LX0wXppL54` | dashboard only |
| Vertex Manufacturing 401(k) — Rolling Money Into the Plan | `6s2ACPI7LUAFY9dFN3Jp` | dashboard only |
| Vertex Manufacturing 401(k) — Leaving the Company | `GtykQpGMEtkzMoG6aCPP` | dashboard only |
| KBA — Reset Your NestEgg U Password | `q5HTNlQpLSvAzdk8NbsU` | dashboard only |

The three `intrust-*.md` files in the parent folder are INTRUST-era, drive nothing, and carry a
staleness banner.

**To push an edit live:** `agents_update_kb_document` with the document id and the file's full
content (a content update keeps the id, so the agent and the Plan Questions procedure keep their
references). Then confirm retrieval with `agents_query_knowledge_base_rag` using the new question,
and check whether the RAG index needed a rebuild.
