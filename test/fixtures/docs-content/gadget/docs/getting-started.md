---
title: Getting started
product: gadget
---

gadget runs a sample service on your machine. This page takes you from nothing to a running service in a few minutes.

## Before you start

You need a Linux machine or Docker. Check that Docker runs:

```sh
docker version
```

> **Tip:** if you only want to look around, the Docker image needs no install.

## Start the service

Run the image. It listens on port 8080:

```sh
docker run --rm -it -p 8080:8080 ghcr.io/example-org/gadget
```

### Check that it runs

Open `http://localhost:8080`. The page shows the sample console.

### Stop the service

Press `Ctrl+C` in the terminal that runs it.

## Next steps

| To do this | Read |
| --- | --- |
| Install it for good | [Install](install.md) |
| Change the port | [The port](guides/configuration.md#the-port) |
| Fix a problem | [Troubleshooting](troubleshooting) |
| See what changed | [Docs changelog](CHANGELOG.md) |
| Watch the console | [Demo](assets/demo.gif) |
| Read the code | [Source](https://github.com/example-org/gadgets) |
| Find a missing page | [Missing](missing.md) |
