<script context="module">
	import * as globals from "frontend/source/globals.js";
	import * as utils from "frontend/source/utils.js";

	import * as svelte from "svelte";
	import xlsx from "xlsx";

	const globals_r = globals.readonly;
	const globals_w = globals.writable;
</script>
<script>
	export let username;
	export let show_data_anchors;
	export let show_return_to_app;

	let [
		settings_btn,
		settings_menu,
		import_anchor,
		import_notice,
		files_input,
		selected_files_list,
		import_cancel_btn,
		import_confirm_btn,
		export_anchor,
		new_tab_json,
		purge_anchor,
		purge_warning,
		purge_input,
		purge_cancel_btn,
		purge_confirm_btn,
		purge_spinner_container,
		redirect_notice,
		redirect_countdown_wrapper,
		modal
	] = [null];
	svelte.onMount(() => {
		if (!username) {
			return;
		}

		settings_btn.addEventListener("click", (evt) => {
			setTimeout(() => {
				if (!settings_menu.classList.contains("show")) {
					settings_btn.blur();
					hide_purge_warning();
					(show_data_anchors ? hide_import_notice() : null);
				}
			}, 100);
		});

		settings_menu.addEventListener("click", (evt) => {
			evt.stopPropagation();
		});

		purge_anchor.addEventListener("click", (evt) => {
			evt.preventDefault();
			toggle_purge_warning();
			(show_data_anchors ? hide_import_notice() : null);
		});

		purge_cancel_btn.addEventListener("click", (evt) => {
			evt.preventDefault();
			toggle_purge_warning();
		});

		purge_confirm_btn.addEventListener("click", (evt) => {
			evt.preventDefault();
			(purge_input.value == `purge u/${username}` ? purge() : utils.shake_element(purge_input));
		});

		purge_input.addEventListener("keydown", (evt) => {
			if (evt.key == "Enter") {
				evt.preventDefault();
				(purge_input.value == `purge u/${username}` ? purge() : utils.shake_element(purge_input));
			}
		});

		if (!show_data_anchors) {
			return;
		}

		import_anchor.addEventListener("click", (evt) => {
			evt.preventDefault();
			hide_purge_warning();
			toggle_import_notice();
		});

		import_cancel_btn.addEventListener("click", (evt) => {
			evt.preventDefault();
			toggle_import_notice();
		});

		import_confirm_btn.addEventListener("click", async (evt) => {
			evt.preventDefault();

			selected_files_list.innerHTML = "";
			if (files_input.files.length == 0) {
				selected_files_list.insertAdjacentHTML("beforeend", `
					<li class="mb-1"><b class="text-danger">NO FILE(S) SELECTED</b></li>
				`);
				return;
			} else {
				selected_files_list.insertAdjacentHTML("beforeend", `
					<li class="mb-1"><b class="text-danger">PREPARING IMPORT. DO NOT CLOSE OR NAVIGATE AWAY FROM THIS PAGE UNTIL IT'S READY. YOU WILL KNOW WHEN YOU SEE A MODAL (POPUP)</b></li>
				`);
			}

			const item_fns = {
				saved: [],
				created: [],
				upvoted: [],
				downvoted: [],
				hidden: null
			};

			for (let i = 0; i < files_input.files.length; i++) {
				const file = files_input.files[i];
				// console.log(file);

				const csv = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.readAsBinaryString(file);
					reader.onloadend = function (evt) {
						const options = {
							type: "binary"
						};
						resolve(xlsx.read(evt.target.result, options));
					}
					reader.onerror = function (evt) {
						reject(reader.error);
					}
				});
				const sheet_list = csv.SheetNames;
				const sheet = csv.Sheets[sheet_list[0]];
				const objs_arr = xlsx.utils.sheet_to_json(sheet);
				// console.log(objs_arr);

				switch (file.name) {
					case "saved_posts.csv":
						item_fns.saved.push(...(objs_arr.map((obj) => `t3_${obj.id}`)));
						break;
					case "saved_comments.csv":
						item_fns.saved.push(...(objs_arr.map((obj) => `t1_${obj.id}`)));
						break;
					case "posts.csv":
						item_fns.created.push(...(objs_arr.map((obj) => `t3_${obj.id}`)));
						break;
					case "comments.csv":
						item_fns.created.push(...(objs_arr.map((obj) => `t1_${obj.id}`)));
						break;
					case "post_votes.csv":
						for (const obj of objs_arr) {
							(obj.direction == "none" ? null : item_fns[`${obj.direction}voted`].push(`t3_${obj.id}`));
						}
						break;
					case "hidden_posts.csv":
						item_fns.hidden = objs_arr.map((obj) => `t3_${obj.id}`);
						break;
					default:
						break;
				}
			}

			const updates = {};
			for (const category in item_fns) {
				if (item_fns[category] && item_fns[category].length != 0) {
					for (const fn of item_fns[category]) {
						updates[`${category}/item_fns_to_import/${fn}`] = fn;
					}
				}
			}
			const ref = $globals_w.firebase_db.ref().root;
			await ref.update(updates);

			jQuery(modal).modal("show");
		});

		files_input.addEventListener("input", (evt) => {
			selected_files_list.innerHTML = "";

			for (let i = 0; i < files_input.files.length; i++) {
				const file = files_input.files[i];
				const filename = file.name;
				const filesize = file.size; // in binary bytes
				const filesize_limit = 10485760; // 10mb in binary bytes

				switch (filename) {
					case "saved_posts.csv":
					case "saved_comments.csv":
					case "posts.csv":
					case "comments.csv":
					case "post_votes.csv":
					case "hidden_posts.csv":
						selected_files_list.insertAdjacentHTML("beforeend", `
							<li class="mb-1"><b><code class="text-dark">${filename}</code></b></li>
						`);
						break;
					default:
						reset_import_notice();
						selected_files_list.insertAdjacentHTML("beforeend", `
							<li class="mb-1"><b class="text-danger">UNALLOWED FILE SELECTED. PLEASE TRY AGAIN</b></li>
						`);
						return;
				}

				if (filesize > filesize_limit) {
					reset_import_notice();
					selected_files_list.insertAdjacentHTML("beforeend", `
						<li class="mb-1"><b class="text-danger">PER-FILE SIZE LIMIT IS 10mb</b></li>
					`);
					return;
				}
			}
		});

		export_anchor.addEventListener("click", async (evt) => {
			evt.preventDefault();
			
			try {
				const id_token = await $globals_w.firebase_auth.currentUser.getIdToken();
				new_tab_json.href = `${$globals_w.firebase_app.options.databaseURL}/.json?print=pretty&auth=${id_token}`;
				new_tab_json.click();
			} catch (err) {
				console.error(err);
			}
		});
	});

	function handle_window_click(evt) {
		if (!username) {
			return;
		}

		setTimeout(() => {
			if (!settings_menu.classList.contains("show")) {
				hide_purge_warning();
				(show_data_anchors ? hide_import_notice() : null);
			}
		}, 100);
	}

	function handle_window_keydown(evt) {
		if (!username) {
			return;
		}

		if (evt.key == "Escape") {
			setTimeout(() => {
				if (!settings_menu.classList.contains("show")) {
					settings_btn.blur();
					hide_purge_warning();
					(show_data_anchors ? hide_import_notice() : null);
				}
			}, 100);
		}
	}

	function toggle_import_notice() {
		reset_import_notice();
		import_notice.classList.toggle("d-none");
	}

	function hide_import_notice() {
		reset_import_notice();
		(!import_notice.classList.contains("d-none") ? import_notice.classList.add("d-none") : null);
	}

	function reset_import_notice() {
		files_input.files = new DataTransfer().files;
		selected_files_list.innerHTML = "";
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
			const response = await fetch(`${globals_r.backend}/purge?&socket_id=${globals_r.socket.id}`, {
				method: "get"
			});
			const response_data = await response.text();

			if (response_data == "success") {
				setTimeout(() => {
					location.reload();
				}, 10000);
				
				purge_spinner_container.classList.toggle("d-none");
				redirect_notice.classList.toggle("d-none");

				let countdown = 10;
				setInterval(() => {
					redirect_countdown_wrapper.innerHTML = --countdown;
				}, 1000);
			} else {
				console.error(response_data);
			}
		} catch (err) {
			console.error(err);
		}
	}
</script>

<svelte:window on:click={handle_window_click} on:keydown={handle_window_keydown}/>
<nav class="mt-5 px-5">
	{#if username}
		<span class="float-right">
			<a href="https://www.reddit.com/u/{username}" target="_blank">u/<span id="username_wrapper">{username}</span></a>
			<div class="btn-group dropdown">
				<button bind:this={settings_btn} type="button" class="btn btn-link pl-1 py-0" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" data-display="static" id="settings_btn"><i class="fas fa-cog"></i></button>
				<div bind:this={settings_menu} class="dropdown-menu dropdown-menu-right text-center mr-2 px-2 py-0" id="settings_menu">
					<a href="{globals_r.backend}/logout">logout</a>
					<div class="dropdown-divider m-0"></div>
					{#if show_data_anchors}
						<a bind:this={import_anchor} href="#">import data</a>
						<div bind:this={import_notice} class="bg-info rounded text-light text-left line_height_1 mb-2 pb-1 d-none">
							<p class="mx-1">import data that you downloaded from <a href="https://www.reddit.com/settings/data-request" target="_blank" class="text-dark">Reddit data request</a></p>
							<p class="mx-1">extract the zip, then select the files you want to import out of the following::</p>
							<ul class="mt-n3 ml-3 pl-3 pr-0">
								<li><code class="text-dark">saved_posts.csv</code></li>
								<li><code class="text-dark">saved_comments.csv</code></li>
								<li><code class="text-dark">posts.csv</code></li>
								<li><code class="text-dark">comments.csv</code></li>
								<li><code class="text-dark">post_votes.csv</code></li>
								<li><code class="text-dark">hidden_posts.csv</code></li>
							</ul>
							<hr class="bg-muted mx-2 mb-2 mt-n2"/>
							<form>
								<div class="form-group d-flex justify-content-center mb-0">
									<input bind:this={files_input} type="file" accept=".csv" class="form-control-file" id="files_input" style="display:none" multiple/>
									<label for="files_input" class="btn btn-outline-secondary border-dark bg-light text-dark py-0" id="files_input_btn">browse files</label>
								</div>
								<ul bind:this={selected_files_list} class="mb-0 ml-3 pl-3 pr-0"></ul>
								<hr class="bg-muted mx-2 mb-2 mt-0"/>
								<button bind:this={import_cancel_btn} class="btn btn-sm btn-secondary float-left ml-1">cancel</button><button bind:this={import_confirm_btn} class="btn btn-sm btn-secondary float-right mr-1">confirm</button>
								<div class="clearfix"></div>
							</form>
						</div>
						<div class="dropdown-divider m-0"></div>
						<a bind:this={export_anchor} href="#">export data</a>
						<a bind:this={new_tab_json} href="#" target="_blank" class="d-none"></a>
						<div class="dropdown-divider m-0"></div>
					{/if}
					<a bind:this={purge_anchor} href="#">purge account</a>
					<div bind:this={purge_warning} class="bg-danger rounded text-light text-left line_height_1 mb-2 pb-1 d-none">
						<p class="mx-1">are you sure you want to purge your account?</p>
						<p class="mx-1">your data will stop being archived by eternity and cannot be restored</p>
						<p class="mx-1">this does not affect your Reddit account/data in any way</p>
						<p class="mx-1 mb-0">type <b>purge u/{username}</b> to confirm</p>
						<form>
							<div class="form-group d-flex justify-content-center mb-1">
								<input bind:this={purge_input} class="form-control form-control-sm" type="text" id="purge_input"/>
							</div>
							<button bind:this={purge_cancel_btn} class="btn btn-sm btn-secondary float-left ml-1">cancel</button><button bind:this={purge_confirm_btn} class="btn btn-sm btn-secondary float-right mr-1">confirm</button>
							<div class="clearfix"></div>
						</form>
					</div>
					<div bind:this={purge_spinner_container} class="rounded my-2 py-5 d-none" id="purge_spinner_container">
						<div class="spinner-border text-secondary" role="status"><span class="sr-only">loading...</span></div>
					</div>
					<div bind:this={redirect_notice} class="rounded line_height_1 my-2 d-none" id="redirect_notice">
						<p>your account has been successfully purged from eternity</p>
						<p class="mb-0">you will be automatically redirected in <b bind:this={redirect_countdown_wrapper}>?</b>s</p>
					</div>
				</div>
			</div>
		</span>
	{:else if show_return_to_app}
		<span class="float-right">
			<a href="/">return to app</a>
		</span>
	{/if}
	<div class="clearfix"></div>
</nav>
{#if show_data_anchors}
	<div bind:this={modal} class="modal fade" tabindex="-1">
		<div class="modal-dialog modal-lg">
			<div class="modal-content bg-secondary">
				<div class="modal-header">
					<h5 class="modal-title">IMPORT STARTED</h5>
					<button type="button" class="close" data-dismiss="modal"><span>&times;</span></button>
				</div>
				<div class="modal-body">
					<span>IMPORT STARTED. IT MAY TAKE UP TO A DAY TO COMPLETE. DO NOT TRY TO RE-IMPORT IF YOU DON'T SEE ALL THE ITEMS IN ETERNITY IMMEDIATELY. YOU CAN CLOSE/LEAVE THIS PAGE NOW</span>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-light" data-dismiss="modal">ok</button>
				</div>
			</div>
		</div>
	</div>
{/if}
