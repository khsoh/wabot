#!/bin/bash

## Optionally setup swapfile
sudo fallocate -l 1G /swapfile1

sudo chmod 600 /swapfile1

sudo mkswap /swapfile1

sudo swapon /swapfile1

sudo swapon --show

sudo cp /etc/fstab /etc/fstab.bak
echo '/swapfile1 none swap sw 0 0' | sudo tee -a /etc/fstab

cat << __eom1__
Get ready to modify /etc/sysctl.conf to add the following lines:
vm.swappiness=20
vm.vfs_cache_pressure=40
__eom1__

while [ true ]; do
    read -p "Are you ready to vim edit /etc/sysctl.conf? " -n 1 -r
    echo   #
    if [[ $REPLY =~ ^[Yy]$ ]]
    then
        sudo vim /etc/sysctl.conf
        break
    fi
done
