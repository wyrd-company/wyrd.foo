import { test } from "@playwright/test";
import { openPage } from "../support";

test("loads the home page", async ({ page, baseURL }) => {
  await openPage(page, baseURL, "/");
});
