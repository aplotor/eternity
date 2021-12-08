import * as env from "$app/env";
import * as svelte_store from "svelte/store";
import * as socket_io_client from "socket.io-client";

const run_config = (env.dev ? "dev" : "prod");
const app_name = "eternity";

const readonly = {
	app_name: app_name,
	repo: `https://github.com/j9108c/${app_name}`,
	description: "bypass Reddit's 1000-item listing limits by externally storing your Reddit items (saved, created, upvoted, downvoted, hidden) in your own database",
	backend: (run_config == "dev" ? "/backend" : ""),
	socket: socket_io_client.io((run_config == "dev" ? `http://${(env.browser ? location.hostname : "localhost")}:1201` : "")),
	j9108c_url: (run_config == "dev" ? `http://${(env.browser ? location.hostname : "localhost")}:1025` : "http://j9108c.com")
};

const writable = svelte_store.writable({ // global state
	
});

export {
	readonly,
	writable
};
