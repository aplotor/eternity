const backend = process.cwd();

const cryptr = await import(`${backend}/model/cryptr.mjs`);

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		type: "OAuth2",
		clientId: process.env.NODEMAILER_GCP_CLIENT_ID,
		clientSecret: process.env.NODEMAILER_GCP_CLIENT_SECRET,
		user: process.env.NODEMAILER_GMAIL_ADDR,
		refreshToken: process.env.NODEMAILER_GMAIL_REFRESH_TOKEN
	}
});

function send(user, subject, msg) {
	const mail_options = {
		from: '"eternity" <eternity@portals.sh>',
		to: cryptr.decrypt(user.email_encrypted),
		subject: subject,
		html: `
			<span>u/${user.username},</span><br/>
			<br/>
			<b>${msg}</b><br/>
			<br/>
			<br/>
			<span>—</span><br/>
			<a href=${(process.env.RUN == "dev" ? "http://localhost:" + (Number.parseInt(process.env.PORT)-1) : "https://eternity.portals.sh")} target="_blank">eternity</a>
		`
	};

	transporter.sendMail(mail_options, (err, info) => (err ? console.error(err) : console.log(info)));
}

export {
	send
};
