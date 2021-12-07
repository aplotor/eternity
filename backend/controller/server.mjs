const backend = process.cwd();
const run_config = (backend.toLowerCase().slice(0, 20) == "/mnt/c/users/j9108c/" ? "dev" : "prod");
console.log(`${run_config}: ${backend}`);

const secrets = (run_config == "dev" ? (await import(`${backend}/.secrets.mjs`)).dev : (await import(`${backend}/.secrets.mjs`)).prod);
const logger = await import(`${backend}/model/logger.mjs`);
const sql = await import(`${backend}/model/sql.mjs`);
const firebase = await import(`${backend}/model/firebase.mjs`);
const cryptr = await import(`${backend}/model/cryptr.mjs`);
const user = await import(`${backend}/model/user.mjs`);
const epoch = await import(`${backend}/model/epoch.mjs`);

import * as socket_io_server from "socket.io";
import * as socket_io_client from "socket.io-client";
import express from "express";
import http from "http";
import cors from "cors";
import cookie_session from "cookie-session";
import passport from "passport";
import passport_reddit from "passport-reddit";
import crypto from "crypto";
import filesystem from "fs";
import fileupload from "express-fileupload";

const app = express();
const app_name = "eternity";
const server = http.createServer(app);
const io = new socket_io_server.Server(server, {
	cors: (run_config == "dev" ? {origin: "*"} : null)
});
const app_socket = socket_io_client.connect("http://localhost:1026", {
	reconnect: true,
	extraHeaders: {
		app: app_name,
		port: (run_config == "dev" ? secrets.port - 1 : secrets.port),
		app_socket_secret: secrets.app_socket_secret
	}
});

(run_config == "dev" ? logger.clear_logs() : null);
await sql.init_db();
sql.cycle_backup_db();
await user.fill_usernames_to_socket_ids();
// user.cycle_update_all(io); // TODO enable later
process.nextTick(() => {
	sql.cycle_get_maintenance_status(maintenance_active);
});

const frontend = backend.replace("backend", "frontend");
let countdown_copy = null;
let domain_request_info_copy = null;
const maintenance_active = [false];

if (run_config == "dev") {
	app.use(cors());
	app.options("*", cors());
}

app.use(fileupload({
	limits: {
		fileSize: 3072 // 3kb in binary bytes. firebase service account key files should be ~2.3kb
	}
}));

app.use("/", express.static(`${frontend}/build/`));

app.use((req, res, next) => {
	(maintenance_active[0] == true ? res.status(503).sendFile(`${frontend}/build/index.html`) : next());
});

app.get("/", (req, res) => {
	res.status(200).sendFile(`${frontend}/build/index.html`);
});

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
passport.deserializeUser(async (username, done) => { // get user from db, specified by username in session cookie
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
process.nextTick(() => { // handle any deserializeUser errors here
	app.use((err, req, res, next) => {
		if (err) {
			console.log(err);

			const username = req.session.passport.user;
			delete user.usernames_to_socket_ids[username];
			
			req.session = null; // destroy login session
			console.log(`destroyed session (${username})`);
			req.logout();

			res.status(401).sendFile(`${frontend}/build/index.html`);
		} else {
			next();
		}
	});
});
app.use(express.urlencoded({
	extended: false
}));
app.use(cookie_session({ // https://expressjs.com/en/resources/middleware/cookie-session.html, https://www.npmjs.com/package/cookie-session, https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
	name: `${app_name}_session`,
	path: "/",
	secret: secrets.session_secret,
	signed: true,
	httpOnly: true,
	overwrite: true,
	sameSite: "lax",
	maxAge: 1000*60*60*24*30
}));
app.use(passport.initialize());
app.use(passport.session());

app.get("/authentication_check", async (req, res) => {
	if (req.isAuthenticated()) {
		user.usernames_to_socket_ids[req.user.username] = req.query.socket_id;
		user.socket_ids_to_usernames[req.query.socket_id] = req.user.username;

		let page = null;

		if (req.user.last_updated_epoch) {
			page = "access";
		} else if (req.user.firebase_service_acc_key_encrypted) {
			page = "loading";
		} else {
			page = "unlock";
		}

		res.send({
			username: req.user.username,
			use_page: page
		});
	} else {
		res.send({
			use_page: "landing"
		});
	}
});

app.get("/login", (req, res, next) => {
	passport.authenticate("reddit", { // https://github.com/Slotos/passport-reddit/blob/9717523d3d3f58447fee765c0ad864592efb67e8/examples/login/app.js#L86
		state: req.session.state = crypto.randomBytes(32).toString("hex"),
		duration: "permanent"
	})(req, res, next);
});

app.get("/callback", (req, res, next) => {
	if (req.query.state == req.session.state) {
		passport.authenticate("reddit", (err, u, info) => {
			if (err || !u) {
				res.status(401).sendFile(`${frontend}/build/index.html`);
			} else {
				// console.log(u);
				req.login(u, () => {
					res.redirect(302, "/");
				});
			}
		})(req, res, next);
	} else {
		res.status(401).sendFile(`${frontend}/build/index.html`);
	}
});

app.post("/upload", (req, res) => {
	if (req.isAuthenticated() && req.query.username == req.user.username) {
		req.files.file.mv(`${backend}/data/${req.user.username}_firebase_service_acc_key.json`, (err) => (err ? console.error(err) : null));
		res.end();
	} else {
		res.status(401).sendFile(`${frontend}/build/index.html`);
	}
});

app.get("/logout", (req, res) => {
	if (req.isAuthenticated()) {
		req.logout();
		res.redirect(302, "/");
	} else {
		res.status(401).sendFile(`${frontend}/build/index.html`);
	}
});

app.get("/purge", async (req, res) => {
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
		res.status(401).sendFile(`${frontend}/build/index.html`);
	}
});

app.all("*", (req, res) => {
	res.status(404).sendFile(`${frontend}/build/index.html`);
});

io.on("connect", (socket) => {
	console.log(`socket (${socket.id}) connected`);

	let username = null;

	socket.on("navigation", (route) => {
		io.to(socket.id).emit("update countdown", countdown_copy);
		if (domain_request_info_copy) {
			io.to(socket.id).emit("update domain request info", domain_request_info_copy);
		} else {
			setTimeout(() => {
				(domain_request_info_copy ? io.to(socket.id).emit("update domain request info", domain_request_info_copy) : null);
			}, 5000);
		}
		
		switch (route) {
			case "index":
				break;
			default:
				break;
		}

		sql.add_visit().catch((err) => console.error(err));
	});

	socket.on("page switch", async (page) => {
		switch (page) {
			case "landing":
				break;
			case "unlock":
				username = user.socket_ids_to_usernames[socket.id];
				break;
			case "loading":
				username = user.socket_ids_to_usernames[socket.id];
				try {
					const u = await user.get(username);
					await u.update(io, socket.id);
				} catch (err) {
					console.error(err);
				}
				break;
			case "access":
				username = user.socket_ids_to_usernames[socket.id];
				try {
					const u = await user.get(username);

					const app = firebase.create_app(JSON.parse(cryptr.decrypt(u.firebase_service_acc_key_encrypted)), JSON.parse(cryptr.decrypt(u.firebase_web_app_config_encrypted)).databaseURL, u.username);
					const auth_token = await firebase.create_new_auth_token(app);
					firebase.free_app(app).catch((err) => console.error(err));
			
					io.to(socket.id).emit("store data", true, JSON.parse(cryptr.decrypt(u.firebase_web_app_config_encrypted)), auth_token);
					io.to(socket.id).emit("store last updated epoch", u.last_updated_epoch);

					sql.query(`
						update user_ 
						set last_active_epoch = ${u.last_active_epoch = epoch.now()} 
						where username = '${u.username}';
					`).catch((err) => console.error(err));
				} catch (err) {
					console.error(err);
				}
				break;
			default:
				break;
		}
	});

	socket.on("validate firebase info", async (web_app_config) => {
		const key_path = `${backend}/data/${username}_firebase_service_acc_key.json`;
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

	socket.on("check email", (email) => { // TODO check email ➔ validate email
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
				where username = '${username}';
			`);
	
			io.to(socket.id).emit("switch page to loading");
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("delete item from reddit acc", (item_id, item_category, item_type) => {
		user.delete_item_from_reddit_acc(username, item_id, item_category, item_type).catch((err) => console.error(err));
	});

	socket.on("disconnect", () => {
		if (username) { // authenticated visitor (i.e., a user) is connected
			user.usernames_to_socket_ids[username] = null; // set to null; not delete, bc username is needed in user.update_all
			delete user.socket_ids_to_usernames[socket.id];	
		}
	});
});

app_socket.on("connect", () => {
	console.log("connected as client to j9108c (localhost:1026)");
});

app_socket.on("update countdown", (countdown) => {
	io.emit("update countdown", countdown_copy = countdown);
});

app_socket.on("update domain request info", (domain_request_info) => {
	io.emit("update domain request info", domain_request_info_copy = domain_request_info);
});

server.listen(secrets.port, secrets.host, () => {
	console.log(`server (${app_name}) started on (localhost:${secrets.port})`);
});
