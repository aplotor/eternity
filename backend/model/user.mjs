const backend = process.cwd();
const run_config = (backend.toLowerCase().startsWith("/mnt/c/") ? "dev" : "prod");

const secrets = (run_config == "dev" ? (await import(`${backend}/.secrets.mjs`)).dev : (await import(`${backend}/.secrets.mjs`)).prod);
const logger = await import(`${backend}/model/logger.mjs`);
const sql = await import(`${backend}/model/sql.mjs`);
const firebase = await import(`${backend}/model/firebase.mjs`);
const cryptr = await import(`${backend}/model/cryptr.mjs`);
const email = await import(`${backend}/model/email.mjs`);
const epoch = await import(`${backend}/model/epoch.mjs`);

import snoowrap from "snoowrap";

const usernames_to_socket_ids = {};
const socket_ids_to_usernames = {};

class User {
	constructor(username, refresh_token, dummy=false) {
		this.username = username;

		if (dummy) {
			null;
		} else {
			this.reddit_api_refresh_token_encrypted = cryptr.encrypt(refresh_token);
			this.category_sync_info = {
				saved: {
					latest_fn_mixed: null,
					latest_new_data_epoch: null
				},
				created: {
					latest_fn_posts: null,
					latest_fn_comments: null,
					latest_new_data_epoch: null
				},
				upvoted: {
					latest_fn_posts: null,
					latest_new_data_epoch: null
				},
				downvoted: {
					latest_fn_posts: null,
					latest_new_data_epoch: null
				},
				hidden: {
					latest_fn_posts: null,
					latest_new_data_epoch: null
				},
				awarded: {
					latest_fn_mixed: null,
					latest_new_data_epoch: null
				}
			};
			this.last_updated_epoch = null;
			this.last_active_epoch = epoch.now();
			this.email_encrypted = null;
			this.email_notif = {
				last_inactive_notif_epoch: null,
				last_update_failed_notif_epoch: null
			};
			this.firebase_service_acc_key_encrypted = null;
			this.firebase_web_app_config_encrypted = null;
		}
	}
	async save() {
		let user_for_comparison = null;
		try {
			user_for_comparison = await get(this.username, true);
		} catch (err) {
			if (err != `Error: user (${this.username}) dne`) {
				console.error(err);
				logger.error(err);
				return;
			}
		}
		
		if (!user_for_comparison || !user_for_comparison.last_updated_epoch) {
			console.log(`new user (${this.username})`);

			await sql.query(`
				insert into user_ 
				values (
					'${this.username}', 
					'${this.reddit_api_refresh_token_encrypted}', 
					'${JSON.stringify(this.category_sync_info)}', 
					null, 
					${this.last_active_epoch}, 
					null, 
					'${JSON.stringify(this.email_notif)}', 
					null, 
					null
				) 
				on conflict (username) do update -- previously purged user
				set 
					reddit_api_refresh_token_encrypted = '${this.reddit_api_refresh_token_encrypted}', 
					category_sync_info = '${JSON.stringify(this.category_sync_info)}', 
					last_updated_epoch = null, 
					last_active_epoch = ${this.last_active_epoch}, 
					email_encrypted = null, 
					email_notif = '${JSON.stringify(this.email_notif)}', 
					firebase_service_acc_key_encrypted = null, 
					firebase_web_app_config_encrypted = null;
			`);
		} else {
			console.log(`returning user (${this.username})`);

			await sql.query(`
				update user_ 
				set reddit_api_refresh_token_encrypted = '${this.reddit_api_refresh_token_encrypted}' 
				where username = '${this.username}';
			`);
		}

		console.log(`saved user (${this.username})`);
	}
	async update(io=null, socket_id=null) {
		console.log(`updating user (${this.username})`);

		let progress = (io ? 0 : null);
		const complete = (io ? 8 : null);

		this.requester = new snoowrap({
			userAgent: secrets.reddit_app_user_agent,
			clientId: secrets.reddit_app_id,
			clientSecret: secrets.reddit_app_secret,
			refreshToken: cryptr.decrypt(this.reddit_api_refresh_token_encrypted)
		});
		this.me = await this.requester.getMe();

		this.firebase_app = firebase.create_app(JSON.parse(cryptr.decrypt(this.firebase_service_acc_key_encrypted)), JSON.parse(cryptr.decrypt(this.firebase_web_app_config_encrypted)).databaseURL, this.username);
		this.firebase_db = firebase.get_db(this.firebase_app);

		this.new_data = {};
		for (const category of ["saved", "created", "upvoted", "downvoted", "hidden", "awarded"]) {
			this.new_data[category] = {
				items: {},
				item_sub_icon_urls: {}
			};
		}

		this.imported_fns_to_delete = {
			saved: null,
			created: null,
			upvoted: null,
			downvoted: null,
			hidden: null
		};

		this.currently_requesting_icon_sets = {
			saved: new Set(),
			created: new Set(),
			upvoted: new Set(),
			downvoted: new Set(),
			hidden: new Set(),
			awarded: new Set()
		};

		const s_promise = new Promise(async (resolve, reject) => {
			try {
				(this.firebase_app.isDeleted_ ? null : await this.sync_category("saved", "mixed"));
				(this.firebase_app.isDeleted_ ? null : await this.import_category("saved", "mixed"));
				(this.firebase_app.isDeleted_ ? null : await this.get_new_item_icon_urls("saved"));

				if (this.firebase_app.isDeleted_) {
					reject(`(${this.username}) update error`);
				} else {
					(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		});

		const c_promise = new Promise(async (resolve, reject) => {
			try {
				if (!this.firebase_app.isDeleted_) {
					await Promise.all([
						this.sync_category("created", "posts"),
						this.sync_category("created", "comments")
					]);
				}
				(this.firebase_app.isDeleted_ ? null : await this.import_category("created", "mixed"));
				(this.firebase_app.isDeleted_ ? null : await this.get_new_item_icon_urls("created"));

				if (this.firebase_app.isDeleted_) {
					reject(`(${this.username}) update error`);
				} else {
					(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		});
		
		const u_promise = new Promise(async (resolve, reject) => {
			try {
				(this.firebase_app.isDeleted_ ? null : await this.sync_category("upvoted", "posts"));
				(this.firebase_app.isDeleted_ ? null : await this.import_category("upvoted", "posts"));
				(this.firebase_app.isDeleted_ ? null : await this.get_new_item_icon_urls("upvoted"));

				if (this.firebase_app.isDeleted_) {
					reject(`(${this.username}) update error`);
				} else {
					(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		});
		
		const d_promise = new Promise(async (resolve, reject) => {
			try {
				(this.firebase_app.isDeleted_ ? null : await this.sync_category("downvoted", "posts"));
				(this.firebase_app.isDeleted_ ? null : await this.import_category("downvoted", "posts"));
				(this.firebase_app.isDeleted_ ? null : await this.get_new_item_icon_urls("downvoted"));

				if (this.firebase_app.isDeleted_) {
					reject(`(${this.username}) update error`);
				} else {
					(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		});

		const h_promise = new Promise(async (resolve, reject) => {
			try {
				(this.firebase_app.isDeleted_ ? null : await this.sync_category("hidden", "posts"));
				(this.firebase_app.isDeleted_ ? null : await this.import_category("hidden", "posts"));
				(this.firebase_app.isDeleted_ ? null : await this.get_new_item_icon_urls("hidden"));

				if (this.firebase_app.isDeleted_) {
					reject(`(${this.username}) update error`);
				} else {
					(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		});

		const a_promise = new Promise(async (resolve, reject) => {
			try {
				(this.firebase_app.isDeleted_ ? null : await this.sync_category("awarded", "mixed"));
				(this.firebase_app.isDeleted_ ? null : await this.get_new_item_icon_urls("awarded"));

				if (this.firebase_app.isDeleted_) {
					reject(`(${this.username}) update error`);
				} else {
					(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		});

		await Promise.all([s_promise, c_promise, u_promise, d_promise, h_promise, a_promise]);

		try {
			await firebase.insert_data(this.firebase_db, this.new_data);
			await firebase.delete_imported_fns(this.firebase_db, this.imported_fns_to_delete);
			firebase.free_app(this.firebase_app).catch((err) => console.error(err));
			(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
		} catch (err) {
			console.error(err);
			logger.error(`user (${this.username}) db update error (${err})`);

			if (epoch.now() - this.email_notif.last_update_failed_notif_epoch >= 2592000) { // 30d
				email.send(this, "database update error notice", `your database could not be updated because: ${err}. please resolve this asap`);
				this.email_notif.last_update_failed_notif_epoch = epoch.now();
				sql.query(`
					update user_ 
					set email_notif = '${JSON.stringify(this.email_notif)}' 
					where username = '${this.username}';
				`).catch((err) => console.error(err));
			}

			return;
		}

		await sql.query(`
			update user_ 
			set 
				category_sync_info = '${JSON.stringify(this.category_sync_info)}', 
				last_updated_epoch = ${this.last_updated_epoch = epoch.now()} 
			where username = '${this.username}';
		`);
		(io ? io.to(socket_id).emit("update progress", ++progress, complete) : null);
		console.log(`updated user (${this.username})`);

		delete this.new_data;
		delete this.currently_requesting_icon_sets;
	}
	async sync_category(category, type) {
		let listing = null;
		let options = {
			limit: 5,
			before: this.category_sync_info[category][`latest_fn_${type}`] // "before" is actually chronologically after. https://www.reddit.com/dev/api/#listings
		};

		switch (category) {
			case "saved": // posts, comments
				listing = await this.me.getSavedContent(options);
				break;
			case "created": // posts, comments
				switch (type) {
					case "posts":
						listing = await this.me.getSubmissions(options);
						break;
					case "comments":
						listing = await this.me.getComments(options);
						break;
					default:
						break;
				}
				break;
			case "upvoted": // posts
				listing = await this.me.getUpvotedContent(options);
				break;
			case "downvoted": // posts
				listing = await this.me.getDownvotedContent(options);
				break;
			case "hidden": // posts
				listing = await this.me.getHiddenContent(options);
				break;
			case "awarded": // posts, comments
				listing = await this.me._getListing({
					uri: `u/${this.username}/gilded/given`,
					qs: options
				});
				break;
			default:
				break;
		}

		if (listing.isFinished) {
			// console.log(`(${category}) (${type}) listing is finished: ${listing.isFinished}`);
			
			if (listing.length == 0) { // either listing actually has no items, or user deleted the latest_fn item from the listing on reddit (like, deleted it from reddit ON reddit, not deleted it from reddit on eternity)
				options = {
					limit: 1
				};

				switch (category) {
					case "saved":
						listing = await this.me.getSavedContent(options);
						break;
					case "created":
						switch (type) {
							case "posts":
								listing = await this.me.getSubmissions(options);
								break;
							case "comments":
								listing = await this.me.getComments(options);
								break;
							default:
								break;
						}
						break;
					case "upvoted":
						listing = await this.me.getUpvotedContent(options);
						break;
					case "downvoted":
						listing = await this.me.getDownvotedContent(options);
						break;
					case "hidden":
						listing = await this.me.getHiddenContent(options);
						break;
					default:
						break;
				}
				
				const latest_fn = (listing.length != 0 ? listing[0].name : null);
				this.category_sync_info[category][`latest_fn_${type}`] = latest_fn;
			} else {
				this.parse_listing(listing, category, type);
				this.category_sync_info[category].latest_new_data_epoch = epoch.now();
			}
		} else {
			const extended_listing = await listing.fetchAll({
				append: true
			});
			// console.log(`(${category}) (${type}) extended listing is finished: ${extended_listing.isFinished}`);

			this.parse_listing(extended_listing, category, type);
			this.category_sync_info[category].latest_new_data_epoch = epoch.now();
		}
	}
	async import_category(category, type) {
		const ref = this.firebase_db.ref(`${category}/item_fns_to_import`).limitToFirst(500);
		const snapshot = await ref.get();
		const data = snapshot.val(); // null if no item_fns_to_import

		let fns = null;
		if (!data) {
			return;
		} else {
			fns = Object.keys(data);
			console.log(`importing (${fns.length}) (${category}) items`);
		}

		const promises = [];

		const required_num_requests = Math.ceil(fns.length / 100);
		for (let i = 0; i < required_num_requests; i++) {
			promises.push(this.requester.getContentByIds(fns.slice(i*100, i*100 + 100))); // getContentByIds only takes max of 100 fns at once
		}

		const listings = await Promise.all(promises);
		for (const listing of listings) {
			this.parse_listing(listing, category, type, false, true);
		}

		this.imported_fns_to_delete[category] = fns;
	}
	parse_listing(listing, category, type, from_mixed=false, from_import=false) {
		if (type == "mixed") {
			(!from_import ? this.category_sync_info[category].latest_fn_mixed = listing[0].name : null);

			const posts = [];
			const comments = [];

			for (const item of listing) {
				switch (item.constructor.name) {
					case "Submission":
						posts.push(item);
						break;
					case "Comment":
						comments.push(item);
						break;
					default:
						break;
				}
			}
	
			this.parse_listing(posts, category, "posts", true);
			this.parse_listing(comments, category, "comments", true);
		} else {
			(!from_mixed && !from_import ? this.category_sync_info[category][`latest_fn_${type}`] = listing[0].name : null);

			for (const item of listing) {
				this.new_data[category].items[item.id] = {
					type: (type == "posts" ? "post" : "comment"),
					content: (type == "posts" ? item.title : item.body),
					author: "u/"+item.author.name,
					sub: item.subreddit_name_prefixed,
					url: "https://www.reddit.com" + (item.permalink.endsWith("/") ? item.permalink.slice(0, -1) : item.permalink),
					created_epoch: item.created_utc
				};

				(!this.new_data[category].item_sub_icon_urls[item.subreddit_name_prefixed] ? this.currently_requesting_icon_sets[category].add(item.subreddit_name_prefixed) : null);
			}
		}
	}
	async get_new_item_icon_urls(category) {
		let r_subs = []; // actual subs
		let u_subs = []; // users as subs

		for (const sub of this.currently_requesting_icon_sets[category]) {
			if (sub.startsWith("r/")) {
				r_subs.push(sub);
			} else if (sub.startsWith("u/")) {
				u_subs.push(sub);
			}
		}

		(r_subs.length != 0 ? await this.request_item_icon_urls("r/", r_subs, category) : null);
		(u_subs.length != 0 ? await this.request_item_icon_urls("u/", u_subs, category) : null);
	}
	async request_item_icon_urls(type, subs, category) {
		const promises = [];

		let required_num_requests = null;
		const ratelimit_remaining = this.requester.ratelimitRemaining;
		let i = 0;

		switch (type) {
			case "r/":
				required_num_requests = Math.ceil(subs.length / 100);
			
				for (; i < required_num_requests && i < ratelimit_remaining; i++) {
					promises.push(this.requester.oauthRequest({
						uri: "api/info", // only takes max of 100 subs at once
						qs: {
							sr_name: subs.slice(i*100, i*100 + 100).join(",")
						}
					}));
				}
				break;
			case "u/":
				required_num_requests = subs.length;

				for (; i < required_num_requests && i < ratelimit_remaining; i++) {
					promises.push(this.requester.oauthRequest({
						uri: `${subs[i]}/about`
					}));
				}
				break;
			default:
				break;
		}
		(i == ratelimit_remaining ? console.log(`user (${this.username}) ratelimit reached`) : null);

		const responses = await Promise.all(promises);

		switch (type) {
			case "r/":
				for (const listing of responses) {
					for (const sub of listing) {
						const sub_name = sub.display_name_prefixed;
						
						let sub_icon_url = "#";
						if (sub.icon_img) {
							sub_icon_url = sub.icon_img.split("?")[0];
						} else if (sub.community_icon) {
							sub_icon_url = sub.community_icon.split("?")[0];
						}
		
						this.new_data[category].item_sub_icon_urls[sub_name] = sub_icon_url;
					}
				}
				break;
			case "u/":
				for (const sub of responses) {
					const sub_name = "u/"+sub.name;
	
					let sub_icon_url = "#";
					if (sub.icon_img) {
						sub_icon_url = sub.icon_img.split("?")[0];
					} else if (sub.subreddit.display_name.icon_img) {
						sub_icon_url = sub.subreddit.display_name.icon_img.split("?")[0];
					} else if (sub.community_icon) {
						sub_icon_url = sub.community_icon.split("?")[0];
					} else if (sub.subreddit.display_name.community_icon) {
						sub_icon_url = sub.subreddit.display_name.community_icon.split("?")[0];
					} else if (sub.snoovatar_img) {
						sub_icon_url = sub.snoovatar_img.split("?")[0];
					} else if (sub.subreddit.display_name.snoovatar_img) {
						sub_icon_url = sub.subreddit.display_name.snoovatar_img.split("?")[0];
					}
	
					this.new_data[category].item_sub_icon_urls[sub_name] = sub_icon_url;
				}
				break;
			default:
				break;
		}
	}
	async delete_item_from_reddit_acc(item_id, item_category, item_type) {
		const requester = new snoowrap({
			userAgent: secrets.reddit_app_user_agent,
			clientId: secrets.reddit_app_id,
			clientSecret: secrets.reddit_app_secret,
			refreshToken: cryptr.decrypt(this.reddit_api_refresh_token_encrypted)
		});
	
		let item = null;
		let item_fn = null; // https://www.reddit.com/dev/api/#fullnames
		switch (item_type) {
			case "post":
				item = requester.getSubmission(item_id);
				item_fn = `t3_${item_id}`;
				break;
			case "comment":
				item = requester.getComment(item_id);
				item_fn = `t1_${item_id}`;
				break;
			default:
				break;
		}
	
		let replace_latest_fn = null;
		if (item_category == "saved") {
			replace_latest_fn = (item_fn == this.category_sync_info.saved.latest_fn_mixed ? true : false);
		} else {
			replace_latest_fn = (item_fn == this.category_sync_info[item_category][`latest_fn_${item_type}s`] ? true : false);
		}
		
		switch (item_category) {
			case "saved":
				await item.unsave();
				break;
			case "created":
				await item.delete();
				break;
			case "upvoted":
			case "downvoted":
				await item.unvote();
				break;
			case "hidden":
				await item.unhide();
				break;
			default:
				break;
		}
	
		if (replace_latest_fn) {
			const me = await requester.getMe();
	
			let listing = null;
			const options = {
				limit: 1
			};
	
			switch (item_category) {
				case "saved":
					listing = await me.getSavedContent(options);
					break;
				case "created":
					switch (item_type) {
						case "post":
							listing = await me.getSubmissions(options);
							break;
						case "comment":
							listing = await me.getComments(options);
							break;
						default:
							break;
					}
					break;
				case "upvoted":
					listing = await me.getUpvotedContent(options);
					break;
				case "downvoted":
					listing = await me.getDownvotedContent(options);
					break;
				case "hidden":
					listing = await me.getHiddenContent(options);
					break;
				default:
					break;
			}
	
			const latest_fn = (listing.length != 0 ? listing[0].name : null);
			if (item_category == "saved") {
				this.category_sync_info.saved.latest_fn_mixed = latest_fn;
			} else {
				this.category_sync_info[item_category][`latest_fn_${item_type}s`] = latest_fn;
			}
	
			await sql.query(`
				update user_ 
				set category_sync_info = '${JSON.stringify(this.category_sync_info)}' 
				where username = '${this.username}';
			`);
		}
	}
	async purge() {
		await sql.query(`
			update user_ 
			set 
				reddit_api_refresh_token_encrypted = null, 
				category_sync_info = null, 
				last_updated_epoch = null, 
				last_active_epoch = null, 
				email_encrypted = null, 
				email_notif = null, 
				firebase_service_acc_key_encrypted = null, 
				firebase_web_app_config_encrypted = null 
			where username = '${this.username}';
		`);
		delete usernames_to_socket_ids[this.username];
		console.log(`purged user (${this.username})`);
	}
}

async function fill_usernames_to_socket_ids() {
	const existing_users = await sql.query(`
		select * from user_ 
		where reddit_api_refresh_token_encrypted is not null;
	`);
	for (const user of existing_users) {
		usernames_to_socket_ids[user.username] = null;
	}
}

async function get(username, existence_check=false) {
	(existence_check ? console.log(`checking if user (${username}) exists`) : console.log(`getting user (${username})`));

	const rows = await sql.query(`
		select * from user_ 
		where username = '${username}';
	`);
	
	if (rows[0] == undefined) {
		throw new Error(`user (${username}) dne`);
	} else {
		const plain_object = rows[0];
		// console.log(plain_object);
		(plain_object.last_updated_epoch ? plain_object.last_updated_epoch = parseInt(plain_object.last_updated_epoch) : null);
		plain_object.last_active_epoch = parseInt(plain_object.last_active_epoch);
	
		const user = Object.assign(new User(null, null, true), plain_object);
		return user;
	}
}

let update_all_completed = null;
async function update_all(io) { // synchronous one-by-one user update till all users are updated
	update_all_completed = false;

	const all_usernames = Object.keys(usernames_to_socket_ids);

	const async_iterable_obj = {
		[Symbol.asyncIterator]() {
			return {
				i: 0,
				next() {
					if (this.i < all_usernames.length) {
						return new Promise(async (resolve, reject) => {
							let user = null;
							try {
								user = await get(all_usernames[this.i]);

								if (epoch.now() - user.last_active_epoch <= 15552000) { // 6mo
									if (user.last_updated_epoch && epoch.now() - user.last_updated_epoch >= 30) {
										const pre_update_category_sync_info = JSON.parse(JSON.stringify(user.category_sync_info));
	
										await user.update();
										
										const post_update_category_sync_info = user.category_sync_info;
										
										const socket_id = usernames_to_socket_ids[user.username];
										if (socket_id) {
											const categories_w_new_data = [];
											for (const category in user.category_sync_info) {
												(post_update_category_sync_info[category].latest_new_data_epoch > pre_update_category_sync_info[category].latest_new_data_epoch ? categories_w_new_data.push(category) : null);
											}
											(categories_w_new_data.length != 0 ? io.to(socket_id).emit("show refresh alert", categories_w_new_data) : null);
	
											io.to(socket_id).emit("store last updated epoch", user.last_updated_epoch);
										}
									}	
								} else {
									if (epoch.now() - user.email_notif.last_inactive_notif_epoch >= 7776000) { // 3mo
										email.send(user, "account inactivity notice", "you have not used eternity for 6 or more consecutive months at this time. as such, your eternity account has been marked inactive and new Reddit data will not continue to sync to your database. to resolve this, log in to eternity");
										user.email_notif.last_inactive_notif_epoch = epoch.now();
										sql.query(`
											update user_ 
											set email_notif = '${JSON.stringify(user.email_notif)}' 
											where username = '${user.username}';
										`).catch((err) => console.error(err));
									}
								}
							} catch (err) {
								if (err != `Error: user (${all_usernames[this.i]}) dne`) {
									console.error(err);
									logger.error(err);
								}

								(user && user.firebase_app ? firebase.free_app(user.firebase_app).catch((err) => console.error(err)) : null);
							} finally {
								resolve({
									value: this.i++,
									done: false
								});
							}
						});
					} else {
						update_all_completed = true;
	
						return Promise.resolve({
							done: true
						});
					}
				}
			};
		}
	};
	for await (const val of async_iterable_obj) {
		// console.log(val);
		null;
	}

	console.log("update all completed");
}
function cycle_update_all(io) {
	update_all(io).catch((err) => console.error(err));

	setInterval(() => {
		(update_all_completed ? update_all(io).catch((err) => console.error(err)) : null);
	}, 60000); // 1min
}

export {
	User,
	usernames_to_socket_ids,
	socket_ids_to_usernames,
	fill_usernames_to_socket_ids,
	get,
	cycle_update_all
};
