/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static SPA: plain files for any static host (GitHub Pages, Netlify, Cloudflare Pages). All app state is in
			// the address's #fragment, so only the root page is ever requested; the fallback is named 404.html because
			// that's the one GitHub Pages serves for unknown paths.
			adapter: adapter({ fallback: '404.html' }),
			// Served from a sub-path on GitHub Pages (e.g. /family-tree): set BASE_PATH when building.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	],
	// The family edition (shared data, Phase F) is the same app built with SYNC=cloudflare; the public edition
	// leaves it empty, and the sync code is then never loaded.
	define: { __SYNC__: JSON.stringify(process.env.SYNC ?? '') },
	// Tests that need real `$state` proxies (as in the app) start with `// @vitest-environment happy-dom`; in the
	// default Node environment Svelte compiles for the server, where $state is a no-op and hides proxy bugs.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		include: ['src/**/*.test.ts', 'server/**/*.test.ts']
	}
});
