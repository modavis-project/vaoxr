import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const vaoIndex = JSON.parse(readFileSync(new URL("../../content/vao-index.json", import.meta.url), "utf8"));

test("shell navigation exposes every product route", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("heading", { name: /the cuntz positive organ/i })).toBeVisible();
  for (const [path, heading] of [["/view", "View the organ"], ["/room", "Hear the room"], ["/play", "Play the organ"], ["/ar", "Place the organ"]] as const) {
    await page.goto(path); await expect(page).toHaveURL(new RegExp(`${path}$`)); await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("VAO release records and both carriers are published", async ({ page, request }) => {
  await page.goto("/standard");
  await expect(page.getByRole("heading", { name: "About the VAO standard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /how the manifest drives each view/i })).toBeVisible();
  await expect(page.getByText(/byte size and SHA-256 are checked/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Read the VAO 0.5.0 specification/i })).toHaveAttribute("href", /github\.com\/modavis-project\/vao-standard\/tree\/v0\.5\.0/);
  const manifest = await request.get("/vao/releases/0.5.0-2/vao-manifest.json");
  expect(manifest.ok()).toBe(true);
  const manifestBytes = await manifest.body();
  expect(manifestBytes.length).toBe(vaoIndex.manifest.byteSize);
  expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(vaoIndex.manifest.sha256);
  expect((await manifest.json()).formatVersion).toBe("0.5.0");
  const bootstrap = await request.get("/vao/releases/0.5.0-2/positivxr-bootstrap-0.5.0.vao");
  expect(bootstrap.ok()).toBe(true);
  expect(bootstrap.headers()["content-type"]).toContain("application/vnd.modavis.vao+zip");
  expect(bootstrap.headers()["cache-control"]).toContain("immutable");
  expect(bootstrap.headers()["x-content-type-options"]).toBe("nosniff");
});

test("home and room do not request 3D, tracker, or stop packs", async ({ page }) => {
  const requests: string[] = []; page.on("request", (request) => requests.push(request.url()));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  expect(requests.some((url) => /organ\.glb|mindar|audio\/stops/.test(url))).toBe(false);
  requests.length = 0; await page.goto("/room"); await page.waitForLoadState("networkidle");
  expect(requests.some((url) => /organ\.glb|mindar|audio\/stops/.test(url))).toBe(false);
});

test("player is gesture gated and defaults to Gedackt", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("button", { name: "Activate audio" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Gedackt 8/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-midi]")).toHaveCount(45);
});

test("room points select exclusively and expose progress", async ({ page }) => {
  await page.goto("/room"); await expect(page.getByRole("button", { name: /Play Main hall/ })).toBeVisible();
  await page.getByRole("button", { name: /Play Main hall/ }).click();
  await page.getByRole("button", { name: /Player position/ }).last().click();
  await expect(page.getByRole("heading", { name: "Player position" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Recording position" })).toBeVisible();
});

test("mobile AR is markerless and links to the dedicated Quest route", async ({ page, browserName }) => {
  await page.goto("/ar");
  await expect(page.locator("model-viewer")).toHaveAttribute("src", /\/media\/models\/organ-ar\.glb\?v=[a-f0-9]+&sound=/);
  await expect(page.locator("model-viewer")).toHaveAttribute("ios-src", /\/media\/models\/organ-ar\.usdz\?v=[a-f0-9]+/);
  await expect(page.locator("model-viewer")).toHaveAttribute("autoplay", "");
  if (browserName === "firefox") {
    await expect(page.getByText(/room placement is not available reliably in Firefox/i)).toBeVisible();
  } else {
    // model-viewer hides this slot when the host cannot activate native AR.
    await expect(page.locator('model-viewer button[slot="ar-button"]')).toBeAttached();
  }
  await expect(page.getByText("Place it—no marker required.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Using Meta Quest 3/ })).toHaveAttribute("href", "/ar/quest");
  await expect(page.getByRole("link", { name: /Open the 3D view/ })).toHaveAttribute("href", "/view");
});

test("Firefox keeps the 3D preview and recommends a supported browser for room placement", async ({ page, browserName }) => {
  test.skip(browserName !== "firefox");
  await page.goto("/ar");
  await expect(page.locator("model-viewer")).toHaveAttribute("src", /organ-ar\.glb/);
  await page.waitForFunction(() => {
    const model = document.querySelector("model-viewer") as HTMLElement & { availableAnimations?: string[] };
    return model?.availableAnimations?.includes("Pachelbel performance");
  });
  await expect(page.getByText(/room placement is not available reliably in Firefox/i)).toBeVisible();
});

test("the baked moving-key performance advances in the mobile preview", async ({ page, browserName }) => {
  test.skip(browserName === "firefox");
  await page.goto("/ar");
  await page.waitForFunction(() => {
    const model = document.querySelector("model-viewer") as HTMLElement & { availableAnimations?: string[] };
    return model?.availableAnimations?.includes("Pachelbel performance");
  });
  // Sample in the rendering context: host-side delays can span the clip's loop.
  const advanced = await page.evaluate(async () => {
    const model = document.querySelector("model-viewer") as HTMLElement & { currentTime: number; duration: number; paused: boolean };
    const initialTime = model.currentTime;
    const started = performance.now();
    return new Promise<boolean>((resolve) => {
      const sample = () => {
        const elapsed = (model.currentTime - initialTime + model.duration) % model.duration;
        if (!model.paused && elapsed > 0.25) resolve(true);
        else if (performance.now() - started > 15_000) resolve(false);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  expect(advanced).toBe(true);
});

test("offline manager exposes five independent opt-in packs", async ({ page }) => {
  await page.goto("/offline"); await expect(page.getByRole("heading", { name: "Offline media" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Organ stop media packs" }).getByRole("button", { name: "Download" })).toHaveCount(5);
});

test("service worker installs and the shell remains available offline", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole("heading", { name: /the cuntz positive organ/i })).toBeVisible();
  await context.setOffline(false);
});

test("unsupported WebXR is a silent progressive fallback", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "xr", { configurable: true, value: undefined }); });
  await page.goto("/ar/quest");
  await expect(page.getByRole("button", { name: "Enter mixed reality" })).toHaveCount(0);
  await expect(page.getByText(/Immersive passthrough is unavailable/)).toBeVisible();
  await expect(page.getByRole("link", { name: /3D fallback/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mobile AR/ })).toHaveAttribute("href", "/ar");
});
