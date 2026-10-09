// After building the private family edition: swap the public edition's search and sharing tags (in app.html,
// between the public-meta markers) for "don't index or preview this", and keep search engines out entirely.
import { readFileSync, writeFileSync } from 'node:fs';

const PRIVATE = `<meta name="description" content="A private family tree. Sign in to see it." />
		<meta name="robots" content="noindex, nofollow, noarchive" />`;
for (const f of ['build/index.html', 'build/404.html']) {
	const html = readFileSync(f, 'utf8');
	const out = html
		.replace(/<!-- public-meta:start[\s\S]*?<!-- public-meta:end -->/, PRIVATE)
		.replace(/<title>[^<]*<\/title>/, '<title>Family Tree Builder</title>');
	if (out === html || !out.includes('noindex')) throw new Error(`${f}: couldn't find the public-meta block`);
	writeFileSync(f, out);
}
console.log('family edition: private page tags');
