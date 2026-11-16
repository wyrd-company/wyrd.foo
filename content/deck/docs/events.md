---
title: Events and session relays
product: deck
order: 6
---

The service publishes activity for touched Discord threads to the configured
JetStream subject prefix, followed by server, channel and thread IDs: messages,
button and select-menu uses, and poll votes. Threads nobody touched through deck
publish nothing. The [events specification](https://github.com/wyrd-company/deck/blob/main/docs/specifications/events.yml)
defines the payload and delivery guarantees.

Delivery is at least once. A message can arrive twice, for example when the
service reads back messages it missed while stopped, so consumers should
de-duplicate by the activity's `id`. Each poll vote, a repeated one included, is
its own event with an `id` the service makes. Deck's own messages carry
`sent_by`, `sender_key` and `nonce`. The service acknowledges button presses to Discord as soon as it receives them.

A relay on the client's machine can pass an event to deck:

```sh
deck resolve --event - --json < activity.json
```

Resolve reads the local affinity store without contacting the service or Vault.
It returns the thread's sessions with their ordered identifiers, most recently
sent to first. A session's own message leaves that session out, using the sending
fingerprint and nonce recorded before the RPC. Sessions without identifiers are
left out. The relay decides how to wake a session; deck does not call a harness.

`deck resolve THREAD` returns affinity without own-event filtering. Both forms
succeed with an empty list when there is no matching session. Invalid event
payloads exit 2. Resolve has no unread report.

Keep the relay's configured `store.path` pointed at the same local store as the
sessions. A thread is associated only once the first successful send result has
been recorded, so activity during that first send can be unread without yet
resolving to a session. The [client design](https://github.com/wyrd-company/deck/blob/main/docs/technical-designs/client.yml)
explains that window and the local storage contract.

## Subscribe and resolve

With the default prefix, a subject is
`deck.1287000000000000001.1287000000000000002.1571484634081529857`.
Its three IDs identify the server, parent channel and thread. The JSON body uses
snake_case fields and string IDs. A message activity looks like:

```json
{
  "id": "1571485045016997890",
  "time": "2026-11-15T11:20:31.512Z",
  "bot": "helper",
  "server_id": "1287000000000000001",
  "channel_id": "1287000000000000002",
  "thread_id": "1571484634081529857",
  "author": {"id": "1100000000000000003", "username": "reviewer"},
  "message": {"content": "Ready to release."}
}
```

Other activities carry `component` or `poll_vote` instead of `message`; inspect
`component.custom_id` or `poll_vote.removed` in the
[event schema](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/events/activity.schema.json).
Use a durable JetStream consumer for a relay that must catch up after downtime;
a plain NATS subscription sees only live traffic. Acknowledge an event only
after the wake request has succeeded, and deduplicate redelivery by `id`.

For example, a relay such as Trowel can consume `deck.*.*.*`, put the raw event
body on stdin, and execute a local adapter like this:

```sh
#!/bin/sh
set -eu
sessions=$(deck resolve --config /path/to/client.yml --event - --json)
printf '%s\n' "$sessions" | /path/to/wake-sessions
```

`wake-sessions` is your harness adapter, not a deck command. It reads the
`sessions` array, whose entries carry ordered `identifiers` with `name` and
`value`, and wakes each matching local session. Treat event content and session
values as data, not shell commands; use argument arrays when calling a harness.
An empty sessions list is a successful no-op. Return a failure if resolution or
waking fails so the consumer can retry. See
[Trowel's relay configuration](https://wyrd.foo/docs/trowel/configuration) for its
command-on-stdin delivery. Bot credentials stay in the deck service; a relay
needs only its NATS consumer identity and access to the client's affinity store.
