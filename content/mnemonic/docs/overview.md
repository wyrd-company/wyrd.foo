---
title: Overview
order: 1
product: mnemonic
install: true
---

The mnemonic plugin runs the [mnemonic](https://github.com/danielmarbach/mnemonic) memory MCP
server for Claude Code and Codex in Wyrd workspaces. Agents get mnemonic's memory tools, such as
`recall`, `remember`, `update`, `relate` and `sync`. Notes are markdown in git. Private notes go
in the main vault at `~/mnemonic-vault`, and a project's notes go in a `.mnemonic/` folder in that
project's repository.

## How the key stays out of config

mnemonic sends notes to an embedding model through Xolotl and reads the key from
`EMBED_API_KEY`. Wyrd workspaces keep that key in Vault only, never in a config file or a global
environment variable.

So the plugin starts the server under [envconsul](https://github.com/hashicorp/envconsul):

```sh
envconsul -config=/etc/mnemonic/config.hcl -once \
  npx --yes --package=@danielmarbach/mnemonic-mcp@1.0.0 mnemonic
```

envconsul reads the workspace's Xolotl key through the Vault socket in `VAULT_ADDR` and sets it as
`EMBED_API_KEY` for the server process alone. `-once` reads the key once at start. If envconsul
watched the key, a key change would restart the server and cut the session. A new key takes
effect in the next session.

## Requirements

- `envconsul` and `npx` on `PATH`, and `VAULT_ADDR` set to the workspace's Vault socket.
- `/etc/mnemonic/config.hcl`, installed by
  [workspace-ansible](https://github.com/wyrd-company/workspace-ansible). It holds no secret:

  ```hcl
  vault {
    renew_token = false
  }

  secret {
    path      = "kv/data/xolotl/keys/<workspace key>"
    no_prefix = true

    key {
      name   = "api_key"
      format = "EMBED_API_KEY"
    }
  }

  exec {
    env {
      custom = [
        "VAULT_PATH=/home/vscode/mnemonic-vault",
        "EMBED_PROVIDER=openai-compatible",
        "EMBED_BASE_URL=https://xolotl.internal",
        "EMBED_MODEL=vercel/voyage/voyage-4",
        "EMBED_DIMENSIONS=1024",
      ]
    }
  }
  ```

- The Xolotl key's policy must allow the embedding model. Without that, mnemonic still stores
  notes but skips their embeddings, so `recall` matches words and not meaning.

If `envconsul` or the config file is missing, the server exits at start with a message on stderr.

`EMBED_BASE_URL` is Xolotl's root, and the provider goes in the model name. mnemonic builds the
request URL with `new URL("/v1/embeddings", EMBED_BASE_URL)`, which drops any path in the base URL.
After you change the model or the dimensions, run mnemonic's `sync` tool with `force: true`.

## Codex

A system config can't install a Codex plugin for each user. Wyrd workspaces add the server to
`/etc/codex/config.toml` instead, running the plugin's script from the marketplace checkout:

```toml
[mcp_servers.mnemonic]
command = "sh"
args = ["/usr/local/share/agent-marketplace/plugins/mnemonic/scripts/mnemonic-mcp.sh"]
env_vars = ["VAULT_ADDR", "NODE_EXTRA_CA_CERTS", "T3CODE_THREAD_ID", "SSH_AUTH_SOCK", "GIT_OPERATOR", "XDG_STATE_HOME"]
```

Codex gives an MCP server only `HOME`, `PATH`, `USER` and a few more variables. `env_vars`
forwards the ones that envconsul, the embedding requests and the git shim need.

## Who commits the notes

mnemonic commits each note with `git`, through the workspace git shim. In a T3 Code thread, the
commit is made as the thread's registered operator. The shim reads the registration at each
commit, so if you register with `git operator set <handle>` during a session, mnemonic's next
commit uses it. Until a thread has an operator, mnemonic saves notes to disk and logs that the
commit failed.

Outside a T3 Code thread, start the harness with the operator set, for example
`GIT_OPERATOR=<handle> claude`.
