const project_root = process.cwd();

const filesystem = (await import("fs")).default;
const winston = (await import("winston")).default;

const log_logger = create_logger("info");
const log = log_logger.info.bind(log_logger);
const error_logger = create_logger("error");
const error = error_logger.error.bind(error_logger);

function create_logger(level) { // https://github.com/winstonjs/winston#logging-levels "npm logging levels"
	const logger = winston.createLogger({
		format: winston.format.combine(
			winston.format.timestamp({
				format: "YYYY-MM-DD HH:mm:ss"
			}),
			winston.format.json(),
			winston.format.printf((log) => {
				return `${JSON.stringify({
					timestamp: log.timestamp,
					level: level,
					message: log.message
				}, null, 4)}`;
			})
		),
		transports: [
			// new winston.transports.Console(),
			new winston.transports.File({
				filename: `${project_root}/logs/${(level == "info" ? "log" : level)}.txt`
			})
		]
	});
	return logger;
}

function clear_logs() {
	filesystem.closeSync(filesystem.openSync(`${project_root}/logs/log.txt`, "w"));
	filesystem.closeSync(filesystem.openSync(`${project_root}/logs/error.txt`, "w"));
	console.log("cleared all logs");
}

export {
	log,
	error,
	clear_logs
};
