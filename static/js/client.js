let app_index = null;
const socket = io({ // triggers server's io.on connect
	path: `${app_index = document.getElementById("app_index").getAttribute("content")}/socket.io`
});

let [firebase_app, firebase_auth, firebase_db] = [null]; // cannot await `import`s here bc it messes with socket receiving events (socket.on ...)

let firebase_app_instance = null;
let firebase_db_instance = null;

const username = (document.getElementById("username_wrapper") ? document.getElementById("username_wrapper").innerHTML : null);
let data_in_use = create_new_data_frame();
let data_pending_refresh = create_new_data_frame();
let last_updated_epoch = null;

let subreddit_select_filled = false;

let active_category = "saved";
let active_type = "all";
let active_search_str = null;
let active_item_ids = null;
let items_currently_listed = 0;

let item_list = null;
const observer = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		if (entry.intersectionRatio > 0) { // observed element is in view
			list_next_items(25);
			observer.unobserve(entry.target);
		}
	}
}, {
	root: item_list = document.getElementById("item_list"),
	rootMargin: "0px",
	threshold: 0
});

const dropdown_btn = document.getElementById("dropdown_btn");
const dropdown_menu = document.getElementById("dropdown_menu");
const last24hours_total_wrapper = document.getElementById("last24hours_total_wrapper");
const last7days_total_wrapper = document.getElementById("last7days_total_wrapper");
const last30days_total_wrapper = document.getElementById("last30days_total_wrapper");
const last24hours_list_wrapper = document.getElementById("last24hours_list_wrapper");
const last7days_list_wrapper = document.getElementById("last7days_list_wrapper");
const last30days_list_wrapper = document.getElementById("last30days_list_wrapper");
const countdown_wrapper = document.getElementById("countdown_wrapper");
const login_btn = document.getElementById("login_btn");
const unlock_container = document.getElementById("unlock_container");
const loading_container = document.getElementById("loading_container");
const access_container = document.getElementById("access_container");
const progress_wrapper = document.getElementById("progress_wrapper");
const last_updated_wrapper = document.getElementById("last_updated_wrapper");
const settings_btn = document.getElementById("settings_btn");
const settings_menu = document.getElementById("settings_menu");
const export_anchor = document.getElementById("export_anchor");
const purge_anchor = document.getElementById("purge_anchor");
const purge_warning = document.getElementById("purge_warning");
const purge_input = document.getElementById("purge_input");
const purge_cancel_btn = document.getElementById("purge_cancel_btn");
const purge_confirm_btn = document.getElementById("purge_confirm_btn");
const purge_spinner_container = document.getElementById("purge_spinner_container");
const redirect_notice = document.getElementById("redirect_notice");
const redirect_countdown_wrapper = document.getElementById("redirect_countdown_wrapper");
const search_input = document.getElementById("search_input");
const subreddit_select = document.getElementById("subreddit_select");
let subreddit_select_btn = setTimeout(() => subreddit_select_btn = document.getElementsByClassName("bs-placeholder")[0], 1000);
let subreddit_select_dropdown = setTimeout(() => subreddit_select_dropdown = document.getElementsByClassName("bootstrap-select")[0], 1000);
const category_btn_group = document.getElementById("category_btn_group");
const type_btn_group = document.getElementById("type_btn_group");
const skeleton_list = document.getElementById("skeleton_list");
const new_data_alert_wrapper = document.getElementById("new_data_alert_wrapper");
const config_input = document.getElementById("config_input");
const file_input_container = document.getElementById("file_input_container");
const file_input = document.getElementById("file_input");
const file_input_label = document.getElementById("file_input_label");
const validate_btn = document.getElementById("validate_btn");
const validate_alert_wrapper = document.getElementById("validate_alert_wrapper");
const instruction_video_anchor = document.getElementById("instruction_video_anchor");
const instruction_video_wrapper = document.getElementById("instruction_video_wrapper");
const email_input = document.getElementById("email_input");
const submit_btn = document.getElementById("submit_btn");
const submit_alert_wrapper = document.getElementById("submit_alert_wrapper");
const agree_and_continue_btn = document.getElementById("agree_and_continue_btn");
const dl = document.getElementById("dl");

if (document.cookie) {
	const light_mode = document.cookie.split("; ").find((cookie) => cookie.startsWith("light_mode")).split("=")[1];
	if (light_mode == "on") {
		document.documentElement.classList.add("invert");
		document.body.classList.add("light_mode");
		dropdown_btn.classList.add("anti_invert");
		dropdown_menu.classList.add("anti_invert");
		dropdown_menu.classList.add("light_mode");

		if (settings_btn) {
			settings_btn.classList.add("anti_invert");
			settings_menu.classList.add("anti_invert");
		}

		if (login_btn) {
			login_btn.classList.add("anti_invert");
		} else if (unlock_container) {
			file_input_container.classList.add("anti_invert");
			config_input.classList.add("anti_invert");
			validate_btn.classList.add("anti_invert");
			validate_alert_wrapper.classList.add("anti_invert");
			email_input.classList.add("anti_invert");
			submit_btn.classList.add("anti_invert");
			submit_alert_wrapper.classList.add("anti_invert");
		} else if (access_container) {
			new_data_alert_wrapper.classList.add("anti_invert");
			search_input.classList.add("anti_invert");
			setTimeout(() => {
				const interval_id = setInterval(() => {
					if (subreddit_select_filled) {
						for (const child of [...document.getElementById("subreddit_select_container").children[0].children]) {
							child.classList.add("anti_invert");
						}

						clearInterval(interval_id);
					}
				}, 100);
			}, 1000);
		}
	}
}

(window.location.href.endsWith("#_") ? window.location.href = app_index : null);

document.addEventListener("keydown", (evt) => (evt.key == "Escape" ? setTimeout(() => (!dropdown_menu.classList.contains("show") ? dropdown_btn.blur() : null), 100) : null));

dropdown_btn.addEventListener("click", (evt) => {
	setTimeout(() => (!dropdown_menu.classList.contains("show") ? dropdown_btn.blur() : null), 100);

	setTimeout(() => {
		dropdown_menu.scrollIntoView({
			behavior: "smooth",
			block: "end"
		});
	}, 250);
});

if (settings_btn) {
	document.addEventListener("click", (evt) => setTimeout(() => (!settings_menu.classList.contains("show") ? hide_purge_warning() : null), 100));

	document.addEventListener("keydown", (evt) => {
		if (evt.key == "Escape") {
			setTimeout(() => {
				if (!settings_menu.classList.contains("show")) {
					settings_btn.blur();
					hide_purge_warning();
				}
			}, 100);
		}
	});

	settings_btn.addEventListener("click", (evt) => {
		setTimeout(() => {
			if (!settings_menu.classList.contains("show")) {
				settings_btn.blur();
				hide_purge_warning();
			}
		}, 100);
	});

	settings_menu.addEventListener("click", (evt) => evt.stopPropagation());
	
	purge_anchor.addEventListener("click", (evt) => {
		evt.preventDefault();
		toggle_purge_warning();
	});
	
	purge_cancel_btn.addEventListener("click", (evt) => {
		evt.preventDefault();
		toggle_purge_warning();
	});
	
	purge_confirm_btn.addEventListener("click", (evt) => {
		evt.preventDefault();
		(purge_input.value == `purge u/${username}` ? purge() : shake_element(purge_input));
	});

	purge_input.addEventListener("keydown", (evt) => {
		if (evt.key == "Enter") {
			evt.preventDefault();
			(purge_input.value == `purge u/${username}` ? purge() : shake_element(purge_input));
		}
	});

	if (export_anchor) {
		export_anchor.addEventListener("click", (evt) => {
			evt.preventDefault();
			
			const blob = new Blob([
				JSON.stringify(data_in_use, null, 4)
			], {
				type: "application/json"
			});
			const url = URL.createObjectURL(blob);
			dl.href = url;
			const now_epoch = Math.floor(Date.now() / 1000);
			const filename = `eternity — u=${username} — ${epoch_to_formatted_datetime(now_epoch).replaceAll(":", "꞉")}.json`;
			dl.download = filename;
			dl.click();
			URL.revokeObjectURL(url);
		});
	}
}

if (unlock_container) {
	jQuery('[data-toggle="tooltip"]').tooltip("enable");

	document.addEventListener("keydown", (evt) => {
		if (evt.key == "Enter") {
			(!agree_and_continue_btn.hasAttribute("disabled") ? agree_and_continue_btn.click() : null);
		}
	});

	file_input.addEventListener("input", (evt) => file_input_label.innerText = file_input.files[0].name);

	config_input.addEventListener("keydown", (evt) => (evt.key == "Enter" ? validate_btn.click() : null));

	validate_btn.addEventListener("click", (evt) => {
		if (!config_input.value) {
			show_alert(validate_alert_wrapper, "provide the web app config", "warning");
			return;
		}

		let web_app_config = null;
		try {
			web_app_config = JSON.parse(config_input.value.replace(/(\s)/g, "").replace(";", "").replace("{", '{"').replaceAll(':"', '":"').replaceAll('",', '","'));
		} catch (err) {
			console.error(err);
			show_alert(validate_alert_wrapper, "this is not a Firebase web app config", "danger");
			return;
		}

		if (!file_input.value) {
			show_alert(validate_alert_wrapper, "provide the service account key file", "warning");
			return;
		}

		const file = file_input.files[0];
		const filename = file.name;
		const filesize = file.size; // in binary bytes
		const filesize_limit = 3072; // 3kb in binary bytes. firebase service account key files should be ~2.3kb

		if (filename.split(".").pop().toLowerCase() != "json" || filesize > filesize_limit) {
			show_alert(validate_alert_wrapper, "this is not a Firebase service account key file", "danger");
			return;
		}

		const data = new FormData();
		data.append("file", file);

		const request = new XMLHttpRequest();
		request.open("post", `${app_index}/upload?username=${username}`);
		request.responseType = "json";

		request.addEventListener("error", (evt) => {
			show_alert(validate_alert_wrapper, "save error", "danger");
		});

		request.onreadystatechange = function () {
			if (this.readyState == 4 && this.status == 200) {
				show_alert(validate_alert_wrapper, '<div class="d-flex justify-content-center pt-1"><div class="dot-carousel mr-4"></div><span class="mt-n1">validating key and database</span><div class="dot-carousel ml-4"></div></div>', "success");
				setTimeout(() => socket.emit("validate firebase info", web_app_config), 2000);
			}
		}
	
		request.send(data);
	});

	instruction_video_anchor.addEventListener("click", (evt) => {
		evt.preventDefault();
		instruction_video_wrapper.classList.toggle("d-none");
	});

	email_input.addEventListener("keydown", (evt) => (evt.key == "Enter" ? submit_btn.click() : null));

	submit_btn.addEventListener("click", (evt) => {
		const email = email_input.value.trim();

		if (!email || !email.includes("@") || !email.includes(".com") || email.length < 7) {
			show_alert(submit_alert_wrapper, "this is not an email address", "danger");
			return;
		} else if (email.endsWith("@j9108c.com")) {
			show_alert(submit_alert_wrapper, "use your own email address", "danger");
			return;
		}

		socket.emit("check email", email);
	});

	agree_and_continue_btn.addEventListener("click", (evt) => {
		evt.target.innerHTML = '<div class="d-flex justify-content-center pt-2"><div class="dot-carousel mr-4"></div><span class="mt-n2">saving</span><div class="dot-carousel ml-4"></div></div>';
		setTimeout(() => socket.emit("save firebase info and email"), 2000);
	});
} else if (access_container) {
	document.addEventListener("click", async (evt) => {
		(evt.target.classList.contains("dropdown-item") || evt.target.parentElement && evt.target.parentElement.classList.contains("dropdown-item") ? subreddit_select_btn.blur() : null);

		if (evt.target.dataset && evt.target.dataset.url) {
			window.open(evt.target.dataset.url, "_blank");
		} else if (evt.target.parentElement && evt.target.parentElement.dataset && evt.target.parentElement.dataset.url && evt.target.tagName != "BUTTON") {
			window.open(evt.target.parentElement.dataset.url, "_blank");
		}

		if (evt.target.classList.contains("copy_link_btn")) {
			try {
				await navigator.clipboard.writeText(evt.target.parentElement.dataset.url);
				evt.target.classList.remove("btn-outline-secondary");
				evt.target.classList.add("btn-success");
				setTimeout(() => {
					evt.target.classList.remove("btn-success");
					evt.target.classList.add("btn-outline-secondary");
				}, 500);
			} catch (err) {
				console.error(err);
			}
		}
		
		if (evt.target.classList.contains("delete_btn")) {
			const item_id = evt.target.parentElement.id;

			const all_opened_popovers = document.getElementsByClassName("popover");
			for (const popover of [...all_opened_popovers]) {
				const popover_item_id = popover.children[2].children[0].classList[0];
				
				(popover_item_id != item_id ? jQuery(popover).popover("hide") : null);
			}
		} else if (evt.target.classList.contains("row_1_popover_btn")) {
			const all_row_1_popover_btns = document.getElementsByClassName("row_1_popover_btn");
			for (const btn of [...all_row_1_popover_btns]) {
				if (btn != evt.target) {
					(btn.classList.contains("active") ? btn.classList.remove("active") : null);
				} else {
					btn.classList.toggle("active");
				}
			}
		} else if (evt.target.classList.contains("delete_item_confirm_btn")) {
			const opened_popover = document.getElementsByClassName("popover")[0];

			let delete_from = null;
			const all_row_1_popover_btns = document.getElementsByClassName("row_1_popover_btn");
			for (const btn of [...all_row_1_popover_btns]) {
				(btn.classList.contains("active") ? delete_from = btn.innerHTML : null);
			}
			if (!delete_from) {
				for (const btn of [...all_row_1_popover_btns]) {
					shake_element(btn);
				}
				return;
			} else {
				jQuery(opened_popover).popover("hide");
			}

			const item_id = evt.target.parentElement.parentElement.classList[0];
			const item_category = active_category;
			const item_type = document.getElementById(item_id).dataset.type;
			// console.log(item_id, item_category, item_type);

			if (delete_from == "eternity" || delete_from == "both") {
				const list_item = document.getElementById(item_id);
				list_item.innerHTML = "";
				list_item.removeAttribute("data-url");
				list_item.removeAttribute("data-type");
				list_item.className = "";
				list_item.classList.add("skeleton_item", "rounded", "mb-2");

				try {
					const ref = firebase_db.ref(firebase_db_instance, `${item_category}/items/${item_id}`);
					await firebase_db.remove(ref);
	
					list_item.remove();
					active_item_ids.splice(active_item_ids.indexOf(item_id), 1);
					delete data_in_use[item_category].items[item_id];
				} catch (err) {
					console.error(err);
				}
			}
			if (delete_from == "Reddit" || delete_from == "both") {
				socket.emit("delete item from reddit acc", item_id, item_category, item_type);
			}
		} else if (!evt.target.classList.contains("row_2_popover_btn") && document.getElementsByClassName("popover")[0] && document.getElementsByClassName("popover")[0].contains(evt.target)) {
			null;
		} else {
			jQuery("[data-toggle='popover']").popover("hide");
		}

		if (evt.target.parentElement == category_btn_group) {
			const selected_category = await new Promise((resolve, reject) => setTimeout(() => {
				let selected_category = null;
				for (const btn of [...category_btn_group.children]) {
					(btn.classList.contains("active") ? selected_category = btn.innerText : null);
				}
				resolve(selected_category);
			}, 100));
			if (selected_category != active_category) {
				active_category = selected_category;
				refresh_item_list();
				fill_subreddit_select();
			}
		} else if (evt.target.parentElement == type_btn_group) {
			const selected_type = await new Promise((resolve, reject) => setTimeout(() => {
				let selected_type = null;
				for (const btn of [...type_btn_group.children]) {
					(btn.classList.contains("active") ? selected_type = btn.innerText : null);
				}
				resolve(selected_type);
			}, 100));
			if (selected_type != active_type) {
				active_type = selected_type;
				refresh_item_list();
				fill_subreddit_select();
			}
		}

		if (evt.target.id == "refresh_btn") {
			new_data_alert_wrapper.classList.add("d-none");
			refresh_item_list();
			fill_subreddit_select();
		}
	});

	document.addEventListener("keydown", (evt) => {
		if (evt.key == "Escape") {
			jQuery("[data-toggle='popover']").popover("hide");
		}
		
		setTimeout(() => {
			const no_results = document.getElementsByClassName("no-results")[0];
			(no_results && !no_results.classList.contains("d-none") ? no_results.classList.add("d-none") : null);

			(typeof subreddit_select_dropdown != "number" && !subreddit_select_dropdown.classList.contains("show") ? subreddit_select_btn.blur() : null);
		}, 100);
	});

	search_input.addEventListener("keydown", (evt) => {
		if (evt.target.value.trim() == "") {
			return;
		}

		if (evt.key == "Enter") {
			active_search_str = evt.target.value.trim();
			refresh_item_list();
		}

		setTimeout(() => {
			if (active_search_str && evt.target.value.trim() == "") {
				active_search_str = "";
				refresh_item_list();
			}
		}, 100);
	});

	item_list.addEventListener("scroll", (evt) => jQuery("[data-toggle='popover']").popover("hide"));

	setTimeout(() => {
		subreddit_select_btn.addEventListener("click", (evt) => (!subreddit_select_dropdown.classList.contains("show") ? subreddit_select_btn.blur() : null));
	}, 1000);

	jQuery(subreddit_select).on("changed.bs.select", (evt, clicked_index, is_selected, previous_value) => refresh_item_list()); // https://developer.snapappointments.com/bootstrap-select/options/#events
}

socket.on("replace localhost with dev private ip", (dev_private_ip) => {
	const all_a_tags = document.getElementsByTagName("a");
	for (const a_tag of [...all_a_tags]) {
		a_tag.href = a_tag.href.replace("localhost", dev_private_ip);
	}
});

socket.on("update domain request info", (domain_request_info) => {
	last24hours_total_wrapper.innerHTML = domain_request_info.last24hours_total;
	last7days_total_wrapper.innerHTML = domain_request_info.last7days_total;
	last30days_total_wrapper.innerHTML = domain_request_info.last30days_total;

	last24hours_list_wrapper.innerHTML = "";
	last7days_list_wrapper.innerHTML = "";
	last30days_list_wrapper.innerHTML = "";

	list_domain_request_info(domain_request_info.last24hours_countries, last24hours_list_wrapper);
	list_domain_request_info(domain_request_info.last7days_countries, last7days_list_wrapper);
	list_domain_request_info(domain_request_info.last30days_countries, last30days_list_wrapper);
});

socket.on("update countdown", (countdown) => countdown_wrapper.innerHTML = countdown);

if (unlock_container) {
	socket.on("connect", () => {
		fetch(`${app_index}/unlock?username=${username}&socket_id=${socket.id}`, {
			method: "get"
		}).catch((err) => console.error(err));
	});

	socket.on("alert", (alert, msg, type) => {
		if (alert == "validate") {
			show_alert(validate_alert_wrapper, msg, type);
		} else if (alert == "submit") {
			show_alert(submit_alert_wrapper, msg, type);
		}
	});

	socket.on("allow agree and continue", () => {
		validate_btn.setAttribute("disabled", "");
		submit_btn.setAttribute("disabled", "");
		jQuery('[data-toggle="tooltip"]').tooltip("disable");
		agree_and_continue_btn.removeAttribute("disabled");
	});

	socket.on("reload", () => window.location.reload());
} else if (loading_container) {
	socket.on("connect", () => {
		fetch(`${app_index}/load?username=${username}&socket_id=${socket.id}`, {
			method: "get"
		}).catch((err) => console.error(err));
	});

	socket.on("update progress", (progress, complete) => {
		const progress_percentage = progress/complete * 100;
		progress_wrapper.innerHTML = Math.floor(progress_percentage);
		(progress_percentage == 100 ? setTimeout(() => window.location.reload(), 2000) : null);
	});
} else if (access_container) {
	socket.on("connect", async () => {
		fetch(`${app_index}/access?username=${username}&socket_id=${socket.id}`, {
			method: "get"
		}).catch((err) => console.error(err));
	
		setInterval(() => (last_updated_epoch ? last_updated_wrapper.innerHTML = time_since(last_updated_epoch) : null), 1000);

		try {
			[firebase_app, firebase_auth, firebase_db] = [(await import("https://www.gstatic.com/firebasejs/9.2.0/firebase-app.js")), (await import("https://www.gstatic.com/firebasejs/9.2.0/firebase-auth.js")), (await import("https://www.gstatic.com/firebasejs/9.2.0/firebase-database.js"))];
		} catch (err) {
			console.error(err);
		}
	});

	socket.on("store data", async (first_time, config, auth_token) => {
		try {
			firebase_app_instance = firebase_app.initializeApp(config);
			await firebase_auth.signInWithCustomToken(firebase_auth.getAuth(), auth_token);

			firebase_db_instance = firebase_db.getDatabase(firebase_app_instance);
			const ref = firebase_db.ref(firebase_db_instance); // root
			const snapshot = await firebase_db.get(ref);
			const data = snapshot.val();

			if (first_time) { // i.e., from route
				store_data(data, data_in_use);

				hide_skeleton_loading();
				refresh_item_list(true);
				fill_subreddit_select();
			} else { // from update_all
				store_data(data, data_pending_refresh);
	
				(new_data_alert_wrapper.classList.contains("d-none") ? new_data_alert_wrapper.classList.remove("d-none") : null);
				show_alert(new_data_alert_wrapper, '<span class="ml-1">new data available!</span><button id="refresh_btn" class="btn btn-sm btn-primary ml-2">refresh</button>', "primary");
			}
		} catch (err) {
			console.error(err);
		}
	});
	
	socket.on("store last updated epoch", (epoch) => last_updated_epoch = epoch);
}

function list_domain_request_info(countries, parent_ul) {
	if (countries.length == 0) {
		return;
	} else if (countries.length <= 3) {
		for (const country of countries) {
			parent_ul.insertAdjacentHTML("beforeend", `
				<li class="mt-n1">${country.clientCountryName}: ${country.requests}</li>
			`);
		}
	} else {
		for (const country of countries.slice(0, 3)) {
			parent_ul.insertAdjacentHTML("beforeend", `
				<li class="mt-n1">${country.clientCountryName}: ${country.requests}</li>
			`);
		}

		parent_ul.insertAdjacentHTML("beforeend", `
			<li class="mt-n1">${countries.length - 3} more</li>
		`);
	}
}

function time_since(epoch) {
	const now_epoch = Math.floor(Date.now() / 1000);
	const epoch_diff = now_epoch - epoch;

	if (epoch_diff/31536000 >= 1) {
		return Math.floor(epoch_diff/31536000)+"y";
	} else if (epoch_diff/2592000 >= 1) {
		return Math.floor(epoch_diff/2592000)+"m";
	} else if (epoch_diff/86400 >= 1) {
		return Math.floor(epoch_diff/86400)+"d";
	} else if (epoch_diff/3600 >= 1) {
		return Math.floor(epoch_diff/3600)+"h";
	} else if (epoch_diff/60 >= 1) {
		return Math.floor(epoch_diff/60)+"m";
	} else {
		return epoch_diff+"s";
	}
}

function epoch_to_formatted_datetime(epoch) {
	const formatted_datetime = new Date(epoch * 1000).toLocaleString("en-GB", {timeZone: "UTC", timeZoneName: "short", hour12: true}).toUpperCase().split("/").join("-").replace(",", "").replace(" AM", ":AM").replace(" PM", ":PM");
	return formatted_datetime;
}

function toggle_purge_warning() {
	purge_input.value = "";
	purge_warning.classList.toggle("d-none");
}

function hide_purge_warning() {
	purge_input.value = "";
	(!purge_warning.classList.contains("d-none") ? purge_warning.classList.add("d-none") : null);
}

async function purge() {
	toggle_purge_warning();
	purge_spinner_container.classList.toggle("d-none");

	try {
		const response = await fetch(`${app_index}/purge?username=${username}`, {
			method: "get"
		});
		const response_data = await response.text();

		if (response_data == "success") {
			setTimeout(() => window.location.href = app_index, 10000);
			
			purge_spinner_container.classList.toggle("d-none");
			redirect_notice.classList.toggle("d-none");

			let countdown = 10;
			setInterval(() => {
				redirect_countdown_wrapper.innerHTML = countdown--;
			}, 1000);
		} else {
			console.error(response_data);
		}
	} catch (err) {
		console.error(err);
	}
}

function shake_element(element) {
	element.classList.add("shake");
	setTimeout(() => element.classList.remove("shake"), 300);
}

function create_new_data_frame() {
	const data_frame = {
		saved: {
			items: {}, // posts, comments
			item_sub_icon_urls: {}
		},
		created: {
			items: {}, // posts, comments
			item_sub_icon_urls: {}
		},
		upvoted: {
			items: {}, // posts
			item_sub_icon_urls: {}
		},
		downvoted: {
			items: {}, // posts
			item_sub_icon_urls: {}
		},
		hidden: {
			items: {}, // posts
			item_sub_icon_urls: {}
		},
		awarded: {
			items: {}, // posts, comments
			item_sub_icon_urls: {}
		}
	};
	return data_frame;
}

function store_data(from_data, to_data) {
	for (const category in from_data) {
		if (from_data[category].items) {
			const sorted_items_entries = Object.entries(from_data[category].items).sort((a, b) => b[1].created_epoch - a[1].created_epoch); // sort by created_epoch, descending
			for (const entry of sorted_items_entries) {
				const item_key = entry[0];
				const item_value = entry[1];
		
				to_data[category].items[item_key] = item_value;
			}
		}

		if (from_data[category].item_sub_icon_urls) {
			const icon_urls_entries = Object.entries(from_data[category].item_sub_icon_urls);
			for (const entry of icon_urls_entries) {
				const icon_url_key = entry[0];
				const icon_url_value = entry[1];

				to_data[category].item_sub_icon_urls[icon_url_key.replace("|", "/")] = icon_url_value;
			}
		}
	}
}

function set_active_item_ids() { // filter ➔ set
	// filter by active_category and active_type
	if (active_type == "all") {
		active_item_ids = Object.keys(data_in_use[active_category].items);
	} else if (active_type == "posts" || active_type == "comments") {
		active_item_ids = [];
		const items_entries = Object.entries(data_in_use[active_category].items);
		for (const entry of items_entries) {
			const item_key = entry[0];
			const item_value = entry[1];

			(item_value.type == active_type.slice(0, -1) ? active_item_ids.push(item_key) : null);
		}
	}

	// filter by selected subreddit
	if (subreddit_select.value != "" && subreddit_select.value != "all") {
		const filtered_items = {};
		for (const item_id of active_item_ids) {
			filtered_items[item_id] = data_in_use[active_category].items[item_id];
		}
	
		active_item_ids = [];
		const items_entries = Object.entries(filtered_items);
		for (const entry of items_entries) {
			const item_key = entry[0];
			const item_value = entry[1];

			(item_value.sub == subreddit_select.value ? active_item_ids.push(item_key) : null);
		}
	}

	// filter by search string
	if (search_input.value.trim() != "") {
		const space_delimited_search_input = search_input.value.trim().split(" ").map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // escape regex special chars: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions

		const filtered_items = {};
		for (const item_id of active_item_ids) {
			filtered_items[item_id] = data_in_use[active_category].items[item_id];
		}
	
		active_item_ids = [];
		const items_entries = Object.entries(filtered_items);
		for (const entry of items_entries) {
			const item_key = entry[0];
			const item_value = entry[1];

			let num_matches = 0;
			for (const term of space_delimited_search_input) {
				const re = new RegExp(term, "i");
				(re.test(item_value.sub) || re.test(item_value.author) || re.test(item_value.content) ? num_matches++ : null);
			}
			(num_matches == space_delimited_search_input.length ? active_item_ids.push(item_key) : null);
		}
	}
}

function list_next_items(count) {
	if (active_type == "comments" && (active_category == "upvoted" || active_category == "downvoted" || active_category == "hidden")) {
		item_list.innerHTML = `<div class="list-group-item text-light lead">${active_category} comment data not provided by Reddit api</div>`;
		return;
	}

	const x = items_currently_listed + count;
	const max_items = active_item_ids.length;

	if (max_items == 0) {		
		item_list.innerHTML = '<div class="list-group-item text-light lead">no results</div>';
		return;
	}

	while (items_currently_listed < x && items_currently_listed < max_items) {
		const item_id = active_item_ids[items_currently_listed];
		const item = data_in_use[active_category].items[item_id];

		item_list.insertAdjacentHTML("beforeend", `
			<div id="${item_id}" class="list-group-item list-group-item-action text-left text-light p-1" data-url="${item.url}" data-type="${item.type}">
				<a href="https://www.reddit.com/${item.sub}" target="_blank"><img src="${data_in_use[active_category].item_sub_icon_urls[item.sub]}" class="rounded-circle${(data_in_use[active_category].item_sub_icon_urls[item.sub] == "#" ? "" : " border border-light")}"/></a><small><a href="https://www.reddit.com/${item.sub}" target="_blank"><b class="ml-2">${item.sub}</b></a> &bull; <a href="https://www.reddit.com/${item.author}" target="_blank">${item.author}</a> &bull; <i data-url="${item.url}" data-toggle="tooltip" data-placement="top" title="${epoch_to_formatted_datetime(item.created_epoch)}">${time_since(item.created_epoch)}</i></small>
				<p class="content_wrapper lead line_height_1 noto_sans m-0" data-url="${item.url}">${(item.type == "post" ? "<b>" : "<small>")}${item.content}${(item.type == "post" ? "</b>" : "</small>")}</p>
				<button type="button" class="delete_btn btn btn-sm btn-outline-secondary shadow-none border-0 py-0" data-toggle="popover" data-placement="right" data-title="delete item from" data-content='<div class="${item_id}"><div><span class="row_1_popover_btn btn btn-sm btn-primary float-left p-1">eternity</span><span class="row_1_popover_btn btn btn-sm btn-primary float-center p-1">Reddit</span><span class="row_1_popover_btn btn btn-sm btn-primary float-right p-1">both</span></div><div><span class="row_2_popover_btn btn btn-sm btn-secondary float-left mt-2">cancel</span><span class="row_2_popover_btn delete_item_confirm_btn btn btn-sm btn-danger float-right mt-2">confirm</span></div><div class="clearfix"></div></div>' data-html="true">delete</button> <button type="button" class="copy_link_btn btn btn-sm btn-outline-secondary shadow-none border-0 py-0">copy link</button>
			</div>
		`);

		(items_currently_listed == x-Math.floor(count/2)-1 ? observer.observe(document.getElementById(item_id)) : null);

		jQuery('[data-toggle="tooltip"]').tooltip("enable");
		jQuery('[data-toggle="popover"]').popover("enable");

		items_currently_listed++;
	}
}

function fill_subreddit_select() {
	subreddit_select.innerHTML = "<option>all</option>";

	const subs = [];
	if (active_type == "all") {
		for (const item in data_in_use[active_category].items) {
			(!subs.includes(data_in_use[active_category].items[item].sub) ? subs.push(data_in_use[active_category].items[item].sub) : null);
		}
	} else {
		for (const item in data_in_use[active_category].items) {
			(data_in_use[active_category].items[item].type == active_type.slice(0, -1) && !subs.includes(data_in_use[active_category].items[item].sub) ? subs.push(data_in_use[active_category].items[item].sub) : null);
		}
	}
	subs.sort();

	for (const sub of subs) {
		subreddit_select.insertAdjacentHTML("beforeend", `
			<option>${sub}</option>
		`);
	}
	jQuery(subreddit_select).selectpicker("refresh");
	jQuery(subreddit_select).selectpicker("render");

	subreddit_select_filled = true;
}

async function refresh_item_list(first_time=false) {
	if (!first_time) {
		const dpr_as_string = JSON.stringify(data_pending_refresh);
		if (dpr_as_string != JSON.stringify(create_new_data_frame())) {
			data_in_use = JSON.parse(dpr_as_string);
			data_pending_refresh = create_new_data_frame();
		}

		show_skeleton_loading();
		await new Promise((resolve, reject) => {
			let item_list_size = item_list.children.length;
			const interval_id = setInterval(() => {
				if (item_list.children.length > item_list_size) {
					item_list_size = item_list.children.length;
				} else {
					clearInterval(interval_id);
					hide_skeleton_loading();
					resolve();
				}
			}, 500);
		});
	}
	
	set_active_item_ids();
	list_next_items(25);
}

function show_skeleton_loading() {
	item_list.classList.add("d-none");
	skeleton_list.classList.remove("d-none");
	for (let i = 0; i < 7; i++) {
		skeleton_list.insertAdjacentHTML("beforeend", `
			<div class="skeleton_item rounded mb-2"></div>
		`);
	}
}

function hide_skeleton_loading() {
	skeleton_list.classList.add("d-none");
	skeleton_list.innerHTML = "";
	observer.disconnect(); // stops observing all currently observed elements. (does NOT stop the intersection observer. i.e., can still observe new elements)
	item_list.innerHTML = "";
	item_list.classList.remove("d-none");
	item_list.scrollTop = 0;
	items_currently_listed = 0;
}

function show_alert(alert_wrapper, message, type) {
	alert_wrapper.innerHTML = `
		<div id="alert" class="alert alert-${type} fade show text-center mb-0 p-1" role="alert">
			<span>${message}</span>
		</div>
	`;
}

function get_bootstrap_breakpoint() {
	const width = Math.max(document.documentElement.clientWidth, window.innerWidth);
	
	// https://getbootstrap.com/docs/4.6/layout/grid "grid options"
	if (width >= 1200) {
		return "xl";
	} else if (width >= 992) {
		return "lg";
	} else if (width >= 768) {
		return "md";
	} else if (width >= 576) {
		return "sm";
	} else {
		return "xs";
	}
}
console.log(get_bootstrap_breakpoint()); // TODO remove
