<script context="module">
	import * as globals from "frontend/source/globals.js";
	import * as utils from "frontend/source/utils.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
	const globals_w = globals.writable;
</script>
<script>
	export let username;

	let last_updated_epoch = null;
	
	let active_data = { // active_category data ONLY
		items: {},
		item_sub_icon_urls: {}
	};
	let active_category = "saved";
	let active_type = "all";
	let active_search_str = null;
	let active_item_ids = null; // ids of filtered items (by selected type, subreddit, and search string). only these items will be listed in item_list from active_data
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
		skeleton_list,
		new_data_alert_wrapper
	] = [];
	svelte.onMount(async () => {
		globals_r.socket.emit("page switch", "access");
		
		globals_r.socket.on("store last updated epoch", (epoch) => {
			last_updated_epoch = epoch;
		});

		globals_r.socket.on("show refresh alert", (categories_w_new_data) => {
			for (const category of categories_w_new_data) {
				if (category == active_category) {
					(new_data_alert_wrapper.classList.contains("d-none") ? new_data_alert_wrapper.classList.remove("d-none") : null);
					utils.show_alert(new_data_alert_wrapper, '<span class="ml-1">new data available!</span><button id="refresh_btn" class="btn btn-sm btn-primary ml-2">refresh</button>', "primary");
					break;
				}
			}
		});

		setInterval(() => {
			(last_updated_epoch ? last_updated_wrapper.innerHTML = utils.time_since(last_updated_epoch) : null);
		}, 1000);

		try {
			await new Promise((resolve, reject) => {
				const interval_id = setInterval(() => {
					if ($globals_w.firebase_app && $globals_w.firebase_auth && $globals_w.firebase_db) {
						clearInterval(interval_id);
						resolve();
					}
				}, 100);
			});

			await get_parse_set_data();
			refresh_item_list();
			hide_skeleton_loading();
			fill_subreddit_select();
		} catch (err) {
			console.error(err);
		}

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

			switch (evt.key) {
				case "Enter":
					active_search_str = evt.target.value.trim();
					refresh_item_list();
					break;
				case "Escape":
					evt.target.value = "";
					active_search_str = "";
					refresh_item_list();
					break;
				default:
					setTimeout(() => {
						if (active_search_str && evt.target.value.trim() == "") {
							active_search_str = "";
							refresh_item_list();
						}
					}, 100);
					break;
			}
		});

		item_list.addEventListener("scroll", (evt) => {
			jQuery("[data-toggle='popover']").popover("hide");
		});

		
	});
	svelte.onDestroy(() => {
		globals_r.socket.off("store last updated epoch");
		globals_r.socket.off("show refresh alert");
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
					utils.shake_element(btn);
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
					const ref = $globals_w.firebase_db.ref(`${item_category}/items/${item_id}`);
					await ref.remove();
	
					list_item.remove();
					active_item_ids.splice(active_item_ids.indexOf(item_id), 1);
					delete active_data.items[item_id];
				} catch (err) {
					console.error(err);
				}
			}
			if (delete_from == "Reddit" || delete_from == "both") {
				globals_r.socket.emit("delete item from reddit acc", item_id, item_category, item_type);
			}
		} else if (!evt.target.classList.contains("row_2_popover_btn") && document.getElementsByClassName("popover")[0] && document.getElementsByClassName("popover")[0].contains(evt.target)) {
			null;
		} else {
			jQuery("[data-toggle='popover']").popover("hide");
		}

		if (evt.target.parentElement == category_btn_group) {
			const selected_category = await new Promise((resolve, reject) => setTimeout(() => {
				let category = null;
				for (const btn of [...category_btn_group.children]) {
					(btn.classList.contains("active") ? category = btn.innerText : null);
				}
				resolve(category);
			}, 100));
			if (selected_category != active_category) {
				active_category = selected_category;
				show_skeleton_loading();
				try {
					await get_parse_set_data();
				} catch (err) {
					console.error(err);
				}
				refresh_item_list();
				hide_skeleton_loading();
				fill_subreddit_select();
			}
		} else if (evt.target.parentElement == type_btn_group) {
			const selected_type = await new Promise((resolve, reject) => setTimeout(() => {
				let type = null;
				for (const btn of [...type_btn_group.children]) {
					(btn.classList.contains("active") ? type = btn.innerText : null);
				}
				resolve(type);
			}, 100));
			if (selected_type != active_type) {
				active_type = selected_type;
				refresh_item_list();
				fill_subreddit_select();
			}
		}

		if (evt.target.id == "refresh_btn") {
			new_data_alert_wrapper.classList.add("d-none");
			show_skeleton_loading();
			try {
				await get_parse_set_data();
			} catch (err) {
				console.error(err);
			}
			refresh_item_list();
			hide_skeleton_loading();
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

	async function get_parse_set_data() {
		active_data.items = {};
		active_data.item_sub_icon_urls = {};

		const ref = $globals_w.firebase_db.ref(active_category);
		const snapshot = await ref.get();
		const data = snapshot.val();

		if (!data) {
			return;
		} else {
			if (data.items) {
				const sorted_items_entries = Object.entries(data.items).sort((a, b) => b[1].created_epoch - a[1].created_epoch); // sort by created_epoch, descending
				for (const entry of sorted_items_entries) {
					const item_key = entry[0];
					const item_value = entry[1];
			
					active_data.items[item_key] = item_value;
				}
			}

			if (data.item_sub_icon_urls) {
				const icon_urls_entries = Object.entries(data.item_sub_icon_urls);
				for (const entry of icon_urls_entries) {
					const icon_url_key = entry[0];
					const icon_url_value = entry[1];

					active_data.item_sub_icon_urls[icon_url_key.replace("|", "/").replace(",", ".")] = icon_url_value;
				}
			}	
		}
	}

	function show_skeleton_loading() {
		item_list.scrollTop = 0;
		item_list.classList.add("d-none");
		skeleton_list.classList.remove("d-none");
	}

	function refresh_item_list() {
		observer.disconnect(); // stops observing all currently observed elements. (does NOT stop the intersection observer. i.e., can still observe new elements)
		item_list.innerHTML = "";
		item_list.scrollTop = 0;
		items_currently_listed = 0;

		set_active_item_ids();
		list_next_items(25);
	}

	function hide_skeleton_loading() {
		skeleton_list.classList.add("d-none");
		item_list.classList.remove("d-none");
		item_list.scrollTop = 0;
	}

	function set_active_item_ids() { // filter ➔ set
		// filter by active_type
		if (active_type == "all") {
			active_item_ids = Object.keys(active_data.items);
		} else if (active_type == "posts" || active_type == "comments") {
			active_item_ids = [];
			const items_entries = Object.entries(active_data.items);
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
				filtered_items[item_id] = active_data.items[item_id];
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
				filtered_items[item_id] = active_data.items[item_id];
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
			const item = active_data.items[item_id];

			item_list.insertAdjacentHTML("beforeend", `
				<div id="${item_id}" class="list-group-item list-group-item-action text-left text-light p-1" data-url="${item.url}" data-type="${item.type}">
					<a href="https://www.reddit.com/${item.sub}" target="_blank"><img src="${active_data.item_sub_icon_urls[item.sub]}" class="rounded-circle${(active_data.item_sub_icon_urls[item.sub] == "#" ? "" : " border border-light")}"/></a><small><a href="https://www.reddit.com/${item.sub}" target="_blank"><b class="ml-2">${item.sub}</b></a> &bull; <a href="https://www.reddit.com/${item.author}" target="_blank">${item.author}</a> &bull; <i data-url="${item.url}" data-toggle="tooltip" data-placement="top" title="${utils.epoch_to_formatted_datetime(item.created_epoch)}">${utils.time_since(item.created_epoch)}</i></small>
					<p class="content_wrapper lead line_height_1 noto_sans m-0" data-url="${item.url}">${(item.type == "post" ? "<b>" : "<small>")}${item.content.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}${(item.type == "post" ? "</b>" : "</small>")}</p>
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
			for (const item in active_data.items) {
				(!subs.includes(active_data.items[item].sub) ? subs.push(active_data.items[item].sub) : null);
			}
		} else {
			for (const item in active_data.items) {
				(active_data.items[item].type == active_type.slice(0, -1) && !subs.includes(active_data.items[item].sub) ? subs.push(active_data.items[item].sub) : null);
			}
		}
		subs.sort((a, b) => a.localeCompare(b, "en"));

		for (const sub of subs) {
			subreddit_select.insertAdjacentHTML("beforeend", `
				<option>${sub}</option>
			`);
		}
		jQuery(subreddit_select).selectpicker("refresh");
		jQuery(subreddit_select).selectpicker("render");
	}
</script>

<svelte:window on:click={handle_window_click} on:keydown={handle_window_keydown}/>
<Navbar username={username} show_data_anchors={true}/>
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
			{#each {length: 7} as _, idx}
				<div class="skeleton_item rounded mb-2"></div>
			{/each}
		</div>
	</div>
</div>
