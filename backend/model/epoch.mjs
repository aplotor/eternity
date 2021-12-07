function now() {
	const now_epoch = Math.floor(Date.now() / 1000);
	return now_epoch;
}

export {
	now
};
