// Lists every file in each ATS job's "7 Reports" folder (and its subfolders), one readdir per folder.
const fs = require("fs/promises"), path = require("path");
const base = process.argv[2], out = process.argv[3];
const groups = ["2026 FALL", "Completed 2026 Fall Jobs", "Completed Spring 2026 Jobs", "2027 SPRING", "Interim QB Jobs", "Duplicates and Pending SOs"];
(async () => {
  const rows = [];
  const walk = async (dir, depth) => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      const p = path.join(dir, e.name);
      // Dirent types can come back unknown on network shares -- stat each one.
      const st = await fs.stat(p).catch(() => null);
      if (!st) continue;
      if (st.isDirectory()) { if (depth > 0) await walk(p, depth - 1); }
      else if (!/thumbs\.db$/i.test(e.name)) rows.push([p, st.size]);
    }
  };
  for (const g of groups) {
    const jobs = await fs.readdir(path.join(base, g), { withFileTypes: true }).catch(() => []);
    for (const j of jobs) await walk(path.join(base, g, j.name, "7 Reports"), 2);
  }
  await fs.writeFile(out, rows.map((r) => r.join("\t")).join("\n"));
  console.log("files:", rows.length);
})();
