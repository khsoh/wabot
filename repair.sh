#!/usr/bin/env bash

# Remove .wwebjs`_* subdirectories to initiate repairing
sleep 15
SCRIPTPATH="$( cd -- "$(dirname "$BASH_SOURCE[0]")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH

rm -rf .wwebjs_auth

sudo reboot

