import { describe, expect, it } from 'vitest';
import { gaps } from './gaps.ts';
import { emptyDataset, newPerson } from './mutations.ts';

describe('gaps', () => {
	it("lists someone's research tasks until they're marked as researched", () => {
		const d = emptyDataset();
		const p = newPerson(d, 'Ann Smith');
		p.research = { stage: 'in-progress', todo: ['Find baptism'] };
		expect(gaps(d)[p.id]).toContainEqual({ kind: 'todo', text: 'Find baptism' });
		p.research.stage = 'researched';
		expect(gaps(d)[p.id]?.some((g) => g.kind === 'todo')).toBeFalsy();
		expect(p.research.todo).toEqual(['Find baptism']); // kept on the person
	});
});
