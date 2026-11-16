---
title: Posting and replying
product: deck
order: 4
---

A post starts a Discord thread in a forum, media, text or announcement channel.
A reply sends a message inside a thread. The service chooses the configured bot
allowed by your key's grants; specify the bot when your grants cover several.
A touched thread keeps the bot that first touched it.

Use `deck channels` to find a channel your key can use. `channels.default` in the
client configuration supplies the channel when you omit it.

```sh
deck post --title 'Release timing' --text 'Can we release this afternoon?'
deck reply 1571484634081529857 --text 'Thanks, I will prepare it.'
```

A post creates a Discord thread and prints its identifier and URL. Replying also
associates the thread with your current session. The ordered variable names in
`session.variables` determine that session; `--session NAME=VALUE` overrides
detection. With none set, deck uses a shared default session.

Use `--text-file -` to read text from stdin, `--file PATH` for attachments,
`--embed PATH` for Discord embed JSON, and `--components PATH` for component JSON.
Only one flag can read stdin. `--mention USER` and `--mention-role ROLE` accept
configured aliases or Discord IDs and can repeat. A configured default persona
can be overridden with `--persona NAME` or `--no-persona`.

A persona sets the author of a leading embed, with the text as its description.
Discord still attributes the message to the bot. Explicit mentions stay outside
that embed. Everyone, here and automatic reply pings are disabled. Discord
validates combinations of rich content as well as individual fields.

Text must be valid UTF-8. The complete encoded request, including attachments,
must fit within 64 MiB. Invalid input exits 2 and names the field to fix before
recording or sending a message.

```sh
deck post team --title 'Pick a time' --mention owner \
  --poll 'When?' --answer Today --answer Tomorrow --poll-duration 48h
```

A forum or media post sends its poll as a second message because Discord drops
polls from forum starters. For a poll-only post, the thread title supplies the
starter's text. A poll failure does not undo its post; check the diagnostic or
JSON `poll_error`. Text-channel posts send their content in the parent channel
and create a thread on that message.

Discord rejects a text-channel post that combines a poll and an attached file
(`INVALID_POLL_ATTACHMENTS`); deck currently reports `Discord validation failed:
poll` and exits 2. Post the poll first, then attach the file in a separate reply
using the printed thread ID:

```sh
deck post team --title 'Pick a time' --poll 'When?' --answer Today --answer Tomorrow
deck reply 1571484634081529857 --file agenda.txt
```

For forum and media posts, a file can stay on the starter because the poll is
sent as a separate message. Guidance for a more actionable refusal is tracked
in [issue #17](https://github.com/wyrd-company/deck/issues/17).

## Embeds, buttons and personas

Embed files contain a Discord embed object or an array of objects. Component
files contain an array of Discord action rows. For example, save these as
`summary.json` and `buttons.json`:

```json
{"title":"Release candidate","description":"The build is ready for a decision.","color":5636095}
```

```json
[{"type":1,"components":[{"type":2,"style":1,"label":"Approve","custom_id":"release:approve"}]}]
```

```sh
deck post team --title 'Review the release' --text 'Please review.' \
  --embed summary.json --components buttons.json --no-persona
```

A button's `custom_id` comes back in the component activity. deck acknowledges
it to Discord; your consumer decides what it means. Select menus also use raw
Discord component JSON. To send as a configured persona, pass `--persona NAME`.
A forum requiring tags needs one or more `--tag TAG` flags (name or ID) on `post`.

## Unknown send outcomes

If a send reports `outcome unknown` and exits 4, inspect Discord before repeating
it. The error prints a command with the send's original `--nonce`. Run that only
intentionally, with the original content, target and session. A repeated nonce is
deduplicated while the original send is in flight or its event is retained.
After retention expires, repeating it can duplicate the message. deck never
repeats a send automatically. A lost forum response can leave a real post whose
outcome the service cannot determine; repeating that send can create another post.

Copy the entire printed shell command, including any assignments before `deck`.
Those preserve line breaks and other control characters in the original content.
If a content flag read stdin, supply the same input again when repeating. A
post's nonce cannot be reused to post to a different channel, including while
its outcome is unknown. Keep the original bot qualification when repeating an
uncompleted post. An unresolved post from an older local store without a saved
channel must be checked in Discord before choosing a new nonce.

Each session command reports unread activity on stderr, or in `unread` with
`--json`. Use [reading](reading.md) to handle replies. `deck skill` prints the
embedded agent instructions. The [CLI specification](https://github.com/wyrd-company/deck/blob/main/docs/specifications/command-line-interface.yml)
defines every flag and output field; `deck post --help` and `deck reply --help`
are available without configuration.

The [API specification](https://github.com/wyrd-company/deck/blob/main/docs/specifications/grpc-api.yml) defines content limits,
nonce behavior and response fields. [Configuration](https://github.com/wyrd-company/deck/blob/main/docs/specifications/configuration.yml)
defines personas and bot grants.
