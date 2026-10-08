// INTERIM tree layout, ported from the prototype. To be replaced in Phase C (see docs/ROADMAP.md).
// Known limitations: left-aligned; one connector level per generation, so half-sibling groups and
// sibling sets on both sides of a couple aren't clearly bracketed; lines can cross without hops.
import type { Dataset, Family, Status } from '../model/types.ts';
import { birthStart, childIds, famAsChild, partnerIds, sexRank } from '../model/queries.ts';

export const NODE_W = 156, NODE_H = 58, H_GAP = 18, V_GAP = 70, GHOST_W = 104, TOP = 34;

export interface NodeBox { id: string; x: number; y: number }
export interface GhostBox { familyId: string; x: number; y: number; missing: number | null }
export type LineStyle = 'solid' | 'likely' | 'guess' | 'ghost';
export interface Line { d: string; style: LineStyle }
export interface BranchLabel { text: string; x: number }
export interface TreeLayout { nodes: NodeBox[]; ghosts: GhostBox[]; lines: Line[]; labels: BranchLabel[]; width: number; height: number }

interface Unit { ids: string[]; g: number; ghost?: Family }

function generations(d: Dataset, comp: string[]): Record<string, number> {
	const gen: Record<string, number> = {},
		set = new Set(comp);
	gen[comp[0]] = 0;
	const q = [comp[0]];
	while (q.length) {
		const id = q.shift()!,
			g = gen[id];
		for (const f of d.families) {
			const ps = partnerIds(f).filter((x) => set.has(x)),
				cs = childIds(f).filter((x) => set.has(x));
			const visit = (o: string, v: number) => {
				if (gen[o] === undefined) {
					gen[o] = v;
					q.push(o);
				}
			};
			if (ps.includes(id)) {
				ps.forEach((o) => visit(o, g));
				cs.forEach((c) => visit(c, g + 1));
			}
			if (cs.includes(id)) {
				ps.forEach((o) => visit(o, g - 1));
				cs.forEach((c) => visit(c, g));
			}
		}
	}
	const min = Math.min(...comp.map((i) => gen[i] ?? 0));
	comp.forEach((i) => (gen[i] = (gen[i] ?? 0) - min));
	return gen;
}

function layoutComponent(d: Dataset, comp: string[], x0: number) {
	const gen = generations(d, comp),
		inC = new Set(comp),
		pos: Record<string, { x: number; y: number }> = {},
		ghosts: { f: Family; x: number; y: number }[] = [];
	const units: Unit[] = [],
		unitOf: Record<string, Unit> = {};
	for (const f of d.families) {
		const ps = partnerIds(f)
			.filter((id) => inC.has(id))
			.sort((a, b) => sexRank(d, a) - sexRank(d, b));
		if (ps.length === 2 && !unitOf[ps[0]] && !unitOf[ps[1]] && gen[ps[0]] === gen[ps[1]]) {
			const u = { ids: ps, g: gen[ps[0]] };
			units.push(u);
			ps.forEach((i) => (unitOf[i] = u));
		}
	}
	comp.forEach((id) => {
		if (!unitOf[id]) {
			const u = { ids: [id], g: gen[id] };
			units.push(u);
			unitOf[id] = u;
		}
	});
	for (const f of d.families) {
		if (f.childrenComplete !== 'no') continue;
		const ps = partnerIds(f).filter((id) => inC.has(id)),
			cs = childIds(f).filter((id) => inC.has(id));
		if (!ps.length && !cs.length) continue;
		units.push({ ids: [], ghost: f, g: cs.length ? gen[cs[0]] : gen[ps[0]] + 1 });
	}
	const unitWidth = (u: Unit) => (u.ghost ? GHOST_W : u.ids.length * NODE_W + (u.ids.length - 1) * H_GAP);
	const unitKey = (u: Unit, f?: Family) => {
		if (u.ghost) return 1e9;
		const kid = f ? u.ids.find((id) => childIds(f).includes(id)) : u.ids[0];
		return birthStart(d, kid ?? u.ids[0]);
	};
	const maxG = Math.max(...units.map((u) => u.g));
	let right = x0,
		bottom = 0;
	for (let g = 0; g <= maxG; g++) {
		const groups = new Map<string, { f?: Family; units: Unit[]; i: number; key: number; w: number }>();
		units
			.filter((u) => u.g === g)
			.forEach((u, i) => {
				const f = u.ghost ?? u.ids.map((id) => famAsChild(d, id)).find(Boolean);
				const k = f ? f.id : 'solo' + i;
				if (!groups.has(k)) groups.set(k, { f, units: [], i, key: 0, w: 0 });
				groups.get(k)!.units.push(u);
			});
		const gl = [...groups.values()];
		gl.forEach((gr) => {
			gr.units.sort((a, b) => unitKey(a, gr.f) - unitKey(b, gr.f));
			const pc = gr.f ? partnerIds(gr.f).map((id) => pos[id]).filter(Boolean) : [];
			gr.key = pc.length ? pc.reduce((a, p) => a + p.x + NODE_W / 2, 0) / pc.length : Infinity;
			gr.w = gr.units.reduce((a, u) => a + unitWidth(u), 0) + H_GAP * (gr.units.length - 1);
		});
		gl.sort((a, b) => a.key - b.key || a.i - b.i);
		let cur = x0;
		const y = TOP + g * (NODE_H + V_GAP);
		for (const gr of gl) {
			let x = isFinite(gr.key) ? Math.max(cur, gr.key - gr.w / 2) : cur;
			for (const u of gr.units) {
				if (u.ghost) {
					ghosts.push({ f: u.ghost, x, y });
					x += GHOST_W + H_GAP;
				} else
					u.ids.forEach((id) => {
						pos[id] = { x, y };
						x += NODE_W + H_GAP;
					});
			}
			cur = x;
			right = Math.max(right, x - H_GAP);
		}
		bottom = y + NODE_H;
	}
	return { pos, ghosts, right, bottom };
}

const styleOf = (st?: Status | ''): LineStyle => (st === 'guess' ? 'guess' : st === 'likely' ? 'likely' : 'solid');

export function layoutTree(d: Dataset, branches: { label: string; ids: string[] }[]): TreeLayout {
	const out: TreeLayout = { nodes: [], ghosts: [], lines: [], labels: [], width: 0, height: 0 };
	let x0 = 16;
	for (const b of branches) {
		const L = layoutComponent(d, b.ids, x0);
		if (branches.length > 1) out.labels.push({ text: b.label, x: x0 });
		for (const f of d.families) {
			const ps = partnerIds(f).filter((id) => L.pos[id]),
				cs = childIds(f).filter((id) => L.pos[id]);
			const gh = L.ghosts.find((g) => g.f === f);
			if (!ps.length && !cs.length) continue;
			let mx: number | null = null,
				my: number | null = null;
			if (ps.length === 2) {
				const [a, c] = ps.map((id) => L.pos[id]).sort((p, q) => p.x - q.x);
				const y = a.y + NODE_H / 2;
				const st = f.relationship?.status ?? (f.partners.some((x) => x.status === 'guess') ? 'guess' : '');
				out.lines.push({ d: `M${a.x + NODE_W} ${y}H${c.x}`, style: styleOf(st) });
				mx = (a.x + NODE_W + c.x) / 2;
				my = y;
			} else if (ps.length === 1) {
				const a = L.pos[ps[0]];
				mx = a.x + NODE_W / 2;
				my = a.y + NODE_H;
			}
			const targets = cs.map((id) => ({ x: L.pos[id].x + NODE_W / 2, y: L.pos[id].y, style: styleOf(f.children.find((c) => c.personId === id)!.status) }));
			if (gh) targets.push({ x: gh.x + GHOST_W / 2, y: gh.y, style: 'ghost' });
			if (!targets.length) continue;
			const busY = targets[0].y - 22;
			const xs = targets.map((v) => v.x).concat(mx != null ? [mx] : []);
			if (mx != null) out.lines.push({ d: `M${mx} ${my}V${busY}`, style: 'solid' });
			if (xs.length > 1) out.lines.push({ d: `M${Math.min(...xs)} ${busY}H${Math.max(...xs)}`, style: 'solid' });
			targets.forEach((v) => out.lines.push({ d: `M${v.x} ${busY}V${v.y}`, style: v.style }));
		}
		for (const [id, p] of Object.entries(L.pos)) out.nodes.push({ id, ...p });
		for (const g of L.ghosts) {
			const have = g.f.children.length,
				min = g.f.expectedChildren?.min;
			out.ghosts.push({ familyId: g.f.id, x: g.x, y: g.y, missing: min != null && min > have ? min - have : null });
		}
		x0 = L.right + 60;
		out.height = Math.max(out.height, L.bottom + 24);
	}
	out.width = Math.max(0, x0 - 44);
	return out;
}
