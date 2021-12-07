<script context="module">
	import * as globals from "frontend/source/globals.js";
	import Navbar from "frontend/source/components/navbar.svelte";

	import * as svelte from "svelte";
	import axios from "axios";

	const globals_r = globals.readonly;

	function ensure_redirect(current_path) {
		(current_path == "/" ? history.pushState(null, "", "/error") : null); // if current path is already index, change the path so that "return to app" will actually redirect to index
	}

	export async function load(obj) {
		console.log(obj.status);
		console.log(obj.error.message);

		if (obj.status != 404) {
			console.log(1);

			ensure_redirect(obj.page.path);

			return {
				props: {
					http_status: obj.status
				}
			};
		} else {
			console.log(2);

			try {
				await axios.get(globals_r.backend + obj.page.path); // should throw an error
			} catch (err) {
				console.error(err);

				ensure_redirect(obj.page.path);

				return {
					props: {
						http_status: parseInt(err.message.split(" ").slice(-1)[0])
					}
				};
			}
		}
	};
</script>
<script>
	export let http_status;

	svelte.onMount(() => {
		globals_r.socket.emit("navigation", http_status);
	});
</script>

<svelte:head>
	<title>{http_status}</title>
	<meta name="description" content={http_status}/>
</svelte:head>
<Navbar/>
<div class="text-center mt-5 pt-5">
	<a href="https://www.google.com/search?q=http+status+{http_status}" target="_blank" class="display-1">{http_status}</a>
	<br/>
	<a href="/" class="display-3">return to app</a>
</div>
