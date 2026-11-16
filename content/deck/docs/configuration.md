---
title: Configuration
product: deck
order: 2
---

# Configure deck

The CLI and service each read one YAML file. Start with the complete annotated
[client example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/client.yml)
or [service example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/service.yml)
linked above, or use the copies included in a release archive. The examples
contain public sample keys and invented IDs; replace them with your own before
connecting.

## Client

The default file is `.config/deck/config.yml` under the home recorded in the OS
user database. Use `--config PATH` to select another file. The directory holding
the config must be writable: deck creates `deck.db` beside it unless `store.path`
selects an absolute path. Keep that SQLite database on the client's machine;
it holds session affinity, read cursors and send records.

| Setting | What to put there |
| --- | --- |
| `service.address` | The service's SSH host and port, such as `deck.example.internal:2222`. |
| `service.host_key` | The complete public line printed by `deck service host-key`, supplied by the service operator. |
| `service.timeout` | Connection and ordinary RPC timeout; default `15s`. Listen has its own `--timeout`. |
| `vault.address` | The client's OpenBao/Vault socket or address. |
| `key.mount`, `key.name` | The Transit mount and ed25519 key to sign with. |
| `session.variables` | Ordered environment variable names identifying a session. The first populated one is primary; all populated identifiers are saved. |
| `channels.default` | A channel alias or `BOT/CHANNEL_ID` used by `post` without a target. |
| `channels.allow`, `channels.deny` | Optional local restrictions. Deny wins. These narrow service grants. |
| `aliases.channels` | Friendly names mapped to channel IDs, optionally qualified with a bot. |
| `aliases.users`, `aliases.roles` | Friendly names mapped to Discord user and role IDs for mentions. |
| `personas`, `default_persona` | Named embed authors and the default to use on sends. |

Unqualified channel IDs work when the service can select one granted bot.
Use `BOT/ID` when more than one bot could serve the channel. Thread arguments
also accept Discord thread URLs. Copy IDs with Discord's Developer Mode enabled
under **User Settings → Advanced**.

```sh
deck config validate --config ./client.yml
deck channels --config ./client.yml
```

Validation checks fields, references and cross-field rules without connecting to
Vault, the service or Discord. `channels` checks connectivity and shows granted
channels. An unknown field or an invalid reference exits 2 and names the field.

### Sessions

For a harness, configure its ambient identifier names, for example
`[T3CODE_THREAD_ID, CLAUDE_CODE_SESSION_ID]`. An explicit session works from any
shell and takes precedence over environment detection:

```sh
deck post --session conversation=release --title 'Release' --text 'Ready?'
deck read --session conversation=release
```

With no populated identifier and no override, commands share a default session.
Use the same config, store and identifiers when returning to a conversation.
`deck resolve` reads that store to find sessions; the service never stores
harness identifiers. Protect the database as local conversation metadata.

## Service

The default service file is `/etc/deck/config.yml`. The service needs a reachable
JetStream-enabled NATS server, OpenBao/Vault, and at least one Discord bot.
[Running the service](service.md) covers Discord setup, permissions and retention;
[authentication](authentication.md) covers keys and grants.

| Setting | What to put there |
| --- | --- |
| `listen.ssh`, `listen.health` | Listener addresses; defaults `:2222` and `:8080`. |
| `vault.kv_mount` | Default KV v2 mount for secret references; default `secret`. |
| `host_key` | KV reference for an unencrypted OpenSSH ed25519 private key. |
| `nats.servers` | NATS URLs without embedded credentials. |
| `nats.creds` | KV reference containing the whole JWT `.creds` file. |
| `nats.subject_prefix` | Event prefix; default `deck`. |
| `nats.stream` | Stream name (`DECK`), event retention (`168h`), duplicate window (`2m`), replicas (`1`) and `manage` (`true`). |
| `nats.threads` | Registry bucket (`deck-threads`), optional inactivity `max_age`, replicas (`1`) and `manage` (`true`). |
| `bots` | Unique bot names and KV references for their tokens. |
| `keys` | Unique client names, public SSH keys and bot/server/parent-channel grants. |

A secret reference has `path` and `field`, and optionally a `mount` overriding
`vault.kv_mount`. The service reads these from KV v2 at startup. Inline bot
tokens, NATS credentials and host private keys are rejected by the config schema.
With `nats.stream.manage: true`, startup creates a missing stream and corrects
its settings. With `manage: false`, provision it yourself. The thread bucket
must have history 1 and no bucket TTL even when per-touch `max_age` is set.
Restart after changing configuration or rotating a service secret.

```sh
deck service validate --config ./service.yml
```

## Vault connections and authentication

Both configurations accept `unix:///absolute/path.sock`, HTTPS, or HTTP on a
loopback host. For a socket proxy that injects authentication, omit `vault.auth`.
For direct connections choose one of `vault.auth.token_file` or
`vault.auth.approle` (`role_id`, `secret_id_file`, optional `mount`). Paths to
credential files and CA files are absolute. HTTPS uses the system roots plus
`vault.ca_file` when configured; `vault.namespace` selects a namespace.

All application settings come from these files. deck does not interpolate
`${VARIABLE}` values or read `DECK_*`, `VAULT_*`, `BAO_*`, proxy variables,
`HOME`, or `XDG_CONFIG_HOME` as configuration. Only the names explicitly listed
in `session.variables` are read for session identity. The complete field and
validation contract is the
[configuration specification](https://github.com/wyrd-company/deck/blob/main/docs/specifications/configuration.yml).
