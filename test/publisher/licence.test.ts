// ---
// relationships:
//   validates: publishing
// ---
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mit from "spdx-license-list/licenses/MIT.json" with { type: "json" };
import apache from "spdx-license-list/licenses/Apache-2.0.json" with { type: "json" };
import { repoLicence } from "../../publisher/licence.ts";
import { Findings } from "../../publisher/report.ts";

async function detect(source?: string) {
  const findings = new Findings(true);
  const licence = await repoLicence({ list: async () => ["LICENSES/MIT.txt"], read: async (path) => path === "LICENSE" && source !== undefined ? new TextEncoder().encode(source) : undefined }, findings);
  return { licence, findings: findings.list };
}

describe("repository licence", () => {
  it("matches complete MIT and Apache texts with wrapped lines and variable copyright", async () => {
    for (const [id, text] of [["MIT", mit.licenseText], ["Apache-2.0", apache.licenseText]]) {
      const result = await detect(text.replace(/^Copyright[^\n]*/gm, "Copyright (c) 2026 Example contributors").replaceAll("\n", "\r\n"));
      assert.equal(result.licence, id);
      assert.deepEqual(result.findings, []);
    }
  });
  it("uses an explicit compound expression without inferring AND or OR from LICENSES", async () => {
    assert.equal((await detect("SPDX-License-Identifier: MIT OR Apache-2.0\nSee LICENSES/ for texts.")).licence, "MIT OR Apache-2.0");
    assert.equal((await detect("SPDX-License-Identifier: GPL-2.0-only WITH Classpath-exception-2.0")).licence, "GPL-2.0-only WITH Classpath-exception-2.0");
  });
  it("warns and omits missing, unknown, modified, invalid and ambiguous licences even in strict mode", async () => {
    for (const source of [undefined, "MIT", "Custom terms", mit.licenseText + "\nAdditional restrictions apply.", mit.licenseText + apache.licenseText,
      "SPDX-License-Identifier: No-Such-License", "SPDX-License-Identifier: MIT\nSPDX-License-Identifier: Apache-2.0"]) {
      const result = await detect(source);
      assert.equal(result.licence, undefined);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].severity, "warning");
      assert.equal(result.findings[0].file, "LICENSE");
    }
  });
});
