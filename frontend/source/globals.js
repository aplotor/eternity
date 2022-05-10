import * as env from "$app/env";
import * as svelte_store from "svelte/store";
import * as socket_io_client from "socket.io-client";

const run_config = (env.dev ? "dev" : "prod");
const app_name = "eternity";

const readonly = {
	app_name: app_name,
	repo: `https://github.com/jc9108/${app_name}`,
	description: "bypass Reddit's 1000-item listing limits by externally storing your Reddit items (saved, created, upvoted, downvoted, hidden) in your own database",
	gh_sponsors_url: "https://github.com/sponsors/jc9108",
	backend: (run_config == "dev" ? "/backend" : ""),
	socket: socket_io_client.io((run_config == "dev" ? `http://${(env.browser ? location.hostname : "localhost")}:1301` : ""))
};

const writable = svelte_store.writable({
	all_apps_urls: null,

	firebase_app: null,
	firebase_auth: null,
	firebase_db: null
});

export {
	readonly,
	writable
};
