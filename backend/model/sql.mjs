import node_pg from "pg";
import axios from "axios";

const pool = new node_pg.Pool({ // https://node-postgres.com/api/pool
	connectionString: process.env.SQL_CONNECTION,
	max: (process.env.RUN == "dev" ? 1 : 5),
	idleTimeoutMillis: 0
});

async function init_db() {
	const client = await pool.connect();
	try {
		await client.query(`begin;`);

		if (process.env.RUN == "dev") {
			const result = await client.query(`
				select 
					table_name 
				from 
					information_schema.tables 
				where 
					table_schema = 'public' 
					and table_type = 'BASE TABLE'
				;
			`);
			const all_tables = result.rows;
			await Promise.all(all_tables.map((table, idx, arr) => {
				client.query(`
					drop table 
						${table.table_name} 
					cascade
					;
				`);
			}));
			console.log("dropped all tables");
			console.log("recreating tables");
		}
	
		await client.query(`
			create table if not exists 
				user_ (
					username text primary key, 
					reddit_api_refresh_token_encrypted text, -- decrypt ➔ string
					category_sync_info json, 
					last_updated_epoch bigint, 
					last_active_epoch bigint, 
					email_encrypted text, -- decrypt ➔ string
					email_notif json, 
					firebase_service_acc_key_encrypted text, -- decrypt ➔ json string
					firebase_web_app_config_encrypted text -- decrypt ➔ json string
				)
			;
		`);

		await client.query(`commit;`);
	} catch (err) {
		console.error(err);
		await client.query(`rollback;`);
	}
	client.release();
}

async function query(query) {
	const result = await pool.query(query);
	const rows = (result ? result.rows : null);
	return rows;
}

async function save_user(username, reddit_api_refresh_token_encrypted, category_sync_info, last_active_epoch, email_notif) {
	await query(`
		insert into 
			user_ 
		values (
			'${username}', 
			'${reddit_api_refresh_token_encrypted}', 
			'${JSON.stringify(category_sync_info)}', 
			null, 
			${last_active_epoch}, 
			null, 
			'${JSON.stringify(email_notif)}', 
			null, 
			null
		) 
		on conflict (username) do -- previously purged user
			update 
				set 
					reddit_api_refresh_token_encrypted = excluded.reddit_api_refresh_token_encrypted, 
					category_sync_info = excluded.category_sync_info, 
					last_updated_epoch = excluded.last_updated_epoch, 
					last_active_epoch = excluded.last_active_epoch, 
					email_encrypted = excluded.email_encrypted, 
					email_notif = excluded.email_notif, 
					firebase_service_acc_key_encrypted = excluded.firebase_service_acc_key_encrypted, 
					firebase_web_app_config_encrypted = excluded.firebase_web_app_config_encrypted
		;
	`);
}

async function update_user(username, fields) {
	await query(`
		update 
			user_ 
		set 
			${Object.keys(fields).map((field, idx, arr) => `${field} = ${(typeof fields[field] == "string" ? "'" : "")}${fields[field]}${(typeof fields[field] == "string" ? "'" : "")}${(idx < arr.length-1 ? "," : "")}`).join(" ")} 
		where 
			username = '${username}'
		;
	`);
}

async function get_user(username) {
	const rows = await query(`
		select 
			* 
		from 
			user_ 
		where 
			username = '${username}'
		;
	`);
	return rows[0];
}

async function get_all_non_purged_users() {
	const rows = await query(`
		select 
			username 
		from 
			user_ 
		where 
			reddit_api_refresh_token_encrypted is not null
		;
	`);
	return rows;
}

async function backup_db() {
	await axios.post("https://api.elephantsql.com/api/backup", {}, {
		auth: {
			username: "",
			password: process.env.SQL_API_KEY
		}
	});
	console.log("backed up db");
}
function cycle_backup_db() {
	(process.env.RUN == "dev" ? backup_db().catch((err) => console.error(err)) : null);

	setInterval(() => {
		backup_db().catch((err) => console.error(err));
	}, 86400000); // 24h
}

export {
	pool,
	init_db,
	save_user,
	update_user,
	get_user,
	get_all_non_purged_users,
	cycle_backup_db
};
