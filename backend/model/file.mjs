const backend = process.cwd();

import filesystem from "fs";

function init() {
	(!filesystem.existsSync(`${backend}/tempfiles/`) ? filesystem.mkdirSync(`${backend}/tempfiles/`) : null);
}

export {
	init
};
