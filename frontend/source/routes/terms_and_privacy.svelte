<script context="module">
	import * as globals from "frontend/source/globals.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
</script>
<script>
	svelte.onMount(() => {
		globals_r.socket.emit("navigation", "terms_and_privacy");
	});
</script>

<svelte:head>
	<title>{globals_r.app_name} — terms and privacy</title>
	<meta name="description" content={globals_r.description}/>
</svelte:head>
<Navbar show_return_to_app={true}/>
<div class="text-center mt-3">
	<h1 class="display-4">{globals_r.app_name}</h1>
	<div class="card card-body bg-dark text-left mt-3 pb-3">
		<div class="form-group mb-0">
			<p>terms of service</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-3">this app is released under the <a target="_blank" href="https://choosealicense.com/licenses/agpl-3.0">AGPL3 License</a></li>
				<li class="mt-2">you must log in to eternity at least once every 6 months or else your eternity account will be marked inactive and new Reddit data will not continue to sync to your database</li>
				<li class="mt-2">do not edit any of the Firebase project settings or database contents directly from Firebase. if you do and your eternity instance stops working, you may have to restart</li>
				<li class="mt-2">if by any chance your database exceeds the Firebase free tier disk storage, you will need to upgrade your Firebase plan in order for eternity to continue storing your new Reddit data. or, you can choose to export out the existing data and wipe the database to continue for free</li>
			</ul>
			<p class="mt-4">privacy policy</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-3">login is handled directly by Reddit (<a href="https://github.com/reddit-archive/reddit/wiki/OAuth2">oauth2</a>). your password is NEVER sent to eternity</li>
				<li class="mt-2">eternity uses your Reddit authorization to continuously retrieve your new Reddit data, and stores it in your database using the Firebase info you provided</li>
				<li class="mt-2">your Reddit data is stored solely in your own database, and your database is used solely for your own data</li>
				<!-- <li class="mt-2">any notifications and updates regarding your eternity account (e.g., your account becomes inactive, your database reaches its storage limit) will be sent from <a href="mailto:eternity@j9108c.com">eternity@j9108c.com</a> to your email</li> -->
				<li class="mt-2">any notifications and updates regarding your eternity account (e.g., your account becomes inactive, your database reaches its storage limit) will be sent to your email</li>
			</ul>
		</div>
	</div>
</div>
