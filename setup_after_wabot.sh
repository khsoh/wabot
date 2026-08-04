#!/bin/bash

# This should be run by $BOTNAME user just after executing setup_root.sh as root
SCRIPTPATH="$(
    cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 || exit
    pwd -P
)"

pushd "$SCRIPTPATH" >/dev/null || exit
if [[ ! $(git remote -v) ]]; then
    echo ERROR!! "$SCRIPTPATH" is not a cloned repository
    popd >/dev/null || exit
    return 1
fi

# This should be run by $BOTNAME user just after these steps:
# - executing setup_root.sh as root user
# - executing setup_before_wabot.sh as $BOTNAME user
# - installing the ssh public key of source PC/Mac to ~/.ssh/authorized_keys

# Setup crontab to run $SCRIPTPATH/start_wabot.sh after boot up
(
    crontab -l
    cat <<_end_of_crontab
0 1 * * * test \`npm outdated --prefix $SCRIPTPATH | wc -l\` -gt 0 && npm update --prefix $SCRIPTPATH
3 * * * * npm outdated --prefix $SCRIPTPATH --json > $SCRIPTPATH/outdated.json
@reboot $SCRIPTPATH/start_wabot.sh
_end_of_crontab
) | crontab -

## Prepare to reboot PC
cat <<__end_message__
1. Open WhatsApp app on the bot's phone and prepare to link device to new account
2. Maximize the terminal window to prepare to scan QR code

When you have completed these steps, prepare to answer Y to the following question.
__end_message__

## Install editorconfig-vim plugin
mkdir -p ~/.vim/pack/plugins/start
git clone https://github.com/editorconfig/editorconfig-vim.git ~/.vim/pack/plugins/start/editorconfig-vim

## Setup ~/.vimrc
cat <<__vimrc >~/.vimrc
set exrc
set secure
set modeline
filetype plugin indent on
__vimrc

while true; do
    read -p "Are you ready to start the bot? " -n 1 -r
    echo #
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ~/wabot || exit
        /bin/bash "$SCRIPTPATH/start_wabot.sh" &
        exit
    fi
done
