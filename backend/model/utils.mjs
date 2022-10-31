function now_epoch() {
	const now_epoch = Math.floor(Date.now() / 1000);
	return now_epoch;
}

function strip_trailing_slash(string) {
	const stripped_string = (string.endsWith("/") ? string.slice(0, -1) : string);
	return stripped_string;
}

export {
	now_epoch,
	strip_trailing_slash
};
