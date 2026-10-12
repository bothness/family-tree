// One-off conversion of a v0.2 backup to v0.3, run outside the app (the app doesn't carry this code).
// Usage: node scripts/migrate-0.3.mjs backup.json [out.json]   (default out: backup-0.3.json beside it)
// Photos (`mediaFiles`) pass through untouched. Prints what it changed and anything to check by hand;
// check the result with `npm run validate out.json` before using "Replace the shared tree with a backup".
import { readFileSync, writeFileSync } from "node:fs";

const nameText = n => n?.display || [n?.given, n?.surname].filter(Boolean).join(" ");

/** Each step changes the data in place and returns notes: { changed: [...], check: [...] }. */
const steps = {
  // The main name is the first: the birth name. `preferred` now means "show on the tree instead".
  names(d) {
    const changed = [], check = [];
    for (const p of d.people) {
      const ns = p.names ?? [];
      if (!ns.length) continue;
      const shown = ns.find(n => n.preferred) ?? ns[0];
      const label = p.knownAs || nameText(shown) || p.id;
      const birth = ns.findIndex(n => n.type === "birth");
      if (birth > 0) {
        ns.unshift(...ns.splice(birth, 1));
        changed.push(`${label}: birth name ${nameText(ns[0])} moved first`);
      }
      // Before, `preferred` marked the main name (which was also shown); keep showing the same one.
      let kept = false;
      for (const n of ns) {
        if (!n.preferred) continue;
        if (n === ns[0] || kept) delete n.preferred;
        else kept = true;
      }
      if (!kept && shown !== ns[0]) {
        shown.preferred = true;
        changed.push(`${label}: ${nameText(shown)} kept on the tree`);
      }
      // A "known as" ending in a surname none of their names has may be a married name; the owner decides.
      const last = t => t?.trim().split(/\s+/).at(-1);
      const k = p.knownAs?.trim();
      if (k?.includes(" ") && !ns.some(n => last(n.surname) === last(k)))
        check.push(`${p.knownAs} (${nameText(ns[0])}): if this is a married name, add it as another name and tick "Show this name on the tree"`);
    }
    return { changed, check };
  },
};

const [from, to = from.replace(/(\.json)?$/, "-0.3.json")] = process.argv.slice(2);
if (!from) {
  console.error("Usage: node scripts/migrate-0.3.mjs backup.json [out.json]");
  process.exit(1);
}
const d = JSON.parse(readFileSync(from, "utf8"));
if (d.schemaVersion !== "0.2") {
  console.error(`Expected a v0.2 backup, found ${d.schemaVersion ?? "no version"}.`);
  process.exit(1);
}
for (const [step, run] of Object.entries(steps)) {
  const { changed, check } = run(d);
  console.log(`\n${step}: ${changed.length} change(s)`);
  changed.forEach(c => console.log("  " + c));
  if (check.length) console.log(`  To check by hand:\n${check.map(c => "    " + c).join("\n")}`);
}
d.schemaVersion = "0.3";
writeFileSync(to, JSON.stringify(d, null, 2));
console.log(`\nWrote ${to}`);
