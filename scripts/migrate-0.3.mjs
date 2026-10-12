// One-off conversion of a v0.2 backup to v0.3, run outside the app (the app doesn't carry this code).
// Usage: node scripts/migrate-0.3.mjs backup.json [out.json]   (default out: backup-0.3.json beside it)
// Photos (`mediaFiles`) pass through untouched. Prints what it changed and anything to check by hand;
// check the result with `npm run validate out.json` before using "Replace the shared tree with a backup".
// Uses the app's own model code for sources and places (Node 24 runs the TypeScript as it is).
import { readFileSync, writeFileSync } from "node:fs";
import { cite, pruneSources, sourceFromText } from "../src/lib/model/sources.ts";
import { prunePlaces } from "../src/lib/model/places.ts";

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

  // Free-text sources join the notes; Wikidata ids and links become shared sources, cited by each person.
  sources(d) {
    const changed = [], check = [];
    const OLD_TYPES = { oral: "memory", certificate: "record", "parish-register": "record", census: "record", will: "record",
      military: "record", newspaper: "book", book: "book", photograph: "papers", "family-document": "papers", website: "web" };
    const older = [];
    for (const s of d.sources ?? []) {
      older.push([s.id, `Older source "${s.title}" kept as ${OLD_TYPES[s.type] ?? "other"}${s.repository || s.reference || s.reliability || s.notes ? "; its repository, reference, reliability and notes are dropped" : ""}`]);
      for (const k of ["repository", "reference", "reliability", "notes"]) delete s[k];
      s.type = OLD_TYPES[s.type] ?? "other";
    }
    // Older citations on a name, date or link stay where they are, but the app only shows a person's own sources.
    const walk = (o, where) => {
      if (Array.isArray(o)) return o.forEach(x => walk(x, where));
      if (!o || typeof o !== "object") return;
      if (typeof o.sourceId === "string") {
        if (o.note) {
          o.detail = [o.detail, o.note].filter(Boolean).join("; ");
          delete o.note;
        }
        check.push(`${where}: a source cited on one fact; the app won't show it (add it to the person if it matters)`);
      }
      Object.values(o).forEach(v => walk(v, where));
    };
    for (const p of d.people) for (const n of p.names ?? []) walk(n, `${p.knownAs || nameText(p.names[0]) || p.id}, a name`);
    for (const e of d.events) walk(e, `event ${e.id}`);
    for (const f of d.families) walk(f, `family ${f.id}`);
    const before = d.sources.length;
    for (const p of d.people) {
      const label = p.knownAs || nameText(p.names?.[0]) || p.id;
      if (p.sourceNotes?.trim()) {
        p.notes = p.notes?.trim() ? `${p.notes.trimEnd()}\n\n${p.sourceNotes.trim()}` : p.sourceNotes.trim();
        changed.push(`${label}: sources text moved to notes`);
      }
      delete p.sourceNotes;
      const links = p.links ?? {};
      if (links.wikidata) cite(d, p.id, sourceFromText(links.wikidata));
      for (const u of links.urls ?? []) {
        const s = sourceFromText(u.url);
        if (s.type === "memory") check.push(`${label}: "${u.url}" isn't a web address; kept as a source titled "${u.label || u.url}"`);
        const same = s.type !== "memory" && d.sources.find(x => x.url === s.url);
        if (same && u.label?.trim() && u.label.trim() !== same.title) check.push(`${label}: link "${u.label.trim()}" is the same page as "${same.title}", so it shares that source and title`);
        cite(d, p.id, u.label?.trim() ? { ...s, title: u.label.trim(), ...(s.type === "memory" ? { url: undefined } : {}) } : s);
      }
      const other = Object.keys(links).filter(k => !["wikidata", "urls"].includes(k));
      if (other.length) check.push(`${label}: links (${other.join(", ")}) dropped`);
      delete p.links;
    }
    pruneSources(d);
    for (const [id, note] of older) check.push(d.sources.some(s => s.id === id) ? note : note.replace(/ kept as \w+.*/, " removed: no one cites it"));
    const shared = d.sources.map(s => d.people.filter(p => p.citations?.some(c => c.sourceId === s.id)).length);
    changed.push(`${d.sources.length - before} sources made from links (${d.sources.length} in all), ${shared.filter(n => n > 1).length} shared by more than one person`);
    return { changed, check };
  },

  // Places nothing uses any more are removed (the app now does this as you edit).
  places(d) {
    const before = d.places.map(p => p.name);
    prunePlaces(d);
    const kept = new Set(d.places.map(p => p.name));
    const gone = before.filter(n => !kept.has(n));
    return { changed: gone.length ? [`removed ${gone.length} unused: ${gone.join(", ")}`] : [], check: [] };
  },
};

const [from, to = from.replace(/(\.json)?$/, "-0.3.json")] = process.argv.slice(2);
if (!from) {
  console.error("Usage: node scripts/migrate-0.3.mjs backup.json [out.json]");
  process.exit(1);
}
const d = JSON.parse(readFileSync(from, "utf8"));
d.sources ??= [];
d.places ??= [];
d.events ??= [];
d.families ??= [];
if (d.schemaVersion !== "0.2") {
  console.error(`Expected a v0.2 backup, found ${d.schemaVersion ?? "no version"}.`);
  process.exit(1);
}
const photos = d.mediaFiles ?? {}, missing = (d.media ?? []).filter(m => !photos[m.id]);
console.log(`${(d.media ?? []).length - missing.length} of ${(d.media ?? []).length} photos in the file`);
if (missing.length) console.log(`  Missing (they'd be lost on replacing the shared tree): ${missing.map(m => m.id).join(", ")}`);
for (const [step, run] of Object.entries(steps)) {
  const { changed, check } = run(d);
  console.log(`\n${step}: ${changed.length} change(s)`);
  changed.forEach(c => console.log("  " + c));
  if (check.length) console.log(`  To check by hand:\n${check.map(c => "    " + c).join("\n")}`);
}
d.schemaVersion = "0.3";
writeFileSync(to, JSON.stringify(d, null, 2));
console.log(`\nWrote ${to}`);
