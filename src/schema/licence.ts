// ---
// relationships:
//   implements: publishing
// ---
import { z } from "zod";
import parse from "spdx-expression-parse";

/** SPDX expressions with listed licence and exception identifiers only. */
export const licenceSchema = z.string().trim().refine((value) => {
  try {
    const tree = parse(value);
    const listed = (node: ReturnType<typeof parse>): boolean =>
      "license" in node ? !node.license.startsWith("LicenseRef-") && !node.license.startsWith("DocumentRef-") : listed(node.left) && listed(node.right);
    return listed(tree);
  } catch {
    return false;
  }
}, "must be an SPDX expression with listed licence identifiers");
