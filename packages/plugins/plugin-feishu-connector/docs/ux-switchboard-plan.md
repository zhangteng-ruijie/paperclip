# Feishu Connector UX Switchboard Plan

## Product goal

Turn the Feishu connector from a raw settings form into a message switchboard.
The first-time user should understand three things without reading internal IDs:

1. Which Feishu robots are available.
2. Which Feishu messages enter Paperclip.
3. Which Paperclip company and agent will process each message.

Advanced lark-cli, App Secret, deployment, event logs, and Base sync settings remain available, but they must not dominate the default experience.

## Borrowed lessons from Agent-Pixels

- Lead with a live operational metaphor. Agent-Pixels uses a pixel room; this plugin uses a Feishu message switchboard.
- Make state visible. Users should see robot pool, business entries, and listening state immediately.
- Keep configuration task-based. A robot is just an account pool item; each business entry chooses one robot, one company, one agent, and one reply mode.
- Push low-frequency engineering controls behind an Advanced tab.
- Every important row needs a direct next action: bind, edit entry, check robot, run test, or copy real test text.

## Information architecture

- Overview: current readiness, next best action, high-level counts, and first-run guidance.
- Entries: business entry list plus the new-entry wizard. This is where users map Feishu messages to Paperclip agents.
- Robots: Feishu robot pool. Multiple robots can coexist; using a robot happens at entry level.
- Test: simulation test, real Feishu test text, capability checklist, production monitor summary.
- Advanced: App Secret and authorization, local/cloud deployment, runtime switches, event logs, and Base sync.

## User stories

- As a regular user, I want to bind or choose a Feishu robot without seeing App Secret by default.
- As an operator, I want multiple companies and agents to use different Feishu robots and entries.
- As an engineer, I want App Secret, lark-cli path, event subscriber, logs, and Base sync available in one advanced area.
- As a business owner, I want to copy one real Feishu test phrase and know whether the result should appear in Feishu or Paperclip.

## Acceptance criteria

- The default page does not render every configuration block at once.
- Tab switching works without page reload.
- Overview shows the next action and no advanced raw fields.
- Entries page shows business entries and the entry wizard only.
- Robots page shows all configured robots and does not imply there is only one global robot.
- Test page clearly distinguishes page simulation from real Feishu testing.
- Advanced page keeps App Secret, user authorization, runtime, events, deployment, and Base settings available.
- Save/check actions show visible feedback on every tab.
- Cloud package still builds and can be installed as a Paperclip plugin package.
