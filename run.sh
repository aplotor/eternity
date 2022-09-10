#!/bin/sh

if [ "$1" = "dev" ]; then
	if [ "$2" = "build" ]; then
		(cd ./backend/ && npm install)
		(cd ./frontend/ && npm install)
		cd ./frontend/ && npm run build
		return
	elif [ "$2" = "start" ]; then
		concurrently --names "backend,frontend" --prefix "{name}:" --prefix-colors "#f2caff,#61f2f2" "cd ./backend/ && npm run dev" "wait-for-it 0.0.0.0:1301 -t 0 && cd ./frontend/ && npm run dev"
		return
	fi
elif [ "$1" = "prod" ]; then
	if [ "$2" = "build" ]; then
		(cd ./backend/ && npm ci)
		(cd ./frontend/ && npm ci)
		cd ./frontend/ && npm run build
		return
	elif [ "$2" = "start" ]; then
		cd ./backend/ && npm run prod_start
		return
	elif [ "$2" = "stop" ]; then
		cd ./backend/ && npm run prod_stop
		return
	elif [ "$2" = "update" ]; then
		sh ./run.sh prod stop
		git pull
		(cd ./backend/ && npm ci)
		(cd ./frontend/ && npm ci)
		sh ./run.sh prod build
		sh ./run.sh prod start
		return
	fi
fi
