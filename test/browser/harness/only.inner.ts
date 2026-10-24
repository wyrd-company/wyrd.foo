import { test } from "@playwright/test";

// A committed `.only` would run this test alone and skip the rest of the suite.
test.only("runs alone", () => {});
test("is skipped by the only above", () => {});
