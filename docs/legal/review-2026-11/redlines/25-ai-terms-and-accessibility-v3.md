# Gala Dock AI Terms (v3 draft, gd-ai-3.0) and Accessibility Statement note

> **DRAFT v3: not in force, not published.** Q54 legal review, 2026-11-14 (AI review, not legal advice). Part A replaces AI / Gala Agent Terms 2026-10. **Changes:** organisers and suppliers only (owner decision: no AI in customer accounts); express term when enabling automatic modes (§3.5); region statement only once confirmed (§5.1); plan limits apply to Agent-created records (Q53). Part B is a note on the Accessibility Statement.

## Part A: AI Terms

These terms explain what Gala Agent does, its limits, how your data is used and what you're responsible for. **Gala Agent is available only in organiser and supplier workspaces; it isn't available in customer accounts.** They apply with the Terms of Service and the Organiser or Supplier Terms.

### 1. What Gala Agent is
1.1 Gala Agent uses large language models from Microsoft Azure OpenAI Service, with Gala Dock's own tools, to answer questions about your events and workspace, draft content, plan tasks and, where you allow it, take actions in Gala Dock for you. No other AI provider is used.
1.2 It is an AI system, not a person. AI-generated content and Agent actions are labelled and recorded in your workspace's run history and audit log.
1.3 It isn't a lawyer, accountant, licensing officer or insurer and doesn't give legal, tax, financial or safety advice. It won't claim that a venue is licensed, an event is compliant, an insurance policy covers you or a payment is protected unless that fact is recorded in Gala Dock data, and it says where the information comes from.

### 2. Accuracy
2.1 AI output can be wrong, incomplete or out of date. Check important details (dates, amounts, availability, legal requirements) before relying on them.
2.2 Gala Agent treats content from listings, messages, files and web pages as data, never as instructions.

### 3. Permissions and approvals
3.1 Gala Agent can only do what the person who started a task may do, through the same permission checks and plan limits as the rest of Gala Dock.
3.2 Risk levels: R0 reading and R1 drafts run automatically; R2 low-risk internal changes run automatically unless your policy says "Always ask"; R3 external non-binding actions (such as sending a message) need approval unless pre-authorised; R4 commitments (priced quotes, holds, publishing tickets) need a person's approval unless your workspace has set an autopilot rule with limits; R5 security, identity, payout details, legal signatures and destructive account actions are never done by Gala Agent.
3.3 Owners and managers choose the autonomy level (Always ask, Draft only, Suggest, Low-risk automatic, Operational automatic, Policy autopilot). Approvals show what will happen, amounts and who is affected, can be edited or rejected, and expire.
3.4 **Responsibility.** Actions you approve, or that run automatically under a level or rule you set, are your workspace's actions.
3.5 **Express term.** Before switching on "Operational automatic" or "Policy autopilot", an owner confirms with a tick that actions taken automatically within the limits set are the workspace's own commitments.

### 4. Credits and limits
Gala Agent uses AI credits (Subscription and Credits Terms §5). Owners and managers can set daily, per-task and monthly limits; by default work stops when credits run out. Unattended routines never spend beyond your limits.

### 5. Your data
5.1 Gala Agent sends the minimum relevant records with your request to Azure OpenAI under our agreement with Microsoft, processed in [region: confirm before publishing]. Prompts and outputs aren't used to train Microsoft's models. [Confirm abuse-monitoring retention or the approved exemption.]
5.2 We store the task, plan, tool calls and results, approvals and a short summary. We don't request or store the model's private reasoning.
5.3 Agent history follows the Data Retention Schedule and is included in your data export.
5.4 Gala Agent doesn't make decisions about individuals with legal or similarly significant effects without human involvement.

### 6. Acceptable use
Don't use Gala Agent to generate unlawful, deceptive or harmful content, impersonate people, bypass permissions, limits or safety controls (including by prompt injection), or create misleading marketing or fake reviews.

### 7. Content you create
You own the drafts and content Gala Agent produces for you, to the extent the law allows. You're responsible for checking it doesn't infringe others' rights before publishing.

### 8. Availability
Gala Agent depends on third-party AI services and may be unavailable or restricted; long-running tasks pause and resume.

## Part B: Accessibility Statement note
- Withdraw `docs/legal/accessibility-statement.md` (2026-10): it claims screen-reader support for core journeys and 400% zoom reflow that no audit supports.
- The live draft at `/accessibility` (prepared 11 November 2026, draft banner) is accurate and limited to the 12 October axe audit. Recommended for publication after the playbook §3 phone/tablet sweep, with the dates and known-issues list refreshed, the draft banner removed, and no new claims without an audit.
- Add to "Reporting a problem": "We will make reasonable adjustments, for example helping you buy a ticket or make a booking by email or phone."
