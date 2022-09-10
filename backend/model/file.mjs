const backend = process.cwd();

import filesystem from "fs";

async function init() {
	for (const dir of [`${backend}/logs/`, `${backend}/tempfiles/`]) {
		if (filesystem.existsSync(dir)) {
			if (process.env.RUN == "dev") {
				const files = await filesystem.promises.readdir(dir);
				await Promise.all(files.map((file, idx, arr) => (dir == `${backend}/logs/` ? filesystem.promises.truncate(`${dir}/${file}`.replace("//", "/"), 0) : filesystem.promises.unlink(`${dir}/${file}`.replace("//", "/")))));
			}
		} else {
			filesystem.mkdirSync(dir);
		}
	}
}

export {
	init
};
