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
  it("matches complete MIT and Apache texts with wrapping and numeric year variations", async () => {
    for (const [id, text] of [["MIT", mit.licenseText], ["Apache-2.0", apache.licenseText]]) {
      for (const year of [undefined, "2026", "2020-2026", "2020–2026", "2020, 2022-2026"]) {
        const source = year === undefined ? text : text.replace(id === "MIT" ? "<year>" : "[yyyy]", year);
        for (const wrapped of [source, source.replaceAll("\n", "\r\n"), source.replace(/\s+/g, " ")]) {
          const result = await detect(wrapped);
          assert.equal(result.licence, id);
          assert.deepEqual(result.findings, []);
        }
      }
    }
  });
  for (const [id, text] of [["MIT", mit.licenseText], ["Apache-2.0", apache.licenseText]]) {
    it(`preserves added conditions at every boundary in ${id}`, async () => {
      const restriction = "Copyright holders prohibit commercial use of this software.";
      const notice = text.match(/^Copyright[^\n]*/m)![0];
      const variants = [
        `${text}\n${restriction}\n`, // reviewer's first reproducer
        text.replace(notice, `${notice} Commercial use is prohibited.`), // second reproducer
        `${restriction}\n${text}`,
        text.replace(notice, `${restriction}\n${notice}`),
        text.replace(notice, `${notice}\n${restriction}`),
        text.replace(notice, `${notice}\nCopyright (c) 2026 Commercial use is prohibited`),
        text.replace(notice, `${notice} Commercial use is prohibited`),
        text.replace(notice, `${notice} No Commercial Use`),
        text.replace(notice, "Copyright (c) 2026 Example contributors No Commercial Use"),
        text.replace(notice, "Copyright (c) 2026 Commercial Use Is Prohibited"),
        text.replace(notice, "Copyright (c) 2026 Example contributors Commercial use is prohibited."),
        text.replace("Copyright", "Copyright holders prohibit commercial use. Copyright"),
        text.replace(notice, ""),
        text.replace(/software/i, "$& subject to additional conditions"),
        text + "\n" + text,
      ];
      // Probe each line boundary, including inside the body and appendix.
      const lines = text.split("\n");
      for (let index = 0; index <= lines.length; index++) {
        variants.push([...lines.slice(0, index), restriction, ...lines.slice(index)].join("\n"));
      }
      for (const body of variants) {
        for (const source of [body, `SPDX-License-Identifier: ${id}\n${body}`]) {
          const result = await detect(source);
          assert.equal(result.licence, undefined, source);
          assert.equal(result.findings.length, 1);
          assert.equal(result.findings[0].severity, "warning");
          assert.equal(result.findings[0].file, "LICENSE");
        }
      }
    });
  }
  it("accepts the reviewer's ordinary completed copyright notices", async () => {
    for (const [id, text, year, holder] of [
      ["MIT", mit.licenseText, "<year>", "<copyright holders>"],
      ["Apache-2.0", apache.licenseText, "[yyyy]", "[name of copyright owner]"],
    ]) {
      for (const name of ["Example contributors", "Example Foundation", "Alex Smith"]) {
        const source = text.replace(year, "2026").replace(holder, name);
        for (const declaration of ["", `SPDX-License-Identifier: ${id}\n`]) {
          const result = await detect(declaration + source);
          assert.equal(result.licence, id);
          assert.deepEqual(result.findings, []);
        }
      }
    }
  });
  it("checks declared licences against all accompanying terms", async () => {
    for (const [id, text, other] of [["MIT", mit.licenseText, "Apache-2.0"], ["Apache-2.0", apache.licenseText, "MIT"]]) {
      const notice = text.match(/^Copyright[^\n]*/m)![0];
      const variants = [
        `SPDX-License-Identifier: ${id}\n${text}\nCommercial use is prohibited.`,
        `SPDX-License-Identifier: ${other}\n${text}`,
        `SPDX-License-Identifier: ${id} OR ${other}\n${text}`,
        `SPDX-License-Identifier: ${id} WITH Classpath-exception-2.0\n${text}`,
        `SPDX-License-Identifier: ${id}\n${text.replace(notice, notice + " No Commercial Use")}`,
        `SPDX-License-Identifier: ${id}\n${text.replace(/software/i, "$& subject to additional conditions")}`,
        `${text}\nSPDX-License-Identifier: ${id}\nCommercial use is prohibited.`,
        `SPDX-License-Identifier: ${id}\nSee LICENSES/ for texts.\nCommercial use is prohibited.`,
        `SPDX-License-Identifier:\n${id}`,
      ];
      for (const source of variants) {
        const result = await detect(source);
        assert.equal(result.licence, undefined, source);
        assert.equal(result.findings.length, 1);
        assert.equal(result.findings[0].severity, "warning");
      }
    }
  });
  it("keeps declaration-only expressions and matching bodies at line boundaries", async () => {
    for (const source of ["SPDX-License-Identifier: MIT", "SPDX-License-Identifier: MIT\nSPDX-License-Identifier: MIT", `  SPDX-License-Identifier: MIT\r\n${mit.licenseText}`, `${mit.licenseText}\nSPDX-License-Identifier: MIT`]) {
      assert.equal((await detect(source)).licence, "MIT");
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
