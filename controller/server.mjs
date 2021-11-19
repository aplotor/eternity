const project_root = process.cwd();
const run_config = (project_root.toLowerCase().slice(0, 20) == "/mnt/c/users/j9108c/" ? "dev" : "prod");
console.log(`${run_config}: ${project_root}`);

const secrets = (run_config == "dev" ? (await import(`${project_root}/_secrets.mjs`)).dev : (await import(`${project_root}/_secrets.mjs`)).prod);
const logger = (await import(`${project_root}/model/logger.mjs`));
const sql = (await import(`${project_root}/model/sql.mjs`));
const firebase = (await import(`${project_root}/model/firebase.mjs`));
const cryptr = (await import(`${project_root}/model/cryptr.mjs`));
const user = (await import(`${project_root}/model/user.mjs`));
const epoch = await import(`${project_root}/model/epoch.mjs`);

const express = (await import("express")).default;
const handlebars = (await import("express-handlebars")).default;
const http = (await import("http")).default;
const socket_io_server = (await import("socket.io")).Server;
const socket_io_client = (await import("socket.io-client")).default;
const cookie_session = (await import("cookie-session")).default;
const passport = (await import("passport")).default;
const passport_reddit = (await import("passport-reddit")).default;
const crypto = (await import("crypto")).default;
const filesystem = (await import("fs")).default;
const fileupload = (await import("express-fileupload")).default;

const app = express();
const app_name = "eternity";
const app_index = `/apps/${app_name}`; // index of this server relative to domain
const maintenance_active = [false];
const server = http.createServer(app);
const io = new socket_io_server(server, {
	path: `${app_index}/socket.io`
});

(run_config == "dev" ? logger.clear_logs() : null);
await sql.init_db();
sql.cycle_backup_db();
sql.cycle_get_maintenance_status(maintenance_active);
await user.fill_usernames_to_socket_ids();
user.cycle_update_all(io);

app.use(fileupload({
	limits: {
		fileSize: 3072 // 3kb in binary bytes. firebase service account key files should be ~2.3kb
	}
}));

app.use(`${app_index}/static`, express.static(`${project_root}/static`));
app.set("views", `${project_root}/static/html`);
app.set("view engine", "handlebars");
app.engine("handlebars", handlebars({
	layoutsDir: `${project_root}/static/html`,
	defaultLayout: "template.handlebars"
}));

// passport middleware MUST go after serving static assets middleware, else deserializeUser gets called multiple (>2) times on a single page reload (bc deserializeUser gets called once per request)
passport.use(new passport_reddit.Strategy({
	clientID: secrets.reddit_app_id,
	clientSecret: secrets.reddit_app_secret,
	callbackURL: secrets.reddit_app_redirect,
	scope: ["identity", "history", "read", "save", "edit", "vote", "report"] // https://github.com/reddit-archive/reddit/wiki/OAuth2 "scope values", https://www.reddit.com/dev/api/oauth
}, async (user_access_token, user_refresh_token, user_profile, done) => { // http://www.passportjs.org/docs/configure "verify callback"
	const u = new user.User(user_profile.name, user_refresh_token);

	try {
		await u.save();
		return done(null, u); // passes the user to serializeUser
	} catch (err) {
		console.error(err);
	}
}));
passport.serializeUser((u, done) => done(null, u.username)); // store user's username into session cookie
passport.deserializeUser(async (username, done) => { // get user by their username in session cookie
	try {
		const u = await user.get(username);
		done(null, u);
		console.log(`deserialized user (${username})`);
	} catch (err) {
		console.log(`deserialize error (${username})`);
		console.error(err);
		done(err, null);
	}
});
process.nextTick(() => {
	app.use((err, req, res, next) => { // handle any deserializeUser errors here
		if (err) {
			const username = req.session.passport.user;
			delete user.usernames_to_socket_ids[username];
			
			req.session = null; // destroy login session
			console.log(`destroyed session (${username})`);
			req.logout();
			res.status(401).render("error.handlebars", {
				title: `401 — j9108c`,
				http_status: 401
			});
		} else {
			next();
		}
	});
});
app.use(express.urlencoded({
	extended: false
}));
app.use(cookie_session({ // https://expressjs.com/en/resources/middleware/cookie-session.html, https://www.npmjs.com/package/cookie-session
	name: `${app_name}_session`,
	path: app_index,
	secret: secrets.session_secret,
	signed: true,
	httpOnly: true,
	sameSite: "lax",
	maxAge: 1000*60*60*24*30
}));
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
	if (maintenance_active[0] == true) {
		res.status(503).render("error.handlebars", {
			title: `503 — j9108c`,
			http_status: 503
		});
	} else {
		next();
	}
});

app.get(app_index, (req, res) => {
	res.render("index.handlebars", {
		title: `${app_name} — j9108c`,
		description: "bypass Reddit's 1000-item listing limits by externally storing your Reddit items (saved, created, upvoted, downvoted, hidden) in your own database",
		user: req.user // undefined if no login session
	});
});

app.get(`${app_index}/unlock`, async (req, res) => {
	if (req.isAuthenticated() && req.query.username == req.user.username) {
		user.usernames_to_socket_ids[req.user.username] = req.query.socket_id;
		user.socket_ids_to_usernames[req.query.socket_id] = req.user.username;
		res.end();
	} else {
		res.status(401).render("error.handlebars", {
			title: `401 — j9108c`,
			http_status: 401
		});
	}
});

app.post(`${app_index}/upload`, (req, res) => {
	if (req.isAuthenticated() && req.query.username == req.user.username) {
		req.files.file.mv(`${project_root}/data/${req.user.username}_firebase_service_acc_key.json`, (err) => (err ? console.error(err) : null));
		res.end();
	} else {
		res.status(401).render("error.handlebars", {
			title: `401 — j9108c`,
			http_status: 401
		});
	}
});

app.get(`${app_index}/load`, async (req, res) => {
	if (req.isAuthenticated() && req.query.username == req.user.username) {
		try {
			await req.user.update(io, req.query.socket_id);
		} catch (err) {
			console.error(err);
		} finally {
			res.end();
		}
	} else {
		res.status(401).render("error.handlebars", {
			title: `401 — j9108c`,
			http_status: 401
		});
	}
});

app.get(`${app_index}/access`, async (req, res) => {
	if (req.isAuthenticated() && req.query.username == req.user.username) {
		user.usernames_to_socket_ids[req.user.username] = req.query.socket_id;
		user.socket_ids_to_usernames[req.query.socket_id] = req.user.username;

		try {
			const app = firebase.create_app(JSON.parse(cryptr.decrypt(req.user.firebase_service_acc_key_encrypted)), JSON.parse(cryptr.decrypt(req.user.firebase_web_app_config_encrypted)).databaseURL, req.user.username);
			const auth_token = await firebase.create_new_auth_token(app);
			firebase.free_app(app).catch((err) => console.error(err));
	
			io.to(req.query.socket_id).emit("store data", true, JSON.parse(cryptr.decrypt(req.user.firebase_web_app_config_encrypted)), auth_token);
			io.to(req.query.socket_id).emit("store last updated epoch", req.user.last_updated_epoch);
		} catch (err) {
			console.error(err);
		} finally {
			res.end();
		}

		req.user.email_notif.last_inactive_notif_epoch = null;
		sql.query(`
			update user_ 
			set 
				last_active_epoch = ${req.user.last_active_epoch = epoch.now()}, 
				email_notif = '${JSON.stringify(req.user.email_notif)}' 
			where username = '${req.user.username}';
		`).catch((err) => console.error(err));

		sql.add_visit().catch((err) => console.error(err));
	} else {
		res.status(401).render("error.handlebars", {
			title: `401 — j9108c`,
			http_status: 401
		});
	}
});

app.get(`${app_index}/login`, (req, res, next) => {
	passport.authenticate("reddit", { // https://github.com/Slotos/passport-reddit/blob/9717523d3d3f58447fee765c0ad864592efb67e8/examples/login/app.js#L86
		state: req.session.state = crypto.randomBytes(32).toString("hex"),
		duration: "permanent"
	})(req, res, next);
});

app.get(`${app_index}/callback`, (req, res, next) => {
	if (req.query.state == req.session.state) {
		passport.authenticate("reddit", (err, u, info) => {
			if (err || !u) {
				res.status(401).render("error.handlebars", {
					title: `401 — j9108c`,
					http_status: 401
				});
			} else {
				// console.log(u);
				req.login(u, () => {
					res.redirect(302, app_index);
				});
			}
		})(req, res, next);
	} else {
		res.status(403).render("error.handlebars", {
			title: `403 — j9108c`,
			http_status: 403
		});
	}
});

app.get(`${app_index}/logout`, (req, res) => {
	if (req.isAuthenticated()) {
		req.logout();
		res.redirect(302, app_index);
	} else {
		res.status(401).render("error.handlebars", {
			title: `401 — j9108c`,
			http_status: 401
		});
	}
});

app.get(`${app_index}/purge`, async (req, res) => {
	if (req.isAuthenticated() && req.query.username == req.user.username) {
		try {
			await req.user.purge();
			req.logout();
			res.send("success");
		} catch (err) {
			console.error(err);
			res.send("error");
		}
	} else {
		res.status(401).render("error.handlebars", {
			title: `401 — j9108c`,
			http_status: 401
		});
	}
});

app.get(`${app_index}/*`, (req, res) => {
	res.status(404).render("error.handlebars", {
		title: `404 — j9108c`,
		http_status: 404
	});
});

io.on("connect", (socket) => {
	console.log(`socket (${socket.id}) connected`);

	const headers = socket.handshake.headers;
	// console.log(headers);
	const socket_address = headers.host.split(":")[0];
	(socket_address == dev_private_ip_copy ? io.to(socket.id).emit("replace localhost with dev private ip", dev_private_ip_copy) : null);

	io.to(socket.id).emit("update countdown", countdown_copy);
	if (domain_request_info_copy) {
		io.to(socket.id).emit("update domain request info", domain_request_info_copy);
	} else {
		setTimeout(() => (domain_request_info_copy ? io.to(socket.id).emit("update domain request info", domain_request_info_copy) : null), 5000);
	}

	socket.on("validate firebase info", async (web_app_config) => {
		const username = user.socket_ids_to_usernames[socket.id];

		const key_path = `${project_root}/data/${username}_firebase_service_acc_key.json`;
		const key_string = await filesystem.promises.readFile(key_path, "utf-8");
		const key_obj = JSON.parse(key_string);

		if (!(key_obj.type && key_obj.type == "service_account")) {
			io.to(socket.id).emit("alert", "validate", "validation failed: this is not a Firebase project service account key", "danger");
			await filesystem.promises.unlink(key_path);
			return;
		} else if (!(key_obj.project_id && key_obj.project_id.startsWith(`eternity-${username}`))) {
			io.to(socket.id).emit("alert", "validate", `validation failed: incorrect Firebase project name. you must name the project "eternity-${username}" (without the quotes)`, "danger");
			await filesystem.promises.unlink(key_path);
			return;
		} else if (!(web_app_config.projectId && web_app_config.projectId.startsWith(`eternity-${username}`) && web_app_config.databaseURL.startsWith(`https://eternity-${username}`) && web_app_config.databaseURL.includes("firebase"))) {
			io.to(socket.id).emit("alert", "validate", "validation failed: incorrect Firebase web app config", "danger");
			await filesystem.promises.unlink(key_path);
			return;
		}

		try {
			const app = firebase.create_app(key_obj, web_app_config.databaseURL, username);
			const db = firebase.get_db(app);
			const db_is_empty = await firebase.is_empty(db);
			firebase.free_app(app).catch((err) => console.error(err));
			if (!db_is_empty) {
				io.to(socket.id).emit("alert", "validate", "validation failed: database not empty", "danger");
				await filesystem.promises.unlink(key_path);
				return;
			}
		} catch (err) {
			console.error(err);
			io.to(socket.id).emit("alert", "validate", "validation failed: could not check database", "danger");
			await filesystem.promises.unlink(key_path);
			return;
		}

		await filesystem.promises.unlink(key_path);

		socket.firebase_service_acc_key_encrypted = cryptr.encrypt(JSON.stringify(key_obj));
		socket.firebase_web_app_config_encrypted = cryptr.encrypt(JSON.stringify(web_app_config));
		io.to(socket.id).emit("alert", "validate", "validation success", "success");

		(socket.firebase_service_acc_key_encrypted && socket.firebase_web_app_config_encrypted && socket.email_encrypted ? io.to(socket.id).emit("allow agree and continue") : null);
	});

	socket.on("check email", (email) => {
		email = email.trim();

		if (!email || !email.includes("@") || !email.includes(".com") || email.length < 7) {
			io.to(socket.id).emit("alert", "submit", "this is not an email address", "danger");
			return;
		} else if (email.endsWith("@j9108c.com")) {
			io.to(socket.id).emit("alert", "submit", "use your own email address", "danger");
			return;
		}

		socket.email_encrypted = cryptr.encrypt(email);
		io.to(socket.id).emit("alert", "submit", "ok", "success");

		(socket.firebase_service_acc_key_encrypted && socket.firebase_web_app_config_encrypted && socket.email_encrypted ? io.to(socket.id).emit("allow agree and continue") : null);
	});
	
	socket.on("save firebase info and email", async () => {
		try {
			await sql.query(`
				update user_ 
				set 
					email_encrypted = '${socket.email_encrypted}', 
					firebase_service_acc_key_encrypted = '${socket.firebase_service_acc_key_encrypted}', 
					firebase_web_app_config_encrypted = '${socket.firebase_web_app_config_encrypted}' 
				where username = '${user.socket_ids_to_usernames[socket.id]}';
			`);
	
			io.to(socket.id).emit("reload");
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("delete item from reddit acc", (item_id, item_category, item_type) => {
		user.delete_item_from_reddit_acc(user.socket_ids_to_usernames[socket.id], item_id, item_category, item_type).catch((err) => console.error(err));
	});

	socket.on("disconnect", () => {
		if (user.socket_ids_to_usernames[socket.id]) { // user is connected
			user.usernames_to_socket_ids[user.socket_ids_to_usernames[socket.id]] = null; // set to null and not delete bc username is needed in update_all
			delete user.socket_ids_to_usernames[socket.id];	
		}
	});
});

let dev_private_ip_copy = null;
let countdown_copy = null;
let domain_request_info_copy = null;
const io_as_client = socket_io_client.connect("http://localhost:1025", {
	reconnect: true,
	extraHeaders: {
		app: app_name,
		port: secrets.localhost_port
	}
});
io_as_client.on("connect", () => {
	console.log("connected as client to j9108c (localhost:1025)");

	io_as_client.on("store all apps urls", (all_apps_urls) => app.locals.all_apps_urls = all_apps_urls);

	io_as_client.on("store dev private ip", (dev_private_ip) => dev_private_ip_copy = dev_private_ip);
	
	io_as_client.on("update countdown", (countdown) => io.emit("update countdown", countdown_copy = countdown));

	io_as_client.on("update domain request info", (domain_request_info) => io.emit("update domain request info", domain_request_info_copy = domain_request_info));
});

// set app local vars (auto passed as data to all hbs renders)
app.locals.all_apps_urls = null;
app.locals.app_index = app_index;
app.locals.repo = `https://github.com/j9108c/${app_name}`;
app.locals.current_year = new Date().getFullYear();

// port and listen
const port = process.env.PORT || secrets.localhost_port;
server.listen(port, () => console.log(`server (${app_name}) started on (localhost:${port})`));
