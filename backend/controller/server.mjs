const backend = process.cwd();
import * as dotenv from "dotenv";
dotenv.config({
	path: `${backend}/.env_${process.env.RUN}`
});

const file = await import(`${backend}/model/file.mjs`);
const sql = await import(`${backend}/model/sql.mjs`);
const firebase = await import(`${backend}/model/firebase.mjs`);
const cryptr = await import(`${backend}/model/cryptr.mjs`);
const user = await import(`${backend}/model/user.mjs`);
const epoch = await import(`${backend}/model/epoch.mjs`);
const email = await import(`${backend}/model/email.mjs`);

import * as socket_io_server from "socket.io";
import * as socket_io_client from "socket.io-client";
import express from "express";
import http from "http";
import cookie_session from "cookie-session";
import passport from "passport";
import passport_reddit from "passport-reddit";
import crypto from "crypto";
import filesystem from "fs";
import fileupload from "express-fileupload";

let domain_request_info = null;

const app = express();
const server = http.createServer(app);
const io = new socket_io_server.Server(server, {
	cors: (process.env.RUN == "dev" ? {origin: "*"} : null),
	maxHttpBufferSize: 1000000 // 1mb in bytes
});
const app_socket = socket_io_client.io("http://localhost:1026", {
	autoConnect: false,
	reconnect: true,
	extraHeaders: {
		app: "eternity",
		secret: process.env.LOCAL_SOCKETS_SECRET
	}
});

const frontend = backend.replace("backend", "frontend");

const allowed_users = new Set(process.env.ALLOWED_USERS.split(", "));
const denied_users = new Set(process.env.DENIED_USERS.split(", "));

await file.init();
await sql.init_db();
sql.cycle_backup_db();
await user.fill_usernames_to_socket_ids();
user.cycle_update_all(io);

app.use(fileupload({
	limits: {
		fileSize: 3072 // 3kb in binary bytes. firebase service account key files should be ~2.35kb
	}
}));

app.use("/", express.static(`${frontend}/build/`));

passport.use(new passport_reddit.Strategy({
	clientID: process.env.REDDIT_APP_ID,
	clientSecret: process.env.REDDIT_APP_SECRET,
	callbackURL: process.env.REDDIT_APP_REDIRECT,
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
			console.error(err);

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
app.use(cookie_session({ // https://github.com/expressjs/cookie-session
	name: "eternity_session",
	path: "/",
	secret: process.env.SESSION_SECRET,
	signed: true,
	httpOnly: true,
	overwrite: true,
	sameSite: "lax",
	maxAge: 1000*60*60*24*30
}));
app.use((req, res, next) => { // rolling session: https://github.com/expressjs/cookie-session#extending-the-session-expiration
	req.session.nowInMinutes = Math.floor(Date.now() / 60000);
	next();
});
app.use(passport.initialize());
app.use(passport.session());

app.get("/login", (req, res, next) => {
	passport.authenticate("reddit", { // https://github.com/Slotos/passport-reddit/blob/9717523d3d3f58447fee765c0ad864592efb67e8/examples/login/app.js#L86
		state: req.session.state = crypto.randomBytes(32).toString("hex"),
		duration: "permanent"
	})(req, res, next);
});

app.get("/callback", (req, res, next) => {
	if (req.query.state == req.session.state) {
		passport.authenticate("reddit", async (err, u, info) => {
			if (err || !u) {
				res.redirect(302, "/logout");
			} else if ((allowed_users.has("*") && denied_users.has(u.username)) || (!allowed_users.has("*") && !allowed_users.has(u.username)) || (denied_users.has("*") && !allowed_users.has(u.username))) {
				try {
					await u.purge();
					res.redirect(302, "/logout");
					console.log(`denied user (${u.username})`);
				} catch (err) {
					console.error(err);
				}
			} else {
				req.login(u, () => {
					res.redirect(302, "/");
				});
			}
		})(req, res, next);
	} else {
		res.redirect(302, "/logout");
	}
});

app.get("/authentication_check", (req, res) => {
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

app.post("/upload", (req, res) => {
	if (req.isAuthenticated()) {
		(req.files.key ? req.files.key.mv(`${backend}/tempfiles/${req.user.username}_firebase_service_acc_key.json`).catch((err) => console.error(err)) : null);
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
	if (req.isAuthenticated() && req.query.socket_id == user.usernames_to_socket_ids[req.user.username]) {
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

	socket.username = null;
	socket.firebase_instances_created = false; // clientside firebase instances (app, auth, db)

	socket.on("layout mounted", () => {
		io.to(socket.id).emit("update domain request info", domain_request_info);
	});

	socket.on("route", (route) => {
		switch (route) {
			case "index":
				break;
			case "about":
				break;
			default:
				break;
		}
	});

	socket.on("page", async (page) => {
		let u = null;

		switch (page) {
			case "landing":
				break;
			case "unlock":
				socket.username = user.socket_ids_to_usernames[socket.id];
				break;
			case "loading":
				socket.username = user.socket_ids_to_usernames[socket.id];
				try {
					u = await user.get(socket.username);
					await u.update(io, socket.id);
				} catch (err) {
					console.error(err);
					(u && u.firebase_app ? firebase.free_app(u.firebase_app).catch((err) => console.error(err)) : null);
				}
				break;
			case "access":
				socket.username = user.socket_ids_to_usernames[socket.id];
				try {
					u = await user.get(socket.username);

					io.to(socket.id).emit("store last updated epoch", u.last_updated_epoch);

					sql.update_user(u.username, {
						last_active_epoch: u.last_active_epoch = epoch.now()
					}).catch((err) => console.error(err));
				} catch (err) {
					console.error(err);
				}
				break;
			default:
				break;
		}

		if (u && !socket.firebase_instances_created) {
			try {
				const app = firebase.create_app(JSON.parse(cryptr.decrypt(u.firebase_service_acc_key_encrypted)), JSON.parse(cryptr.decrypt(u.firebase_web_app_config_encrypted)).databaseURL, u.username);
				const auth_token = await firebase.create_new_auth_token(app);
				firebase.free_app(app).catch((err) => console.error(err));
	
				io.to(socket.id).emit("create firebase instances", JSON.parse(cryptr.decrypt(u.firebase_web_app_config_encrypted)), auth_token);
				socket.firebase_instances_created = true;
			} catch (err) {
				console.error(err);
			}
		}
	});

	socket.on("validate firebase info", async (web_app_config) => {
		try {
			const key_path = `${backend}/tempfiles/${socket.username}_firebase_service_acc_key.json`;
			const key_string = await filesystem.promises.readFile(key_path, "utf-8");
			const key_obj = JSON.parse(key_string);
	
			if (!(key_obj.type && key_obj.type == "service_account") && key_obj.project_id && key_obj.private_key_id && key_obj.private_key && key_obj.client_email && key_obj.client_id && key_obj.auth_uri && key_obj.token_uri && key_obj.auth_provider_x509_cert_url && key_obj.client_x509_cert_url) {
				io.to(socket.id).emit("alert", "firebase", "validation failed: incorrect Firebase project service account key", "danger");
				await filesystem.promises.unlink(key_path);
				return;
			}
			
			if (!(web_app_config.databaseURL && web_app_config.databaseURL.includes("firebase") && web_app_config.apiKey && web_app_config.authDomain && web_app_config.projectId && web_app_config.storageBucket && web_app_config.messagingSenderId && web_app_config.appId)) {
				io.to(socket.id).emit("alert", "firebase", "validation failed: incorrect Firebase web app config", "danger");
				await filesystem.promises.unlink(key_path);
				return;
			}
	
			try {
				const app = firebase.create_app(key_obj, web_app_config.databaseURL, socket.username);
				const db = firebase.get_db(app);
				const db_is_empty = await firebase.is_empty(db);
				firebase.free_app(app).catch((err) => console.error(err));
				if (!db_is_empty) {
					io.to(socket.id).emit("alert", "firebase", "validation failed: database not empty", "danger");
					await filesystem.promises.unlink(key_path);
					return;
				}
			} catch (err) {
				console.error(err);
				io.to(socket.id).emit("alert", "firebase", "validation failed: could not check database", "danger");
				await filesystem.promises.unlink(key_path);
				return;
			}
	
			await filesystem.promises.unlink(key_path);
	
			socket.firebase_service_acc_key_encrypted = cryptr.encrypt(JSON.stringify(key_obj));
			socket.firebase_web_app_config_encrypted = cryptr.encrypt(JSON.stringify(web_app_config));
			io.to(socket.id).emit("alert", "firebase", "validation success", "success");
			io.to(socket.id).emit("disable button", "validate");
	
			(socket.firebase_service_acc_key_encrypted && socket.firebase_web_app_config_encrypted && socket.verified_email ? io.to(socket.id).emit("enable button", "save_and_continue") : null);
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("confirm email", async (email_addr) => {
		email_addr = email_addr.trim();

		if (!(email_addr && email_addr.includes("@") && email_addr.includes(".") && email_addr.length >= 7)) {
			io.to(socket.id).emit("alert", "email", "this is not an email address", "danger");
			return;
		}

		io.to(socket.id).emit("disable button", "confirm");
		
		const obj = {
			username: socket.username,
			email_encrypted: socket.email_encrypted = cryptr.encrypt(email_addr)
		};
		email.send(obj, "verify your email", `your verification code is <big>${socket.id.replace(/(\W)|(_)/g, "").substring(0, 5).toUpperCase()}</big>. if you did not request this, please ignore this email`);

		io.to(socket.id).emit("alert", "email", "enter the code sent to this email to verify that it's your email. check your junk/spam folder if you don't see it. the verification must be done while this page is open, so don't close this page", "primary");

		io.to(socket.id).emit("enable button", "verify");
	});

	socket.on("verify code", (username, code) => {
		if (!(username == socket.username && code == socket.id.replace(/(\W)|(_)/g, "").substring(0, 5).toUpperCase())) {
			io.to(socket.id).emit("alert", "email", "verification failed", "danger");
			return;
		}

		socket.verified_email = true;
		io.to(socket.id).emit("alert", "email", "verification success", "success");
		io.to(socket.id).emit("disable button", "verify");

		(socket.firebase_service_acc_key_encrypted && socket.firebase_web_app_config_encrypted && socket.verified_email ? io.to(socket.id).emit("enable button", "save_and_continue") : null);
	});
	
	socket.on("save firebase info and email", async () => {
		try {
			await sql.update_user(socket.username, {
				email_encrypted: socket.email_encrypted,
				firebase_service_acc_key_encrypted: socket.firebase_service_acc_key_encrypted,
				firebase_web_app_config_encrypted: socket.firebase_web_app_config_encrypted
			});
	
			io.to(socket.id).emit("switch page to loading");
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("get comment from reddit", async (comment_id) => {
		try {
			const u = await user.get(socket.username);
			const comment_content = await u.get_comment_from_reddit(comment_id);
			io.to(socket.id).emit("got comment from reddit", comment_content);
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("delete item from reddit acc", async (item_id, item_category, item_type) => {
		try {
			const u = await user.get(socket.username);
			u.delete_item_from_reddit_acc(item_id, item_category, item_type).catch((err) => console.error(err));
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("disconnect", () => {
		if (socket.username) { // logged in
			(socket.username in user.usernames_to_socket_ids ? user.usernames_to_socket_ids[socket.username] = null : null); // set to null; not delete, bc username is needed in user.update_all
			delete user.socket_ids_to_usernames[socket.id];	
		}
	});
});

app_socket.on("connect", () => {
	console.log("connected as client to portals (localhost:1026)");
});

app_socket.on("update domain request info", (info) => {
	io.emit("update domain request info", domain_request_info = info);
});

app_socket.connect();

server.listen(Number.parseInt(process.env.PORT), "0.0.0.0", () => {
	console.log(`server (eternity) started on (localhost:${process.env.PORT})`);
});

process.on("beforeExit", async (exit_code) => {
	try {
		await sql.pool.end();
	} catch (err) {
		console.error(err);
	}
});
