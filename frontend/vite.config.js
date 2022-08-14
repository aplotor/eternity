import * as vite from "@sveltejs/kit/vite";

const frontend = process.cwd();

export default { // https://vitejs.dev/config
	plugins: [
		vite.sveltekit()
	],
	resolve: {
		alias: {
			frontend: frontend // use in import statements within .svelte files
		}
	},
	server: {
		host: "0.0.0.0",
		port: 1300,
		strictPort: true,
		proxy: {
			"/backend": {
				rewrite: (path) => path.replace(/^(\/backend)/, ""),
				target: "http://localhost:1301",
				secure: false,
				changeOrigin: true,
				ws: true
			}
		},
		fs: {
			strict: true,
			allow: [
				frontend
			]
		}
	}
};
