const project_root = process.cwd();
const run_config = (project_root.toLowerCase().slice(0, 20) == "/mnt/c/users/j9108c/" ? "dev" : "prod");

const secrets = (run_config == "dev" ? (await import(`${project_root}/_secrets.mjs`)).dev : (await import(`${project_root}/_secrets.mjs`)).prod);

const cryptr = (await import("cryptr")).default;

const cryptr_instance = new cryptr(secrets.encryption_key);

function encrypt(unencrypted_thing) { // only use it on primitives. always returns a string
	const encrypted_thing = cryptr_instance.encrypt(unencrypted_thing);
	return encrypted_thing;
}

function decrypt(encrypted_thing) { // takes a string and returns a string
	const decrypted_thing = cryptr_instance.decrypt(encrypted_thing);
	return decrypted_thing;
}

export {
	encrypt,
	decrypt
};
