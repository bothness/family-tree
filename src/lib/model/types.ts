// TypeScript mirror of schema/family-tree.schema.json (v0.2).
// Keep the two in step: tests/schema.test.ts validates the sample data against the JSON Schema.

export type Status = 'confirmed' | 'likely' | 'guess' | 'conflicting';
export type Sex = 'M' | 'F' | 'U';
export type NameType = 'birth' | 'married' | 'deed-poll' | 'alias' | 'anglicised' | 'religious' | 'other';
export type RelType = 'marriage' | 'civil-partnership' | 'partnership' | 'unknown';
export type EndReason = 'death' | 'divorce' | 'separation' | 'annulment' | 'unknown';
export type ChildRelation = 'biological' | 'adopted' | 'step' | 'foster' | 'unknown';
export type ResearchStage = 'sketch' | 'in-progress' | 'researched';
export type Completeness = 'yes' | 'no' | 'unknown';

export interface Citation { sourceId: string; detail?: string; note?: string }

/** A date in EDTF (ISO 8601-2), e.g. "1858~", "188X", "../1901", "1901/1911". */
export interface EdtfDate { edtf: string; status?: Status; citations?: Citation[]; note?: string }

export interface Link { url: string; label?: string }
export interface ExternalLinks { wikidata?: string; urls?: Link[] }
export interface Research { stage?: ResearchStage; todo?: string[] }
export interface Meta { createdAt?: string; createdBy?: string; updatedAt?: string; updatedBy?: string }

export interface Name {
	type?: NameType;
	given?: string;
	surname?: string;
	display?: string;
	preferred?: boolean;
	/** EDTF date from which this name was used. */
	date?: string;
	status?: Status;
	citations?: Citation[];
	note?: string;
}

export interface Person {
	id: string;
	placeholder?: boolean;
	names?: Name[];
	/** Nickname or shortened name; shown on the tree in place of the full name. */
	knownAs?: string;
	sex?: { value?: Sex; status?: Status };
	/** True if died. Absent = living or not known (born >110 years ago is treated as probably deceased). */
	deceased?: boolean;
	links?: ExternalLinks;
	tags?: string[];
	/** Biography and free-text notes. */
	notes?: string;
	/** Free-text sources. */
	sourceNotes?: string;
	research?: Research;
	meta?: Meta;
}

export interface PartnerRef { personId: string; status?: Status; citations?: Citation[] }
export interface ChildRef { personId: string; relation?: ChildRelation; status?: Status; citations?: Citation[] }

export interface Relationship {
	type?: RelType;
	status?: Status;
	start?: EdtfDate;
	end?: EdtfDate;
	endReason?: EndReason;
}

/** A union of 0–2 partners and the children of that union. Each child belongs to exactly one family. */
export interface Family {
	id: string;
	partners: PartnerRef[];
	relationship?: Relationship;
	children: ChildRef[];
	childrenComplete?: Completeness;
	expectedChildren?: { min?: number; max?: number; citations?: Citation[]; note?: string };
	tags?: string[];
	notes?: string;
	research?: Research;
	meta?: Meta;
}

export interface Participant { personId: string; role?: string; status?: Status }

export interface LifeEvent {
	id: string;
	type: string;
	label?: string;
	date?: EdtfDate;
	place?: { placeId: string; detail?: string; status?: Status };
	participants: Participant[];
	familyId?: string;
	value?: string;
	status?: Status;
	citations?: Citation[];
	tags?: string[];
	notes?: string;
	meta?: Meta;
}

export interface Place {
	id: string;
	name: string;
	type?: string;
	parentId?: string;
	altNames?: { name: string; period?: string; lang?: string }[];
	coordinates?: { lat: number; lon: number; approx?: boolean };
	links?: ExternalLinks;
	notes?: string;
	meta?: Meta;
}

export interface Source {
	id: string;
	title: string;
	type?: string;
	date?: string;
	repository?: string;
	reference?: string;
	url?: string;
	reliability?: 'original' | 'derivative' | 'authored' | 'hearsay';
	notes?: string;
	meta?: Meta;
}

export interface View {
	id: string;
	name: string;
	kind: 'tree' | 'timeline' | 'map' | 'list' | 'gaps';
	/** Which people the view shows. One rule per view: a focus (root + up/down/width), tags, or a hand-picked list. */
	scope?: {
		/** Focus views: the person the view is centred on. */
		root?: string;
		/** Generations of ancestors shown. Absent = all. */
		up?: number;
		/** Generations of descendants shown. Absent = all. */
		down?: number;
		/** Who besides the direct line: siblings (and aunts, uncles…) or all relatives (cousins…). Default direct. */
		width?: 'direct' | 'siblings' | 'all';
		people?: string[];
		tags?: string[];
		minStatus?: Status;
	};
	display?: Record<string, unknown>;
	meta?: Meta;
}

export interface Dataset {
	schemaVersion: '0.2';
	people: Person[];
	families: Family[];
	events: LifeEvent[];
	places: Place[];
	sources: Source[];
	views: View[];
}
