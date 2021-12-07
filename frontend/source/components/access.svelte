<script context="module">
	import * as globals from "frontend/source/globals.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";
	import firebase from "firebase";

	const globals_r = globals.readonly;
</script>
<script>
	export let username;

	let firebase_app_instance = null;
	let firebase_auth_instance = null;
	let firebase_db_instance = null;

	let data_in_use = create_new_data_frame();
	let data_pending_refresh = create_new_data_frame();
	let last_updated_epoch = null;

	let active_category = "saved";
	let active_type = "all";
	let active_search_str = null;
	let active_item_ids = null; // active as in all currently avail items; not items currently displayed
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
		root: item_list,
		rootMargin: "0px",
		threshold: 0
	});
	
	let [
		last_updated_wrapper,
		search_input,
		subreddit_select,
		subreddit_select_btn,
		subreddit_select_dropdown,
		category_btn_group,
		type_btn_group,
		// item_list,
		skeleton_list,
		new_data_alert_wrapper
	] = [null];
	svelte.onMount(async () => {
		globals_r.socket.emit("page switch", "access");

		globals_r.socket.on("store data", async (first_time, config, auth_token) => {
			try {
				(!first_time ? await firebase_app_instance.delete() : null); // deletes instance from memory; does not actually delete anything else

				firebase_app_instance = firebase.initializeApp(config);
				firebase_auth_instance = firebase.auth(firebase_app_instance);
				await firebase_auth_instance.signInWithCustomToken(auth_token);

				firebase_db_instance = firebase.database(firebase_app_instance);
				const ref = firebase_db_instance.ref().root;
				const snapshot = await ref.get();
				const data = snapshot.val();

				if (first_time) { // i.e., from "page switch"
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
		
		globals_r.socket.on("store last updated epoch", (epoch) => {
			last_updated_epoch = epoch;
		});
		
		setInterval(() => {
			(last_updated_epoch ? last_updated_wrapper.innerHTML = time_since(last_updated_epoch) : null);
		}, 1000);

		jQuery(subreddit_select).selectpicker();
		subreddit_select_btn = document.getElementsByClassName("bs-placeholder")[0];
		subreddit_select_dropdown = document.getElementsByClassName("bootstrap-select")[0];

		jQuery(subreddit_select).on("changed.bs.select", (evt, clicked_index, is_selected, previous_value) => { // https://developer.snapappointments.com/bootstrap-select/options/#events
			refresh_item_list();
		});

		subreddit_select_btn.addEventListener("click", (evt) => {
			(!subreddit_select_dropdown.classList.contains("show") ? subreddit_select_btn.blur() : null);
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

		item_list.addEventListener("scroll", (evt) => {
			jQuery("[data-toggle='popover']").popover("hide");
		});

		
	});
	svelte.onDestroy(() => {
		globals_r.socket.off("store data");
		globals_r.socket.off("store last updated epoch");
	});

	async function handle_window_click(evt) {
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
					const ref = firebase_db_instance.ref(`${item_category}/items/${item_id}`);
					await ref.remove();
	
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
	}

	function handle_window_keydown(evt) {
		if (evt.key == "Escape") {
			jQuery("[data-toggle='popover']").popover("hide");
		}
		
		setTimeout(() => {
			const no_results = document.getElementsByClassName("no-results")[0];
			(no_results && !no_results.classList.contains("d-none") ? no_results.classList.add("d-none") : null);

			(typeof subreddit_select_dropdown != "number" && !subreddit_select_dropdown.classList.contains("show") ? subreddit_select_btn.blur() : null);
		}, 100);
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

	function shake_element(element) {
		element.classList.add("shake");
		setTimeout(() => {
			element.classList.remove("shake");
		}, 300);
	}

	function show_alert(alert_wrapper, message, type) {
		alert_wrapper.innerHTML = `
			<div id="alert" class="alert alert-${type} fade show text-center mb-0 p-1" role="alert">
				<span>${message}</span>
			</div>
		`;
	}
</script>

<svelte:window on:click={handle_window_click} on:keydown={handle_window_keydown}/>
<Navbar username={username} show_export_data={true}/>
<div class="text-center mt-3">
	<h1 class="display-4">{globals_r.app_name}</h1>
	<span>last updated: <b bind:this={last_updated_wrapper}>?</b> ago</span>
	<div class="d-flex justify-content-center">
		<div bind:this={new_data_alert_wrapper} class="px-1 d-none"></div>
	</div>
	<div id="access_container" class="card card-body bg-dark mt-3 pb-3">
		<form>
			<div class="form-row d-flex justify-content-center">
				<div bind:this={category_btn_group} class="btn-group btn-group-toggle flex-wrap" data-toggle="buttons">
					<label class="btn btn-secondary shadow-none active"><input type="radio" name="options"/>saved</label>
					<label class="btn btn-secondary shadow-none"><input type="radio" name="options"/>created</label>
					<label class="btn btn-secondary shadow-none"><input type="radio" name="options"/>upvoted</label>
					<label class="btn btn-secondary shadow-none"><input type="radio" name="options"/>downvoted</label>
					<label class="btn btn-secondary shadow-none"><input type="radio" name="options"/>hidden</label>
				</div>
			</div>
			<div class="form-row d-flex justify-content-center mt-2">
				<div bind:this={type_btn_group} class="btn-group btn-group-toggle flex-wrap" data-toggle="buttons">
					<label class="btn btn-secondary shadow-none"><input type="radio" name="options"/>posts</label>
					<label class="btn btn-secondary shadow-none"><input type="radio" name="options"/>comments</label>
					<label class="btn btn-secondary shadow-none active"><input type="radio" name="options"/>all</label>
				</div>
			</div>
			<div class="form-row mt-2">
				<div class="form-group col-12 col-sm-8 mb-0">
					<input bind:this={search_input} type="text" class="form-control bg-light" placeholder="search"/>
				</div>
				<div class="form-group col-12 col-sm-4 mb-0">
					<select bind:this={subreddit_select} class="selectpicker form-control" data-width="false" data-size="10" data-live-search="true" title="in subreddit: all">
						<option>all</option>
					</select>
				</div>
			</div>
		</form>
	</div>
	<div class="card card-body bg-dark border-top-0 mt-n2 pt-0 pb-2 pr-2">
		<div bind:this={item_list} class="list-group list-group-flush border-0 d-none" id="item_list"></div>
		<div bind:this={skeleton_list} class="list-group" id="skeleton_list">
			<!-- TODO use svelte foreach ? -->
			<div class="skeleton_item rounded mb-2"></div>
			<div class="skeleton_item rounded mb-2"></div>
			<div class="skeleton_item rounded mb-2"></div>
			<div class="skeleton_item rounded mb-2"></div>
			<div class="skeleton_item rounded mb-2"></div>
			<div class="skeleton_item rounded mb-2"></div>
			<div class="skeleton_item rounded mb-2"></div>
		</div>
	</div>
</div>
