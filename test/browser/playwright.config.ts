import { harnessConfig, runPort } from "./config";

export default harnessConfig({ port: await runPort() });
