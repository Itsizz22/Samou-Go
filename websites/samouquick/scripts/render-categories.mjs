import fs from "node:fs";
const root = new URL("../", import.meta.url);
const data = JSON.parse(
  fs.readFileSync(new URL("content/categories.json", root), "utf8"),
);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  meal: "M5 3v7m3-7v7M3 7h7v3a3 3 0 0 1-6 0V3m3 10v8m10-18v18m0-18c-5 3-5 10 0 10",
  cup: "M4 7h12v8a6 6 0 0 1-12 0V7Zm12 1h2a3 3 0 0 1 0 6h-2M6 2v2m4-2v2m4-2v2",
  cake: "M3 13h18v8H3v-8Zm0 4c3-3 3 3 6 0s3 3 6 0 3 3 6 0M6 13V9h12v4M9 9V6m6 3V6m-3 3V4",
  bag: "M4 7h16l1 14H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2m-8 4a4 4 0 0 0 8 0",
  drink: "M6 7h12l-2 14H8L6 7Zm0 4h12M12 7l2-5h5",
  burger:
    "M3 10a9 9 0 0 1 18 0H3Zm0 4h18M3 18h18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1ZM9 6h.01M14 5h.01",
};
const cards = data
  .map(
    (c) =>
      `<details class="category-card" id="category-${escape(c.id)}"><summary><span class="category-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[c.icon]}"/></svg></span><strong>${escape(c.name)}</strong><span>${escape(c.summary)}</span><span class="category-plus" aria-hidden="true">+</span></summary><div class="category-body"><p>${escape(c.description)}</p>${c.stores.length ? "<ul>" + c.stores.map((s) => "<li>" + escape(s.name) + "</li>").join("") + "</ul>" : ""}<a class="text-link" href="#download">استكشف المتاجر في التطبيق ←</a></div></details>`,
  )
  .join("\n");
const file = new URL("index.html", root);
const html = fs.readFileSync(file, "utf8");
fs.writeFileSync(
  file,
  html.replace(
    /<!-- CATEGORIES:START -->[\s\S]*?<!-- CATEGORIES:END -->/,
    "<!-- CATEGORIES:START -->\n" + cards + "\n<!-- CATEGORIES:END -->",
  ),
);
