// ---
// relationships:
//   implements: site
//   references: publishing
// ---
import type { McpInstallMethod } from "../schema/index.ts";

/** Guidance stays outside the copied, publisher-authored command or configuration. */
export const MCP_CLIENT_GUIDES: Partial<
  Record<McpInstallMethod, { text: string; url: string }>
> = {
  "claude-code": {
    text: "Run the add command in your terminal, or merge JSON configuration into your project's .mcp.json.",
    url: "https://code.claude.com/docs/en/mcp",
  },
  "claude-desktop": {
    text: "Open Settings → Developer → Edit Config and merge this into claude_desktop_config.json. Restart Claude Desktop.",
    url: "https://modelcontextprotocol.io/docs/develop/connect-local-servers",
  },
  codex: {
    text: "Merge TOML configuration into ~/.codex/config.toml, or run an authored codex mcp add command in your terminal.",
    url: "https://developers.openai.com/codex/mcp",
  },
  cursor: {
    text: "Merge this configuration into .cursor/mcp.json in your project, or ~/.cursor/mcp.json for all projects.",
    url: "https://cursor.com/docs/context/mcp",
  },
  opencode: {
    text: "Merge this configuration into your project's opencode.json under the mcp key.",
    url: "https://opencode.ai/docs/mcp-servers/",
  },
  pi: {
    text: "Merge this configuration into ~/.pi/agent/mcp.json, or .pi/mcp.json in a trusted project. Run /reload in an active session.",
    url: "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md",
  },
  antigravity: {
    text: "Open MCP Servers → Manage MCP Servers → View raw config and merge this into mcp_config.json.",
    url: "https://antigravity.google/docs/mcp",
  },
};
