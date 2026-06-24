import { defineConfig } from 'vite';
import { federation } from '@module-federation/vite';

// The remote URL is intentionally unreachable. The bug surfaces during the
// host's source transform, before any network call to the remote — so we
// don't need a real remote to reproduce it.
export default defineConfig({
	plugins: [
		federation({
			name: 'host',
			remotes: {
				remoteApp: {
					type: 'module',
					name: 'remoteApp',
					entry: 'http://localhost:9999/mf-manifest.json'
				}
			},
			shared: {},
			dts: false
		})
	]
});
