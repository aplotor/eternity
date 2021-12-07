<script context="module">
	import * as globals from "frontend/source/globals.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
</script>
<script>
	export let username;

	const dispatch = svelte.createEventDispatcher();
	
	let [
		config_input,
		file_input,
		file_input_label,
		validate_btn,
		validate_alert_wrapper,
		instruction_video_anchor,
		instruction_video_wrapper,
		email_input,
		submit_btn,
		submit_alert_wrapper,
		agree_and_continue_btn
	] = [null];
	svelte.onMount(() => {
		globals_r.socket.emit("page switch", "unlock");

		globals_r.socket.on("alert", (alert, msg, type) => {
			if (alert == "validate") {
				show_alert(validate_alert_wrapper, msg, type);
			} else if (alert == "submit") {
				show_alert(submit_alert_wrapper, msg, type);
			}
		});

		globals_r.socket.on("allow agree and continue", () => {
			validate_btn.setAttribute("disabled", "");
			submit_btn.setAttribute("disabled", "");
			jQuery('[data-toggle="tooltip"]').tooltip("disable");
			agree_and_continue_btn.removeAttribute("disabled");
		});

		globals_r.socket.on("switch page to loading", () => {
			dispatch("dispatch", "switch page to loading");
		});

		jQuery('[data-toggle="tooltip"]').tooltip("enable");

		file_input.addEventListener("input", (evt) => {
			file_input_label.innerText = file_input.files[0].name;
		});

		config_input.addEventListener("keydown", (evt) => {
			(evt.key == "Enter" ? validate_btn.click() : null);
		});

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
			request.open("post", `${globals_r.backend}/upload?username=${username}`);
			request.responseType = "json";

			request.addEventListener("error", (evt) => {
				show_alert(validate_alert_wrapper, "save error", "danger");
			});

			request.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
					show_alert(validate_alert_wrapper, '<div class="d-flex justify-content-center pt-1"><div class="dot-carousel mr-4"></div><span class="mt-n1">validating key and database</span><div class="dot-carousel ml-4"></div></div>', "success");

					setTimeout(() => {
						globals_r.socket.emit("validate firebase info", web_app_config);
					}, 2000);
				}
			}
		
			request.send(data);
		});

		instruction_video_anchor.addEventListener("click", (evt) => {
			evt.preventDefault();
			instruction_video_wrapper.classList.toggle("d-none");
		});

		email_input.addEventListener("keydown", (evt) => {
			(evt.key == "Enter" ? submit_btn.click() : null);
		});

		submit_btn.addEventListener("click", (evt) => {
			const email = email_input.value.trim();

			if (!email || !email.includes("@") || !email.includes(".com") || email.length < 7) {
				show_alert(submit_alert_wrapper, "this is not an email address", "danger");
				return;
			} else if (email.endsWith("@j9108c.com")) {
				show_alert(submit_alert_wrapper, "use your own email address", "danger");
				return;
			}

			globals_r.socket.emit("check email", email);
		});

		agree_and_continue_btn.addEventListener("click", (evt) => {
			evt.target.innerHTML = '<div class="d-flex justify-content-center pt-2"><div class="dot-carousel mr-4"></div><span class="mt-n2">saving</span><div class="dot-carousel ml-4"></div></div>';

			setTimeout(() => {
				globals_r.socket.emit("save firebase info and email");
			}, 2000);
		});
	});
	svelte.onDestroy(() => {
		globals_r.socket.off("alert");
		globals_r.socket.off("allow agree and continue");
		globals_r.socket.off("switch page to loading");
	});

	function handle_window_keydown(evt) {
		if (evt.key == "Enter") {
			(!agree_and_continue_btn.hasAttribute("disabled") ? agree_and_continue_btn.click() : null);
		}
	}

	function show_alert(alert_wrapper, message, type) {
		alert_wrapper.innerHTML = `
			<div id="alert" class="alert alert-${type} fade show text-center mb-0 p-1" role="alert">
				<span>${message}</span>
			</div>
		`;
	}
</script>

<svelte:window on:keydown={handle_window_keydown}/>
<Navbar username={username}/>
<div class="text-center mt-3">
	<h1 class="display-4">{globals_r.app_name}</h1>
	<div id="unlock_container" class="card card-body bg-dark text-left mt-3 pb-3">
		<div class="form-group">
			<p>to use eternity, you will need to go to <a href="https://console.firebase.google.com" target="_blank">Firebase console</a> and</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-3">create a new Firebase project <span class="text-light">named "eternity-{username}" (without the quotes)</span></li>
				<li class="mt-2">create a Realtime Database where your Reddit data will be stored (it is free up to 1gb disk storage, which should be enough to last you a lifetime)</li>
				<li class="mt-2">set the Realtime Database read and write security rules to "auth.token.owner == true" (with the quotes)</li>
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
				<li class="mt-2">follow <a bind:this={instruction_video_anchor} href="#">this instruction video</a> for a step-by-step guide</li>
				<li bind:this={instruction_video_wrapper} class="no_bullet embed-responsive embed-responsive-16by9 mt-2 d-none"><iframe title="instruction video" class="embed-responsive-item" src="https://www.youtube.com/embed/zpOULjyy-n8" allowfullscreen></iframe></li> <!-- TODO record vid. name it "create new firebase project, and get key file and web app config" -->
			</ul>
			<p class="mt-4">terms and conditions</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-3">this app is released under the <a target="_blank" href="https://choosealicense.com/licenses/agpl-3.0">AGPL3 License</a></li>
				<li class="mt-2">you must log in to eternity at least once every 6 months or else your eternity account will be marked inactive and new Reddit data will not continue to sync to your database</li>
				<li class="mt-2">do not edit any of the Firebase project settings or database contents directly from Firebase. if you do and your eternity instance stops working, you may have to restart</li>
				<li class="mt-2">if by any chance you exceed the Firebase free tier disk storage, you will need to upgrade your Firebase plan in order for eternity to continue storing your new Reddit data. or, you can choose to export out the existing data and wipe the database to continue for free</li>
				<li class="mt-2">any notifications and updates regarding your eternity account (e.g., your account becomes inactive, you reach the storage limit) will be sent from <a href="mailto:eternity@j9108c.com">eternity@j9108c.com</a> to your email</li>
				<li class="no_bullet d-flex mt-2">
					<input bind:this={email_input} type="text" class="form-control bg-light" placeholder="your email address"/>
					<button bind:this={submit_btn} class="btn btn-primary shadow-none ml-2">submit</button>
				</li>
				<li class="no_bullet mt-2"><div bind:this={submit_alert_wrapper}></div></li>
			</ul>
			<div data-toggle="tooltip" data-placement="top" title="complete the required steps above first">
				<button bind:this={agree_and_continue_btn} class="btn btn-primary shadow-none w-100 mt-3" disabled>agree and continue</button>
			</div>
		</div>
	</div>
</div>
