const frontend = process.cwd();

import adapter_static from "@sveltejs/adapter-static"; // https://github.com/sveltejs/kit/tree/master/packages/adapter-static

export default {
	kit: { // https://kit.svelte.dev/docs#configuration
		ssr: false,
		adapter: adapter_static(), // an adapter is required to build for prod. see https://kit.svelte.dev/docs#adapters
		files: {
			template: "./source/app.html",
			routes: "./source/routes/",
			assets: "./static/"
		},
		trailingSlash: "never",
		vite: { // https://vitejs.dev/config
			resolve: {
				alias: {
					frontend: frontend // use in import statements within .svelte files
				}
			},
			server: {
				host: "0.0.0.0",
				port: 1200,
				strictPort: true,
				proxy: {
					"/backend": {
						rewrite: (path) => path.replace(/^(\/backend)/, ""),
						target: "http://localhost:1201",
						secure: false,
						changeOrigin: true,
						ws: true // not working with socket.io. check again after switching to vanilla ws
					}
				},
				fs: {
					strict: true,
					allow: [
						frontend
					]
				}
			}
		}
	}
};
