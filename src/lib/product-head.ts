/* What the shared head reads from a product: its key, name, logo, favicon and social image, as URLs. */
import type { ToolFile } from "../schema/tool-file.ts";
import type { HeadProduct } from "./head.ts";
import { productAssetUrl } from "./product-assets.ts";

export function productHead(key: string, tool: ToolFile): HeadProduct & { key: string } {
  const asset = (path: string | undefined) => (path === undefined ? undefined : productAssetUrl(key, path));
  return {
    key,
    name: tool.name,
    logo: asset(tool.logo),
    favicon: asset("favicon" in tool ? tool.favicon : undefined),
    socialImage: asset("social-image" in tool ? tool["social-image"] : undefined),
  };
}
