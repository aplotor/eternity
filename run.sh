#!/bin/sh

if [ "$1" = "dev" ]; then
	if [ "$2" = "build" ]; then
		(cd ./backend/ && npm install)
		cd ./frontend/ && npm install && npm run build
		return
	elif [ "$2" = "up" ]; then
		concurrently --names "backend,frontend" --prefix "{name}:" --prefix-colors "#f2caff,#61f2f2" "cd ./backend/ && npm run dev" "wait-for-it 0.0.0.0:1301 -t 0 && cd ./frontend/ && npm run dev"
		return
	fi
elif [ "$1" = "prod" ]; then
	if [ "$2" = "build" ]; then
		(cd ./backend/ && npm ci)
		cd ./frontend/ && npm ci && npm run build
		return
	elif [ "$2" = "up" ]; then
		cd ./backend/ && npm run prod_start
		return
	elif [ "$2" = "down" ]; then
		cd ./backend/ && npm run prod_stop
		return
	elif [ "$2" = "update" ]; then
		sh ./run.sh prod down
		git pull
		sh ./run.sh prod build
		sh ./run.sh prod up
		return
	fi
fi
