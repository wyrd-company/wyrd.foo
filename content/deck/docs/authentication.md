---
title: Authentication
product: deck
order: 3
---

Each client signs its SSH connection with an ed25519 key in OpenBao or Vault
Transit. deck reads only the public key; Transit signs the handshake without
exporting the private key. The service accepts public keys configured under
`keys`, each with its own grants.

Create a Transit key on the mount you choose, then configure the client's
`vault` address and `key`:

```sh
bao secrets enable -path=identities transit
bao write identities/keys/agent type=ed25519
```

```yaml
vault:
  address: unix:///run/vault/agent.sock
key:
  mount: identities
  name: agent
```

This is part of the client configuration, not a complete file. See the
[annotated client example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/client.yml)
for the other required fields. For a direct Vault connection, configure
`vault.auth.token_file` or `vault.auth.approle`; a socket proxy can authenticate
requests itself. deck reads no `VAULT_*`, `BAO_*`, proxy, or TLS environment
settings. See the [configuration specification](https://github.com/wyrd-company/deck/blob/main/docs/specifications/configuration.yml)
for supported addresses, CA configuration and authentication.

The client's Vault policy needs `read` on `identities/keys/agent` and `update`
on `identities/sign/agent`. Run:

```sh
deck config key --config /path/to/client/config.yml
```

It prints one authorized-keys line with comment `deck:agent`, followed by its
SHA256 fingerprint. Add the public line under the service's `keys`:

```yaml
keys:
  - name: agent
    public_key: ssh-ed25519 REPLACE_WITH_THE_PRINTED_PUBLIC_KEY deck:agent
    grants:
      - bot: helper
        server: "1287000000000000001"
        channels: ["1287000000000000002"]
```

A grant names a configured bot, one Discord server and that server's parent
channels. `channels: ["*"]` covers only the named server through that bot.
Grants apply to sending, history and metadata as well as activity. The service
checks the bot before it asks Discord about a target, and uses Discord metadata
or its touched-thread registry to find the actual server and parent channel.
A refusal uses the same `PERMISSION_DENIED` response for every ungranted target.
Lists include only granted channels. Client allow/deny lists can narrow this
access further.

The service also needs an SSH host key. Generate an unencrypted OpenSSH
ed25519 private key, store it in a KV v2 field, and configure that reference:

```sh
ssh-keygen -t ed25519 -N '' -f deck-host
bao kv put -mount=hosts deck/host private_key=@deck-host
```

```yaml
host_key:
  mount: hosts
  path: deck/host
  field: private_key
```

The service's Vault policy needs `read` on `hosts/data/deck/host`, together with
the separately configured bot-token and NATS-credential paths. The KV mount
must exist and use KV v2. The service reads secrets serially during startup
and keeps the host key in memory; an existing service accepts connections
without further Vault reads.

```sh
deck service host-key --config /etc/deck/config.yml
```

It prints the host's public line and SHA256 fingerprint. Put the public line in
the client's `service.host_key`. The client checks this exact key, reads no
`known_hosts` file, and fails if the server presents another key. Both key
commands support `--json`, producing `public_key` and `fingerprint` fields.
They contact Vault only and never print private material or signatures.

Restart the service after changing configured public keys, grants or the host
key. After rotating a Transit key, run `deck config key` again and replace the
service's configured public line; its configured name can stay the same. A
connection pins the Transit version it first read, so a concurrent rotation
cannot change the identity signing that handshake. After rotating the host
key, update the clients' pins before connecting. See the
[transport design](https://github.com/wyrd-company/deck/blob/main/docs/technical-designs/transport.yml) for protocol and timeout
details.
