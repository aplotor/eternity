<script context="module">
	import * as globals from "frontend/source/globals.js";
	import Footer from "frontend/source/components/footer.svelte";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;

	export async function load(obj) {
		let interval_id = null;
		try {
			await new Promise((resolve, reject) => {
				const timeout_id = setTimeout(() => {
					reject("socket connection attempt timed out");
				}, 5000);

				interval_id = setInterval(() => {
					if (globals_r.socket.connected) {
						clearTimeout(timeout_id);
						clearInterval(interval_id);
						resolve();
					}
				}, 100);
			});
			
			return {
				status: 200
			};
		} catch (err) {
			console.error(err);
			clearInterval(interval_id);

			return {
				status: 408
			};
		}
	};
</script>
<script>
	svelte.onMount(() => {
		if (document.cookie) {
			const light_mode = document.cookie.split("; ").find((cookie) => cookie.startsWith("light_mode")).split("=")[1];
			(light_mode == "on" ? null : null); // TODO add tailwind dark mode
		}
	});
</script>

<div class="container-fluid text-light">
	<div class="row d-flex justify-content-center">
		<content class="col-12 col-sm-11 col-md-10 col-lg-9 col-xl-8">
			<slot></slot>
			<div id="pre_gh_space" class="pb-2"></div>
			<div class="text-center my-4">
				<a href={globals_r.repo} target="_blank"><i id="bottom_gh" class="fab fa-github"></i></a>
			</div>
			<div class="text-center">
				<p class="font_size_10 m-0"><a target="_blank" href="{globals_r.repo}/issues">report issues</a></p>
				<p class="font_size_10 m-0"><a target="_blank" href="https://www.buymeacoffee.com/j9108c">help support server costs</a></p>
			</div>
		</content>
		<Footer/>
	</div>
</div>
