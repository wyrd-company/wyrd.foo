---
title: Running the service
product: deck
order: 7
---

## Set up your own service

For an operator running both the service and a client, use this order:

1. Provision the [Discord bot and NATS connection](#discord-and-nats-prerequisites).
   Store the bot token and NATS credentials in KV v2, and give the service's
   Vault identity read access to those paths.
2. [Create and store the SSH host key](authentication.md), then configure the
   service's Vault connection, secret references, NATS settings and bots using
   the [service example](configuration.md#service). Replace sample addresses,
   secret references, bot names and IDs. Save it as `/etc/deck/config.yml`, or
   pass your chosen path to each service command. Leave the sample public-key
   entries until step 5 so the key-printing command can validate the config;
   start only after replacing them.
3. Run `deck service host-key --config /etc/deck/config.yml` using that service
   configuration and Vault access. Put the printed public line in the client's
   `service.host_key`; the service need not be running for this command.
4. [Create the client's Transit identity](authentication.md), configure its
   [Vault access and client settings](configuration.md#client), and run
   `deck config key --config ./client.yml` to print its public line.
5. Replace the sample entries under the service's `keys` with that public line
   and its bot/server/parent-channel grants. [Validate](configuration.md#service)
   and start the service with the commands below, or use the [container](#container).
6. Follow the [first-message walkthrough](overview.md#send-your-first-message)
   from `deck channels` onward. Check [health](#health) if it cannot connect.

Validate the completed service configuration, then start it in the foreground:

```sh
deck service validate --config /etc/deck/config.yml
deck service start --config /etc/deck/config.yml
```

The default service configuration is `/etc/deck/config.yml`. The service reads
its NATS credentials, bot tokens and SSH host key from the configured OpenBao
or Vault references. It connects to NATS and creates or checks the activity
stream and thread bucket before accepting SSH connections on `listen.ssh`.
See [Configuration](configuration.md) and [Authentication](authentication.md)
for credentials, host-key pinning and client grants.

Once NATS and the stream are ready, the service opens every bot's gateway
session, then listens for SSH on `listen.ssh` and for health checks on
`listen.health`. It writes JSON log lines to stderr: start and stop, gateway
and NATS state changes, refused calls with the key name and gRPC code, and
publish failures. Logs never hold a token, a message's content or a Discord
response body. A start that fails logs the step and the configuration field
involved and exits 1; an invalid configuration exits 2.

## Discord and NATS prerequisites

Create a bot in Discord's Developer Portal, enable the privileged **Message
Content Intent**, and install it in each server with the `bot` scope. deck
requests guild, guild-message, message-content and guild-poll gateway intents.
Copy its token into a KV v2 field accessible only to the service's Vault identity.
The CLI needs its Transit signing permissions; it needs no bot-token access.

In every granted parent channel, give the bot View Channel, Send Messages, Send
Messages in Threads, Create Public Threads, Create Polls, Embed Links, Attach
Files and Read Message History. For a role that is not mentionable, Mention
Everyone is also needed to notify it. Select forum tags from Discord when the
channel requires them. A missing permission fails the send; inspect the named
permission and the channel overrides.

Use one service instance per configuration. Connect it to NATS with JetStream
enabled and JWT credentials stored as a complete `.creds` value in KV v2. Its
NATS identity needs publish access to `<prefix>.>`, publish/subscribe access to
`$KV.<bucket>.>`, publish access to `$JS.FC.>` and the JetStream API
`$JS.API.>`, and subscribe access to its request inboxes. Limit these permissions
to the chosen stream, consumers and registry where your NATS policy supports it.
Stream and bucket create/update permissions are needed when their `manage` flags
are true. An event-only subscriber needs access to its subject and consumer API,
without access to the registry bucket.

Store secrets from protected files, rather than putting their values on a shell
command line. For the paths in the annotated service example, an operator with
an authenticated `bao` CLI and an existing `kv` KV v2 mount can write:

```sh
bao kv put -mount=kv deck/bots/helper token=@/secure/discord-token
bao kv put -mount=kv deck/nats creds=@/secure/deck.creds
```

Create and store the host key as described in [authentication](authentication.md),
then set the service's `keys` to the client public lines and grants. The example
keys and IDs must be replaced. Restart to apply configuration and secret changes.

## Container

This example assumes an operator has placed the service file at
`/srv/deck/config.yml` and provides an authenticating Vault socket at
`/run/openbao/agent.sock` on the Docker host. Mount the containing socket directory
so socket replacement stays visible:

```sh
docker run --detach --name deck --restart unless-stopped \
  --stop-timeout 15 \
  --publish 2222:2222 --publish 127.0.0.1:8080:8080 \
  --mount type=bind,src=/srv/deck/config.yml,dst=/etc/deck/config.yml,readonly \
  --mount type=bind,src=/run/openbao,dst=/run/openbao,readonly \
  ghcr.io/wyrd-company/deck:1.2.3
```

Choose an existing release tag in place of `1.2.3`. UID/GID 10001 must be able to
read the file and connect to the socket. For direct HTTPS Vault access, mount
its configured token or AppRole secret-ID file instead, plus any private CA.
The configured NATS URLs must resolve inside the container; `localhost` refers
to the container itself. Persistent service state lives in NATS, whose storage
and backups belong to its operator.

```sh
docker exec deck deck service health --config /etc/deck/config.yml
docker logs deck
docker stop deck
```

## Retention

`nats.stream.max_age` keeps activity for seven days by default. Retained button
uses and poll votes are available to read/listen; Discord history can recover
messages after that window, but cannot recover those interactions. Clients
report a retention gap when an unread cursor predates retained activity; use
`deck history THREAD` to inspect older messages.

`nats.threads.max_age` expires inactive key touches; omitted or zero keeps them
indefinitely. This is service-managed expiry, not a bucket TTL. Losing the
registry loses thread routes and notification eligibility. Back up the registry
alongside the event stream. Client SQLite stores are separate: losing one loses
that machine's session affinity, cursors and own-send records.

## Health

`GET /healthz` on `listen.health` answers 200 while every bot's gateway session
is ready, NATS is connected and the activity index has caught up with the
stream; otherwise 503, with a JSON body naming each check. `GET /livez`
answers 200 while the process runs. On the same machine, ask for it with:

```sh
deck service health --config /etc/deck/config.yml
```

It prints the body and exits 0 when healthy, 1 when unhealthy and 4 when the
service cannot be reached. The container image runs it as its HEALTHCHECK.

## Stopping

Send SIGTERM or SIGINT to stop the service. It closes the SSH listener and ends
open RPCs, closes the gateway sessions, gives sends in flight, waiting activity
and registry writes a short budget each, and drains NATS, within 10 seconds. A
canceled caller does not by itself cancel an accepted Discord send; process
shutdown does. Use the same nonce when retrying a send whose outcome is
unknown, as described in [Posting](posting.md).

Messages sent while the service was stopped are read back from Discord when it
starts. Button presses and poll votes in that time are lost.

## Deleting, recreating or restoring the event stream

With `nats.stream.manage: true`, the service creates a missing event stream
only when it starts. Use one procedure to delete, recreate or restore the stream:

1. Stop the service.
2. Delete the stream, and wait for the delete command to return.
3. Recreate the stream, or restore it from a snapshot. With
   `nats.stream.manage: false`, you must complete this step before starting the
   service; it cannot start with a missing stream. After a restore, also
   delete the `stream.generation` key from the thread bucket before starting
   the service. For the default bucket, using an authenticated NATS CLI context:

   ```sh
   nats kv del deck-threads stream.generation
   ```

   Substitute `nats.threads.bucket` if configured differently; do not delete
   the bucket or its thread records.
4. Start the service. With `nats.stream.manage: true`, it creates the stream
   if it is still missing.

After a restore, every retained activity is unread again rather than missed.
Apply the same generation-key reset after restoring storage or losing the newest
stream messages while preserving the stream's creation time. Restoring a
snapshot while the service runs is unsupported.

If the stream is deleted while the service runs, the service stops answering
calls (UNAVAILABLE), its healthcheck reports the stream as missing, and it logs
the remedy: restart it once the deletion has finished, or create the stream.
It recovers by itself once the stream exists. Until then it keeps retrying the
activity it has received; after a restart it reads missed messages back from
Discord, but button presses and poll votes that were still waiting are lost.

On a single NATS server, the delete command returns only after the stream's
files are gone, so waiting for it is enough. This has not been verified on a
clustered NATS server. A service that restarts while someone else's deletion is
still running can still collide with it.

The complete startup, retention and health contract is in the
[service design](https://github.com/wyrd-company/deck/blob/main/docs/technical-designs/service.yml).
