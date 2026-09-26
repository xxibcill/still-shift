import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { format } from "prettier";
import { prepareCommerceFile } from "../packages/animation-engine/src/commerce-preparation.ts";

const root = resolve("benchmarks/fixtures/ecommerce-motion");
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 800, height: 1000 },
  });
  for (const sample of ["sample-one", "sample-two"]) {
    const svg = await readFile(
      "assets/ecommerce-motion/" + sample + ".svg",
      "utf8",
    );
    await page.setContent(
      '<body style="margin:0;background:transparent">' + svg + "</body>",
    );
    await page.locator("svg").screenshot({
      path: "assets/ecommerce-motion/" + sample + ".png",
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}
const entries: {
  id: string;
  title: string;
  registration?: {
    status: "production" | "experimental";
    id?: string;
    version?: string;
  };
}[] = [];
for (const profile of ["landscape", "portrait", "square", "feed"]) {
  for (const preset of ["H03", "H01", "H04", "A01"]) {
    const id = preset.toLowerCase() + "-" + profile;
    const callouts = preset === "H04" || preset === "A01";
    const brief = {
      schemaVersion: "commerce-brief-1",
      catalogVersion: "1.0",
      selection: { kind: preset === "A01" ? "recipe" : "format", id: preset },
      title: preset + " / " + profile + " / illustrated fixture",
      locale: "en",
      product: {
        id: "sample-one",
        name: "STUDIO SAMPLE 01",
        imagePath: "../../../assets/ecommerce-motion/sample-one.png",
        preparation: "cutout",
        provenance:
          "Original procedural illustration; fictional studio sample, not a real product.",
        protectedRegion: [0.365, 0.37, 0.28, 0.26],
      },
      copy: {
        headlines: ["A small\ndaily ritual."],
        cta: "Explore the collection",
        source: "Synthetic fixture copy; no product claims.",
        callouts: callouts
          ? [
              {
                text: "Illustrated cap",
                target: [0.5, 0.17],
                source: "Visible cap in original fixture.",
              },
              {
                text: "Sample container",
                target: [0.32, 0.77],
                source: "Visible original fixture outline.",
              },
            ]
          : [],
      },
      profile,
      fps: 30,
      frameCount: preset === "A01" ? 300 : 240,
    };
    await writeFile(
      resolve(root, id + ".brief.json"),
      JSON.stringify(brief, null, 2) + "\n",
    );
    const output = resolve(root, id + ".json");
    await rm(output, { force: true });
    await prepareCommerceFile(resolve(root, id + ".brief.json"), output);
    entries.push({ id, title: brief.title });
  }
}
const second = JSON.parse(
  await readFile(resolve(root, "h03-portrait.brief.json"), "utf8"),
);
second.title = "H03 / Thai / second illustrated fixture";
second.locale = "th";
second.product.id = "sample-two";
second.product.name = "STUDIO SAMPLE 02";
second.product.imagePath = "../../../assets/ecommerce-motion/sample-two.png";
second.copy.headlines = ["เรียบง่าย\nในทุกวัน"];
second.copy.cta = "ค้นพบคอลเลกชัน";
second.fps = 24;
second.frameCount = 192;
await writeFile(
  resolve(root, "h03-thai.brief.json"),
  JSON.stringify(second, null, 2) + "\n",
);
await rm(resolve(root, "h03-thai.json"), { force: true });
await prepareCommerceFile(
  resolve(root, "h03-thai.brief.json"),
  resolve(root, "h03-thai.json"),
);
entries.push({ id: "h03-thai", title: second.title });
for (const preset of ["H03", "H01", "H04", "A01"]) {
  const id = preset.toLowerCase() + "-beauty-feed";
  const briefPath = resolve(root, id + ".brief.json");
  const output = resolve(root, id + ".json");
  await rm(output, { force: true });
  await prepareCommerceFile(briefPath, output);
  const brief = JSON.parse(await readFile(briefPath, "utf8"));
  entries.push({ id, title: brief.title });
}

for (const entry of entries) {
  const scene = JSON.parse(
    await readFile(resolve(root, entry.id + ".json"), "utf8"),
  );
  entry.registration = scene.metadata.registration;
}

await writeFile(
  resolve(root, "catalog.json"),
  JSON.stringify(entries, null, 2) + "\n",
);
for (const entry of entries) {
  for (const suffix of [".json", ".brief.json"]) {
    const path = resolve(root, entry.id + suffix);
    await writeFile(
      path,
      await format(await readFile(path, "utf8"), {
        parser: "json",
        printWidth: 80,
      }),
    );
  }
}
console.log("Prepared " + entries.length + " commerce fixtures.");
