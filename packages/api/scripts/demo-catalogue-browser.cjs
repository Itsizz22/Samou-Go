const { chromium } = require(
  process.env.SAMOU_PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.SAMOU_CHROMIUM_PATH
      ? { executablePath: process.env.SAMOU_CHROMIUM_PATH }
      : {}),
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  try {
    await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
    await page.getByRole("combobox").selectOption("e2e-test-zone-central");
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
    await page.getByRole("button", { name: "تصفح كضيف ⚡" }).click();
    await page.waitForTimeout(1000);
    console.log("PASS guest onboarding");
    await page.goto("http://localhost:5173/stores/e2e-test-store-restaurant", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("textbox", { name: /ابحث في قائمة/ }).fill("بيتزا");
    await page.getByRole("button", { name: /أضف بيتزا/ }).click();
    await page.getByRole("button", { name: "وسط", exact: true }).click();
    await page.getByRole("button", { name: /كبير/ }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "وسط", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page
        .getByRole("button", { name: /كبير/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: /جبنة إضافية/ }).click();
    await page.getByRole("button", { name: /زيتون/ }).click();
    console.log("PASS switch single choice and select multiple extras");
    await page.screenshot({
      path: require("node:os").tmpdir() + "/samou-pizza-options.png",
    });
    await page.getByRole("button", { name: /أضف إلى السلة/ }).click();
    await page.goto("http://localhost:5173/cart", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: "إتمام الطلب", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    console.log("PASS guest checkout gate");
    await page.getByRole("button", { name: "لدي حساب بالفعل" }).click();
    await page.getByLabel("رقم الهاتف", { exact: true }).fill("0599000007");
    await page.getByLabel("كلمة المرور", { exact: true }).fill("Password123!");
    await page.getByRole("button", { name: "تسجيل الدخول والمتابعة" }).click();
    await page.waitForURL("**/checkout");
    console.log("PASS login resumes checkout");
    await page.waitForTimeout(1200);
    await page.goto("http://localhost:5173/stores/e2e-test-store-restaurant", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("textbox", { name: /ابحث في قائمة/ }).fill("بيتزا");
    await page.waitForTimeout(1000);
    const imgs = await page
      .locator('img[src*="/uploads/"]')
      .evaluateAll((imgs) =>
        imgs.map((i) => ({
          src: i.src,
          loaded: i.complete && i.naturalWidth > 0,
        })),
      );
    assert(imgs.length > 0 && imgs.every((i) => i.loaded));
    console.log("PASS demo images decoded", imgs.length);
    await page.setViewportSize({ width: 320, height: 740 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log("PASS 320px no horizontal overflow");
    await page.screenshot({
      path: require("node:os").tmpdir() + "/samou-demo-store.png",
    });
    for (const route of [
      "/home",
      "/search",
      "/orders",
      "/profile",
      "/settings",
      "/offers",
      "/favorites",
      "/support",
    ]) {
      await page.goto("http://localhost:5173" + route, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(700);
      assert((await page.locator("body").innerText()).length > 20);
      console.log("PASS renders", route);
    }
    console.log("ERRORS", errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
