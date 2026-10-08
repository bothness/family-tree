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

			// Static SPA: deploys to Netlify or Cloudflare Pages as plain files.
			adapter: adapter({ fallback: '200.html' })
		})
	],
	// Tests that need real `$state` proxies (as in the app) start with `// @vitest-environment happy-dom`; in the
	// default Node environment Svelte compiles for the server, where $state is a no-op and hides proxy bugs.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		include: ['src/**/*.test.ts']
	}
});
