<script context="module">
	import * as globals from "frontend/source/globals.js";

	import * as svelte from "svelte";

	const globals_r = globals.readonly;
	const globals_w = globals.writable;
</script>
<script>
	let [
		dropdown_btn,
		dropdown_menu,
		last24hours_total_wrapper,
		last7days_total_wrapper,
		last30days_total_wrapper,
		last24hours_list_wrapper,
		last7days_list_wrapper,
		last30days_list_wrapper
	] = [];

	function handle_body_keydown(evt) {
		if (evt.key == "Escape") {
			setTimeout(() => {
				(!dropdown_menu.classList.contains("show") ? dropdown_btn.blur() : null);
			}, 100);
		}
	}

	function list_domain_request_info(countries, parent_ul) {
		parent_ul.innerHTML = "";
		
		if (countries.length == 0) {
			return;
		} else if (countries.length <= 3) {
			for (const country of countries) {
				parent_ul.insertAdjacentHTML("beforeend", `
					<li class="mt-n1">${country.clientCountryName}: ${country.requests}</li>
				`);
			}
		} else {
			for (const country of countries.slice(0, 3)) {
				parent_ul.insertAdjacentHTML("beforeend", `
					<li class="mt-n1">${country.clientCountryName}: ${country.requests}</li>
				`);
			}

			parent_ul.insertAdjacentHTML("beforeend", `
				<li class="mt-n1">${countries.length - 3} more</li>
			`);
		}
	}

	svelte.onMount(() => {
		globals_r.socket.on("update domain request info", (domain_request_info) => {
			if (!domain_request_info || Object.keys(domain_request_info).length == 0) {
				return;
			}
			
			last24hours_total_wrapper.innerHTML = domain_request_info.last24hours_total;
			last7days_total_wrapper.innerHTML = domain_request_info.last7days_total;
			last30days_total_wrapper.innerHTML = domain_request_info.last30days_total;

			list_domain_request_info(domain_request_info.last24hours_countries, last24hours_list_wrapper);
			list_domain_request_info(domain_request_info.last7days_countries, last7days_list_wrapper);
			list_domain_request_info(domain_request_info.last30days_countries, last30days_list_wrapper);
		});

		dropdown_btn.addEventListener("click", (evt) => {
			setTimeout(() => {
				(!dropdown_menu.classList.contains("show") ? dropdown_btn.blur() : null);
			}, 100);

			setTimeout(() => {
				dropdown_menu.scrollIntoView({
					behavior: "smooth",
					block: "end"
				});
			}, 250);
		});
	});
	svelte.onDestroy(() => {
		globals_r.socket.off("update domain request info");
	});
</script>

<svelte:body on:keydown={handle_body_keydown}/>
<footer class="text-center">
	<p class="font_size_10 m-0"><a href="/about">about</a></p>
	<p class="font_size_10 m-0"><a href={globals_r.sponsor_url} target="_blank">support this project</a></p>
	<p class="font_size_10 m-0">released under the <a href="https://choosealicense.com/licenses/agpl-3.0" target="_blank">AGPL3 License</a> &#169; 2021+</p>
	<p class="font_size_10 m-0"><a href="{($globals_w.all_apps_urls ? $globals_w.all_apps_urls.portals.link : "#")}/stats" target="_blank">cloudflare zone stats</a></p>
	<div class="btn-group dropdown">
		<button bind:this={dropdown_btn} type="button" class="btn btn-link dropdown-toggle mt-n2 px-1 py-0" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" data-display="static"></button>
		<div bind:this={dropdown_menu} class="dropdown-menu rounded-0 bg-light mt-n2 px-2 py-0" id="dropdown_menu">
			<p class="text-center m-0"><b>domain requests</b></p>
			<div class="dropdown-divider m-0"></div>
			<span>last 24 hours: <span bind:this={last24hours_total_wrapper}></span></span>
			<ul bind:this={last24hours_list_wrapper} class="m-0"></ul>
			<div class="dropdown-divider m-0"></div>
			<span>last 7 days: <span bind:this={last7days_total_wrapper}></span></span>
			<ul bind:this={last7days_list_wrapper} class="m-0"></ul>
			<div class="dropdown-divider m-0"></div>
			<span>last 30 days: <span bind:this={last30days_total_wrapper}></span></span>
			<ul bind:this={last30days_list_wrapper} class="m-0"></ul>
			<div class="dropdown-divider m-0"></div>
			<div class="text-center mt-n1">
				<a class="font_size_10" href="{($globals_w.all_apps_urls ? $globals_w.all_apps_urls.portals.link : "#")}/stats" target="_blank">full details</a>
			</div>
		</div>
	</div>
</footer>
