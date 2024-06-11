#!/usr/bin/env bash


SCRIPTPATH="$( cd -- "$(dirname "$BASH_SOURCE[0]")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH

npm install github:pedroslopez/whatsapp-web.js#webpack-exodus

