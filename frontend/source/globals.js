import * as app_env from "$app/env";
import * as env_static_public from "$env/static/public";
import * as store from "svelte/store";
import * as socket_io_client from "socket.io-client";

const readonly = {
	app_name: "eternity",
	description: "bypass Reddit's 1000-item listing limits by externally storing your Reddit items (saved, created, upvoted, downvoted, hidden) in your own database",
	repo: "https://github.com/jc9108/eternity",
	backend: (env_static_public.RUN == "dev" ? "/backend" : ""),
	socket: socket_io_client.io((env_static_public.RUN == "dev" ? `http://${(app_env.browser ? window.location.hostname : "localhost")}:${Number.parseInt(env_static_public.PORT)+1}` : "")),
	portals: (env_static_public.RUN == "dev" ? `http://${(app_env.browser ? window.location.hostname : "localhost")}:1025` : "https://portals.sh")
};

const writable = store.writable({
	firebase_app: null,
	firebase_auth: null,
	firebase_db: null
});

export {
	readonly,
	writable
};
