---
title: Discord conversations for agent sessions
product: deck
order: 0
---

# deck

An agent-friendly Discord client. The CLI posts questions, reads replies and
remembers which local session belongs to each thread. A separate service holds
bot tokens, connects to Discord and publishes activity to NATS JetStream.

![A synthetic conversation through the real deck CLI](assets/demo.gif)

## Send your first message

You need the [CLI installed](install.md), an [operational service](service.md),
and access to an ed25519 Transit key in OpenBao or Vault. If someone operates the
service for you, ask them for its SSH address and public host-key line, your bot
name and a parent channel ID they can grant you. The
[authentication guide](authentication.md) explains the key exchange and policies.

1. Save the [annotated client example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/client.yml)
   in a writable directory as `client.yml`. Homebrew and npm install only the
   executable, so use that link to obtain the example. APT/RPM packages provide
   `/usr/share/doc/wyrd-deck/client.example.yml`; release archives include
   `client.example.yml`. Set `service.address`, `service.host_key`, `vault.address`,
   `key.mount` and `key.name`. For a direct Vault connection, also set
   `vault.auth.token_file` or `vault.auth.approle`; omit `vault.auth` only when
   your socket proxy authenticates for you. Replace the sample channel alias with
   your granted `BOT/CHANNEL_ID`, and remove sample allow/deny entries and the
   default persona
   if you do not need them. See [configuration](configuration.md).
2. Validate the configuration and print your client's public key:

   ```sh
   deck config validate --config ./client.yml
   deck config key --config ./client.yml
   ```

   Send the printed public-key line to the service operator. Wait for them to
   register it with grants for your bot, server and parent channel, and restart
   the service. If you operate the service, add the line and grants under `keys`
   and restart it as [authentication](authentication.md) describes. Continue
   after registration is confirmed. An unregistered key fails with
   `SSH authentication failed` (exit 1); a missing grant is refused (exit 3).
3. Check the available channels:

   ```sh
   deck channels --config ./client.yml
   ```

4. Post with an explicit local session, so the same commands work in a plain shell:

   ```sh
   deck post --config ./client.yml --session conversation=first \
     --title 'Hello from deck' --text 'Can you reply in this thread?'
   ```

   The result prints a thread ID and Discord URL. Open it and ask someone to reply.
5. Read and answer, replacing the example thread ID with the one just printed:

   ```sh
   deck listen --config ./client.yml --session conversation=first --timeout 5m
   deck reply 1571484634081529857 --config ./client.yml \
     --session conversation=first --text 'Thanks, got it.'
   deck inbox --config ./client.yml --session conversation=first
   ```

Listen prints the reply and marks it read; a quiet inbox means there is no unread
activity. Keep using the same store and session. A harness can instead supply
identifiers from the ordered `session.variables` list.

## Go further

- [Posting](posting.md): mentions, files, embeds, buttons, polls, personas and uncertain sends.
- [Reading](reading.md): unread counts, history, cursor behavior and waiting for activity.
- [Events](events.md): payloads, JetStream subscribers and resolving threads to sessions.
- [Service operations](service.md): container setup, permissions, health and stream recovery.

For an agent's operating instructions, run `deck skill`. For structured output,
add `--json`; session commands include `unread`, while configuration, service,
resolve and help commands do not make an unread request. Exit 1 covers
authentication, host-key and local failures; 2 means invalid input; 3 means a
target or grant refusal; 4 means unavailable or an unknown send outcome; and 5
means a listen timeout. Inspect an unknown send before retrying it with
the nonce printed in its diagnostic.
