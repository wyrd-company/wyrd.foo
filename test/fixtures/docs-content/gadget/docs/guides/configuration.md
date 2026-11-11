---
title: Configuration
product: gadget
---

gadget reads one file, `gadget.toml`, from the folder it starts in.

## The port

```toml
port = 8080
```

## The data folder

```toml
data = "./data"
```

### Keep data between runs

Mount the data folder when you run the image.

See <a href="../install.md#with-docker">Install</a> to run it with Docker, [Troubleshooting](troubleshooting.md) when it
does not start, and [the port](#the-port) above.
