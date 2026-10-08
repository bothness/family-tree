// Validate a family tree dataset and print a research-gaps report.
// Usage: node validate.mjs [data.json]   (needs: npm i ajv ajv-formats)
import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(readFileSync(new URL("../schema/family-tree.schema.json", import.meta.url)));
const data = JSON.parse(readFileSync(process.argv[2] ?? new URL("../src/lib/data/example-data.json", import.meta.url)));

// 1. Structural validation
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(data)) {
  console.error("Schema errors:");
  for (const e of validate.errors) console.error(`  ${e.instancePath || "/"} ${e.message}`);
  process.exit(1);
}
console.log("✔ Schema valid");

// 2. Referential integrity (JSON Schema can't check cross-references)
const ids = {
  per: new Set(data.people.map(p => p.id)),
  fam: new Set(data.families.map(f => f.id)),
  plc: new Set((data.places ?? []).map(p => p.id)),
  src: new Set((data.sources ?? []).map(s => s.id)),
};
const broken = [];
const walk = (node, path) => {
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && /^(personId|root|familyId|placeId|parentId|sourceId)$/.test(k)) {
        const prefix = v.split("_")[0];
        if (ids[prefix] && !ids[prefix].has(v)) broken.push(`${path}.${k} → ${v}`);
      }
      walk(v, `${path}.${k}`);
    }
  }
};
walk(data, "");
if (broken.length) { console.error("Broken references:\n  " + broken.join("\n  ")); process.exit(1); }
console.log("✔ All references resolve");

// 3. Connected components (separate, not-yet-joined branches)
const adj = new Map([...ids.per].map(id => [id, new Set()]));
const link = (a, b) => { adj.get(a)?.add(b); adj.get(b)?.add(a); };
for (const f of data.families) {
  const members = [...(f.partners ?? []), ...(f.children ?? [])].map(m => m.personId);
  members.forEach(a => members.forEach(b => a !== b && link(a, b)));
}
const seen = new Set(); const components = [];
for (const id of ids.per) {
  if (seen.has(id)) continue;
  const stack = [id], comp = [];
  while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); comp.push(n); stack.push(...adj.get(n)); }
  components.push(comp);
}
console.log(`✔ ${components.length} separate branch(es): ` +
  components.map(c => `[${c.length} people]`).join(" "));

// 4. Gaps report
const nameOf = id => {
  const p = data.people.find(x => x.id === id);
  const n = p?.names?.find(n => n.preferred) ?? p?.names?.[0];
  return n?.display ?? [n?.given, n?.surname].filter(Boolean).join(" ") ?? id;
};
const gaps = [];
for (const p of data.people) {
  if (p.placeholder) gaps.push(`${nameOf(p.id)}: placeholder – identity unknown`);
  if (!p.placeholder) p.names?.filter(n => n.status === "guess").forEach(n =>
    gaps.push(`${nameOf(p.id)}: ${n.type ?? "birth"} name is a guess`));
  const hasBirth = data.events.some(e => ["birth", "baptism"].includes(e.type) &&
    e.participants.some(x => x.personId === p.id && (x.role ?? "principal") === "principal"));
  if (!p.placeholder && !hasBirth) gaps.push(`${nameOf(p.id)}: no birth or baptism event`);
  p.research?.todo?.forEach(t => gaps.push(`${nameOf(p.id)}: TODO ${t}`));
}
for (const f of data.families) {
  const label = (f.partners ?? []).map(x => nameOf(x.personId)).join(" & ") || f.id;
  if ((f.partners?.length ?? 0) < 2) gaps.push(`${label}: only ${f.partners?.length ?? 0} partner(s) known`);
  if (f.childrenComplete !== "yes") {
    const have = f.children?.length ?? 0, min = f.expectedChildren?.min;
    gaps.push(`${label}: children list ${f.childrenComplete ?? "unknown"}` +
      (min > have ? ` – ${min - have} more expected` : ""));
  }
  f.children?.filter(c => c.status === "guess").forEach(c =>
    gaps.push(`${label}: parentage of ${nameOf(c.personId)} is a guess`));
}
for (const e of data.events) {
  if (e.date?.status === "guess")
    gaps.push(`${e.type} of ${nameOf(e.participants[0].personId)}: date is a guess (${e.date.edtf})`);
  if (e.status !== "confirmed" && !e.citations?.length && e.date?.status !== "confirmed")
    gaps.push(`${e.type} of ${nameOf(e.participants[0].personId)}: no source cited`);
}
console.log(`\nResearch gaps (${gaps.length}):`);
gaps.forEach(g => console.log("  • " + g));
