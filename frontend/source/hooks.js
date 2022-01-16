export async function handle(obj) {
	const response = await obj.resolve(obj.request, {
		ssr: false
	});
	return response;
}
