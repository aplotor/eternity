<script context="module">
	import * as globals from "frontend/source/globals.js";
	import * as utils from "frontend/source/utils.js";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
</script>
<script>
	export let username;
	export let show_export_data;
	export let firebase_auth_instance;
	export let firebase_db_url;
	export let show_return_to_app;

	let [
		settings_btn,
		settings_menu,
		export_anchor,
		new_tab_json,
		purge_anchor,
		purge_warning,
		purge_input,
		purge_cancel_btn,
		purge_confirm_btn,
		purge_spinner_container,
		redirect_notice,
		redirect_countdown_wrapper
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
				}
			}, 100);
		});

		settings_menu.addEventListener("click", (evt) => {
			evt.stopPropagation();
		});

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
			(purge_input.value == `purge u/${username}` ? purge() : utils.shake_element(purge_input));
		});

		purge_input.addEventListener("keydown", (evt) => {
			if (evt.key == "Enter") {
				evt.preventDefault();
				(purge_input.value == `purge u/${username}` ? purge() : utils.shake_element(purge_input));
			}
		});

		if (!export_anchor) {
			return;
		}

		export_anchor.addEventListener("click", async (evt) => {
			evt.preventDefault();
			
			try {
				const id_token = await firebase_auth_instance.currentUser.getIdToken();
				new_tab_json.href = `${firebase_db_url}/.json?print=pretty&auth=${id_token}`;
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
			(!settings_menu.classList.contains("show") ? hide_purge_warning() : null);
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
				}
			}, 100);
		}
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
	<span>
		<a href={globals_r.j9108c_url}>index</a>
		<span class="consolas mx-1">/</span>
		<a href="{globals_r.j9108c_url}/apps">apps</a>
		<span class="consolas mx-1">/</span>
		<a class="boxed px-1" href="/">{globals_r.app_name}</a>
	</span>
	{#if username}
		<span class="float-right">
			<a href="https://www.reddit.com/u/{username}" target="_blank">u/<span id="username_wrapper">{username}</span></a>
			<div class="btn-group dropdown">
				<button bind:this={settings_btn} type="button" class="btn btn-link pl-1 py-0" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" data-display="static" id="settings_btn"><i class="fas fa-cog"></i></button>
				<div bind:this={settings_menu} class="dropdown-menu dropdown-menu-right text-center mr-2 px-2 py-0" id="settings_menu">
					<a href="{globals_r.backend}/logout">logout</a>
					<div class="dropdown-divider m-0"></div>
					{#if show_export_data}
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
</nav>
