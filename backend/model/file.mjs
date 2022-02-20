const backend = process.cwd();
const run_config = (backend.toLowerCase().startsWith("/mnt/c/") ? "dev" : "prod");

import filesystem from "fs";

function init() {
	if (run_config == "dev") {
		filesystem.closeSync(filesystem.openSync(`${backend}/logs/log.txt`, "w"));
		filesystem.closeSync(filesystem.openSync(`${backend}/logs/error.txt`, "w"));
		console.log("cleared all logs");
	}

	(!filesystem.existsSync(`${backend}/tempfiles/`) ? filesystem.mkdirSync(`${backend}/tempfiles/`) : null);
}

export {
	init
};
