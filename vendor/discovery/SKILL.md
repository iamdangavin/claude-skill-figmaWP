---
name: discovery
description: Interview the user relentlessly about a plan, decision, or idea until you reach a shared understanding, asking every question through the AskUserQuestion tool. Use whenever the user wants to stress-test their thinking, pressure-test a plan before building, or says "discovery", "run discovery", "grill me", "interview me", or "poke holes in this".
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

## Rounds

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, then wait for the answers before the next round.

## Asking with AskUserQuestion

Ask every question through the `AskUserQuestion` tool. Never write questions out as text in your reply.

- One call holds at most 4 questions. If the frontier is larger, make consecutive calls in the same round, most foundational questions first.
- Give each question 2 to 4 options. Each option gets a short `label` (1 to 5 words) and a `description` saying what choosing it implies and what it trades off.
- Put your recommended option first and end its label with `(Recommended)`.
- Never add an "Other" option. The tool lets the user type a free answer automatically. If a question feels open-ended, still offer your best concrete candidates as options.
- Keep `header` to 12 characters or less: a short topic tag.
- Set `multiSelect: true` only when the options are not mutually exclusive.
- Put all the context the user needs into the `question` text itself. Any text you write around the call is one or two lines of framing at most.

When the user answers with free text, treat it as their decision and reshape the tree around it. Only ask a follow-up if the answer is genuinely ambiguous.

## Recomputing the frontier

Each round of answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

## Facts vs. decisions

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, docs, etc.), dispatch a sub-agent with a fresh context window to find it. Don't ask the user for anything you could look up yourself. Sub-agents cannot use AskUserQuestion, so they only gather facts and report back; every question comes from you.

Don't block on a sub-agent: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait. Ask the rest of the frontier now.

The _decisions_ are the user's: put each one to them and wait.

## Finishing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.

Then write a short summary of every settled decision and confirm it with one AskUserQuestion call (options like "Yes, proceed (Recommended)" and "Not yet, keep going"). Do not act on the plan until the user confirms you have reached a shared understanding.

## Fallback

If AskUserQuestion is not available in this environment, use whatever structured question tool exists. If there is none, ask in plain text: number each question, list the options, and mark your recommendation.
