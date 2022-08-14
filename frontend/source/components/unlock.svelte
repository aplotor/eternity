<script context="module">
	import * as globals from "frontend/source/globals.js";
	import * as utils from "frontend/source/utils.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
</script>
<script>
	export let username;

	const dispatch = svelte.createEventDispatcher();
	
	let [
		instruction_video_anchor,
		instruction_video_wrapper,
		config_input,
		file_input,
		file_input_label,
		validate_btn,
		validate_alert_wrapper,
		email_input,
		verify_btn,
		verify_alert_wrapper,
		save_and_continue_btn_wrapper,
		save_and_continue_btn
	] = [];
	svelte.onMount(() => {
		globals_r.socket.emit("page switch", "unlock");

		globals_r.socket.on("alert", (alert, msg, type) => {
			switch (alert) {
				case "validate":
					utils.show_alert(validate_alert_wrapper, msg, type);
					break;
				case "verify":
					utils.show_alert(verify_alert_wrapper, msg, type);
					break;
				default:
					break;
			}
		});

		globals_r.socket.on("disable button", (button) => {
			switch (button) {
				case "validate":
					validate_btn.setAttribute("disabled", "");
					break;
				case "verify":
					verify_btn.setAttribute("disabled", "");
					break;
				default:
					break;
			}
		});

		globals_r.socket.on("allow save and continue", () => {
			jQuery('[data-toggle="tooltip"]').tooltip("disable");
			save_and_continue_btn.removeAttribute("disabled");
		});

		globals_r.socket.on("switch page to loading", () => {
			dispatch("dispatch", "switch page to loading");
		});

		globals_r.socket.on("emit back encrypted token", (encrypted_token) => {
			globals_r.socket.emit("verify token", encrypted_token);
		});

		jQuery('[data-toggle="tooltip"]').tooltip("enable");

		instruction_video_anchor.addEventListener("click", (evt) => {
			evt.preventDefault();
			instruction_video_wrapper.classList.toggle("d-none");
		});

		file_input.addEventListener("input", (evt) => {
			file_input_label.innerText = file_input.files[0].name;
		});

		config_input.addEventListener("keydown", (evt) => {
			switch (evt.key) {
				case "Enter":
					validate_btn.click();
					break;
				case "Tab":
					evt.preventDefault();
					email_input.focus();
					break;
				default:
					break;
			}
		});

		validate_btn.addEventListener("click", (evt) => {
			if (!config_input.value) {
				utils.show_alert(validate_alert_wrapper, "provide the web app config", "warning");
				return;
			}

			let web_app_config = null;
			try {
				web_app_config = JSON.parse(config_input.value.replace(/(\s)/g, "").replace(";", "").replace("{", '{"').replaceAll(':"', '":"').replaceAll('",', '","'));
			} catch (err) {
				console.error(err);
				utils.show_alert(validate_alert_wrapper, "this is not a Firebase web app config", "danger");
				return;
			}

			if (!file_input.value) {
				utils.show_alert(validate_alert_wrapper, "provide the service account key file", "warning");
				return;
			}

			const file = file_input.files[0];
			const filename = file.name;
			const filesize = file.size; // in binary bytes
			const filesize_limit = 3072; // 3kb in binary bytes. firebase service account key files should be ~2.3kb

			if (filename.split(".").pop().toLowerCase() != "json" || filesize > filesize_limit) {
				utils.show_alert(validate_alert_wrapper, "this is not a Firebase service account key file", "danger");
				return;
			}

			const data = new FormData();
			data.append("file", file);

			const request = new XMLHttpRequest();
			request.open("post", `${globals_r.backend}/upload`);
			request.responseType = "json";

			request.addEventListener("error", (evt) => {
				utils.show_alert(validate_alert_wrapper, "save error", "danger");
			});

			request.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
					utils.show_alert(validate_alert_wrapper, '<div class="d-flex justify-content-center pt-1"><div class="dot-carousel mr-4"></div><span class="mt-n1">validating key and database</span><div class="dot-carousel ml-4"></div></div>', "success");

					setTimeout(() => {
						globals_r.socket.emit("validate firebase info", web_app_config);
					}, 2000);
				}
			}
		
			request.send(data);
		});

		email_input.addEventListener("keydown", (evt) => {
			(evt.key == "Enter" ? verify_btn.click() : null);
		});

		verify_btn.addEventListener("click", (evt) => {
			const email = email_input.value.trim();

			if (!(email && email.includes("@") && email.includes(".") && email.length >= 7)) {
				utils.show_alert(verify_alert_wrapper, "this is not an email address", "warning");
				return;
			}

			globals_r.socket.emit("verify email", email);
		});

		save_and_continue_btn_wrapper.addEventListener("mouseenter", (evt) => {
			(save_and_continue_btn.disabled ? jQuery('[data-toggle="tooltip"]').tooltip("show") : null);
		});

		save_and_continue_btn_wrapper.addEventListener("mouseleave", (evt) => {
			(save_and_continue_btn.disabled ? jQuery('[data-toggle="tooltip"]').tooltip("hide") : null);
		});

		save_and_continue_btn.addEventListener("click", (evt) => {
			evt.target.innerHTML = '<div class="d-flex justify-content-center pt-2"><div class="dot-carousel mr-4"></div><span class="mt-n2">saving</span><div class="dot-carousel ml-4"></div></div>';

			setTimeout(() => {
				globals_r.socket.emit("save firebase info and email");
			}, 2000);
		});
	});
	svelte.onDestroy(() => {
		globals_r.socket.off("alert");
		globals_r.socket.off("disable button");
		globals_r.socket.off("emit back encrypted token");
		globals_r.socket.off("allow save and continue");
		globals_r.socket.off("switch page to loading");
	});

	function handle_body_keydown(evt) {
		if (evt.key == "Enter") {
			(!save_and_continue_btn.hasAttribute("disabled") ? save_and_continue_btn.click() : null);
		}
	}
</script>

<svelte:body on:keydown={handle_body_keydown}/>
<Navbar username={username}/>
<div class="text-center mt-3">
	<h1 class="display-4">{globals_r.app_name}</h1>
	<div id="unlock_container" class="card card-body bg-dark text-left mt-3 pb-3">
		<div class="form-group">
			<div class="text-center">
				<b><a bind:this={instruction_video_anchor} href="#">SETUP GUIDE VIDEO</a></b>
				<span bind:this={instruction_video_wrapper} class="no_bullet embed-responsive embed-responsive-16by9 d-none"><iframe title="firebase setup guide" class="embed-responsive-item" src="https://www.youtube.com/embed/p9x9orUX2uI" allow="fullscreen"></iframe></span>
			</div>
			<p class="mt-4">to use eternity, you will need to go to <a href="https://console.firebase.google.com" target="_blank">Firebase console</a> and</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-2">create a new Firebase project <span class="text-light">named <b>{`eternity-${username.split("_").join("-")}`}</b></span></li>
				<li class="mt-2">create a Realtime Database where your Reddit items will be stored</li>
				<li class="mt-2">set the Realtime Database read and write security rules to <b>"auth.token.owner == true"</b></li>
				<li class="mt-2">enable Authentication from domain <b>eternity.portals.sh</b></li>
				<li class="mt-2">get a service account key file and a web app config</li>
				<li class="no_bullet d-flex mt-2">
					<div class="w-100">
						<div class="custom-file">
							<input bind:this={file_input} class="custom-file-input" type="file" accept=".json" id="file_input"/>
							<label bind:this={file_input_label} for="file_input" class="custom-file-label text-left bg-light">Firebase service account key file</label>
						</div>
						<input bind:this={config_input} type="text" class="form-control bg-light mt-1" placeholder="Firebase web app config"/>
					</div>
					<button bind:this={validate_btn} class="btn btn-primary shadow-none ml-2">validate</button>
				</li>
				<li class="no_bullet mt-2"><div bind:this={validate_alert_wrapper}></div></li>
				<li class="mt-2">provide a contact email for notifications and updates regarding your eternity account</li>
				<li class="no_bullet d-flex mt-2">
					<input bind:this={email_input} type="text" class="form-control bg-light" placeholder="contact email address"/>
					<button bind:this={verify_btn} class="btn btn-primary shadow-none ml-2">verify</button>
				</li>
				<li class="no_bullet mt-2"><div bind:this={verify_alert_wrapper}></div></li>
			</ul>
			<div bind:this={save_and_continue_btn_wrapper} data-toggle="tooltip" data-trigger="manual" data-placement="top" title="complete the required steps above first">
				<button bind:this={save_and_continue_btn} class="btn btn-primary shadow-none w-100 mt-3" disabled>save and continue</button>
			</div>
		</div>
	</div>
</div>
