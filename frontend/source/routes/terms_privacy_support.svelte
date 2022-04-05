<script context="module">
	import * as globals from "frontend/source/globals.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
</script>
<script>
	svelte.onMount(() => {
		globals_r.socket.emit("navigation", "terms_privacy_support");
	});
</script>

<svelte:head>
	<title>{globals_r.app_name} — terms, privacy, support</title>
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
				<li class="mt-2">you must log in to eternity at least once every 6 months or else your eternity account will be marked inactive and your new Reddit items will not continue to sync to your database</li>
				<li class="mt-2"><a href="https://firebase.google.com/pricing" target="_blank">Firebase free tier</a> provides 1gb disk storage, which should be enough to last you a very long time (e.g., 5000 items ≈ 1.5mb = 0.0015gb). if your database usage eventually exceeds the free tier, you will need to upgrade your Firebase plan in order for eternity to continue storing your new Reddit items. or, you can choose to export out the existing data and wipe the database to continue for free</li>
				<li class="mt-2">do not edit any of the Firebase project settings or database contents directly from Firebase. if you do and your eternity instance stops working, you may have to restart</li>
			</ul>
			<p class="mt-4">privacy policy</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-3">login is handled directly by Reddit (<a href="https://github.com/reddit-archive/reddit/wiki/OAuth2">oauth2</a>) so your password is never sent to eternity</li>
				<li class="mt-2">eternity uses your Reddit authorization to continuously retrieve your new Reddit items, and stores them in your database using the Firebase info you provided</li>
				<li class="mt-2">your Reddit items are stored solely in your own database, and your database is used solely for your own Reddit items</li>
				<li class="mt-2">your email is never shared, and eternity will only email you for notifications and updates regarding your eternity account (e.g., your account becomes inactive, your database reaches its storage limit)</li>
			</ul>
			<p class="mt-4">support</p>
			<ul class="line_height_1 mt-n2">
				<li class="mt-3">support email: <a href={`mailto:${globals_r.app_name}@portals.sh`}>{`${globals_r.app_name}@portals.sh`}</a></li>
			</ul>
		</div>
	</div>
</div>
