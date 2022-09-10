import firebase_admin from "firebase-admin";

function create_app(service_acc_key, db_url, username) {
	const app = firebase_admin.initializeApp({
		credential: firebase_admin.credential.cert(service_acc_key),
		databaseURL: db_url
	}, username); // need 2nd arg (username) to be able to create multiple firebase app instances
	return app;
}

async function free_app(app) {
	await app.delete(); // deletes instance from memory; does not actually delete anything else
}

function get_db(app) {
	return app.database();
}

async function is_empty(db) {
	const ref = db.ref().root;
	const snapshot = await ref.once("value");
	const db_is_empty = !snapshot.exists();
	return db_is_empty;
}

async function insert_data(db, data) {
	const updates = {};

	for (const category in data) {
		if (Object.keys(data[category].items).length > 0) {
			let entries = Object.entries(data[category].items);
			for (const entry of entries) {
				const item_key = entry[0];
				const item_value = entry[1];

				updates[`${category}/items/${item_key}`] = item_value;
			}

			entries = Object.entries(data[category].item_sub_icon_urls);
			for (const entry of entries) {
				const icon_url_key = entry[0];
				const icon_url_value = entry[1];

				updates[`${category}/item_sub_icon_urls/${icon_url_key.replace("/", "|").replace(".", ",")}`] = icon_url_value;
			}
		}
	}
	
	if (Object.keys(updates).length > 0) {
		const ref = db.ref().root;
		await ref.update(updates);
	}
}

async function get_fns_to_import(db, category) {
	const ref = db.ref(`${category}/item_fns_to_import`).limitToFirst(500);
	const snapshot = await ref.get();
	const data = snapshot.val(); // null if no item_fns_to_import
	return data;
}

async function delete_imported_fns(db, fns) {
	const updates = {};

	for (const category in fns) {
		if (fns[category]) {
			for (const fn of fns[category]) {
				updates[`${category}/item_fns_to_import/${fn}`] = null;
			}
		}
	}

	if (Object.keys(updates).length > 0) {
		const ref = db.ref().root;
		await ref.update(updates);
	}
}

async function create_new_auth_token(app) {
	const additional_claims = {
		owner: true
	};
	const auth_token = await app.auth().createCustomToken(app.name, additional_claims);
	return auth_token;
}

export {
	create_app,
	free_app,
	get_db,
	is_empty,
	insert_data,
	get_fns_to_import,
	delete_imported_fns,
	create_new_auth_token
};
