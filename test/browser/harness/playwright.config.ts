/*
 * The config of the harness tests' inner runs: the real harness config with
 * the port, the server command and the spec that the outer test chooses.
 */
import { harnessConfig } from "../config";

export default harnessConfig({
  port: Number(process.env.INNER_PORT),
  command: process.env.INNER_COMMAND,
  homePort: process.env.INNER_HOME_PORT ? Number(process.env.INNER_HOME_PORT) : undefined,
  homeCommand: process.env.INNER_HOME_COMMAND,
  testMatch: `**/${process.env.INNER_SPEC}.inner.ts`,
});
