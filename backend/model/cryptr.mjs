const backend = process.cwd();
const run_config = (backend.toLowerCase().startsWith("/mnt/c/") ? "dev" : "prod");

const secrets = (run_config == "dev" ? (await import(`${backend}/.secrets.mjs`)).dev : (await import(`${backend}/.secrets.mjs`)).prod);

import cryptr from "cryptr";

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
