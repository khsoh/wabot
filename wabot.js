const { http, https } = require('follow-redirects');
const qrcode = require('qrcode-terminal');
const sjcl = require('sjcl');
var os = require('os');
const util = require('util');
const path = require('path');
const fs = require('fs');
const { stdout, stderr } = require('process');
const BOTCONFIG = require('./botconfig.json');
const packageInfo = require('./package.json');


const nets = os.networkInterfaces();

const BOT_ACTIVE = "ACTIVE";
const BOT_SLEEP = "SLEEP";
const BOT_OFF = "OFF";

var BOTINFO = {
    HOSTNAME: os.hostname(),
    IPADDR: Object.values(nets).map((v) => v.filter(x => !x.internal && x.family == 'IPv4')).flat().map(v => v.address)[0],
    STATE: BOT_OFF
};

var WEBAPPSTATE_OK = true;


class TConsole extends console.Console {
    constructor(...args) {
        super(...args);
        this.tslog_tz = 'Asia/Singapore';
    }
    set_tz(tz) {
        this.tslog_tz = tz;
    }
    tsdate() {
        const options = {
            day: '2-digit',
            year: 'numeric',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            fractionalSecondDigits: 3,
            timeZoneName: 'short',
            timeZone: this.tslog_tz
        };
        const nowdt = new Date();
        const dtf = new Intl.DateTimeFormat('en-us', options);
        const pt = dtf.formatToParts(nowdt);
        const p = pt.reduce((acc, part) => {
            acc[part.type] = part.value;
            return acc;
        }, {});
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond} ${p.timeZoneName}`;

    }
    log(data, ...args) {
        super.log(`${this.tsdate()} --- `, util.format(data, ...args));
    }
    warn(data, ...args) {
        super.warn(`${this.tsdate()} ::: `, util.format(data, ...args));
    }
    error(data, ...args) {
        super.error(`${this.tsdate()} *** `, util.format(data, ...args));
    }
}
const dtcon = new TConsole({ stdout, stderr });
dtcon.set_tz('Asia/Singapore');


// ===== SESSION_SECRET handling require critical section protection
var SESSION_SECRET = "";
var SESSION_TID = null;
const CS_LOCKED = 1;
const CS_UNLOCKED = 0;
var smb = new SharedArrayBuffer(8);
var slock = new Int32Array(smb);
slock[0] = CS_UNLOCKED;
slock[1] = CS_UNLOCKED;
async function EnterCriticalSection(i) {
    do {
        Atomics.wait(slock, i, CS_LOCKED);
    } while (Atomics.compareExchange(slock, i, CS_UNLOCKED, CS_LOCKED) == CS_LOCKED);
}

async function LeaveCriticalSection(i) {
    // Ensures that this is safe to call when the section is already unlocked
    if (Atomics.compareExchange(slock, i, CS_LOCKED, CS_LOCKED) == CS_LOCKED) {
        Atomics.store(slock, i, CS_UNLOCKED);
        Atomics.notify(slock, i, 1);
    }
}


function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

async function bare_reboot() {
    const {
        exec
    } = require("child_process");

    exec('"/usr/bin/sudo" /sbin/reboot', (error, stdout, stderr) => { dtcon.log(error, stdout, stderr); });
}

async function reboot(close_server = false) {
    BOTINFO.STATE = BOT_OFF;
    await client.destroy();
    if (monitorClientTimer) {
        clearInterval(monitorClientTimer);
    }
    if (clientStartTimeoutObject) {
        clearTimeout(clientStartTimeoutObject);
    }
    if (close_server) {
        server.close(bare_reboot);
    }
    else {
        bare_reboot();
    }
}

async function do_close_server() {
    BOTINFO.STATE = BOT_OFF;
    await client.destroy();
    if (monitorClientTimer) {
        clearInterval(monitorClientTimer);
    }
    if (clientStartTimeoutObject) {
        clearTimeout(clientStartTimeoutObject);
    }
    server.close();
    process.kill(process.pid, 'SIGTERM');
}


const { Client, Location, List, Poll, Buttons, LocalAuth } = require('./index');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] },
    authTimeoutms: 2 * 60 * 1000,
    qrMaxRetries: 5
});

/***
const client = new Client({
    authStrategy: new LocalAuth()
});
*/

client.initialize();

client.on('disconnected', (state) => {
    dtcon.log('Event: disconnected');
    if (monitorClientTimer) {
        clearInterval(monitorClientTimer);
    }
    if (clientStartTimeoutObject) {
        clearTimeout(clientStartTimeoutObject);
    }
    server.close();
});

client.on('qr', async (qr) => {
    // NOTE: This event will not be fired if a session is specified.
    dtcon.log('Event: QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
    await cmd_to_host(BOTCONFIG.TECHLEAD, qr, [], 'qr', false);
});

client.on('authenticated', async () => {
    dtcon.log('Event: AUTHENTICATED');
    BOTINFO.STATE = BOT_SLEEP;
    await cmd_to_host(BOTCONFIG.TECHLEAD, "", [], 'authenticated', false);
});

client.on('auth_failure', async msg => {
    // Fired if session restore was unsuccessful
    dtcon.error('Event: AUTHENTICATION FAILURE', msg);
    await cmd_to_host(BOTCONFIG.TECHLEAD, msg, [], 'auth_failure', false);
});

client.on('ready', async () => {
    dtcon.log('Event: READY');
    let version = "UNKNOWN";
    let messages = [];
    try {
        version = await client.getWWebVersion();
        dtcon.log(`WhatsApp Web version: ${version}`);
        dtcon.log("Dependencies: ");
        messages.push(`${BOTINFO.HOSTNAME} is ready: WhatsApp Web version: ${version}\n`);
        for (let [software, version] of Object.entries(packageInfo.dependencies)) {
            version = version.replace(/^\^/, "");
            let vmsg = `  ${software}: ${version}`;
            messages.push(vmsg);
            dtcon.log(vmsg);
        }
        BOTINFO['VERSION'] = version;
    } catch (e) {
        dtcon.log(`WhatsApp Web version failed: ${JSON.stringify(e)}`);
    }
    client.setDisplayName(BOTCONFIG.NAME);
    BOTINFO.STATE = BOT_SLEEP;
    await cmd_to_host(BOTCONFIG.TECHLEAD, messages.join("\n"), [], 'ready', false);
});

client.on('message', async msg => {
    dtcon.log('Event: MESSAGE RECEIVED', msg);

    try {
        // Ignore status messages
        if (msg.isStatus || msg.from == "status@broadcast") {
            dtcon.log("Ignore status message");
            return;
        }
        if (msg.type != 'chat') {
            dtcon.log(`Ignore message type: ${msg.type}`);
            return;
        }
        let senderContact = await msg.getContact();
        let commonGroups = await senderContact.getCommonGroups();

        if (msg.body.match(/^[!\/]/)) {
            let chat = await msg.getChat();
            if (!chat.isGroup && BOTINFO.STATE == BOT_ACTIVE) {
                let reply = await cmd_to_host(msg.from, msg.body, commonGroups);
                if (reply) {
                    msg.reply(reply);
                }
            }
        }
    } catch (e) {
        dtcon.log("Error in handling message: " + JSON.stringify(e));
    }
});

client.on('message_create', (msg) => {
    // Fired on all message creations, including your own
    if (msg.fromMe) {
        // do stuff here
    }
});

client.on('message_revoke_everyone', async (after, before) => {
    // Fired whenever a message is deleted by anyone (including you)
    dtcon.log("Event: message_revoked_everyone", after); // message after it was deleted.
    if (before) {
        dtcon.log(before); // message before it was deleted.
    }
});

client.on('message_revoke_me', async (msg) => {
    // Fired whenever a message is only deleted in your own view.
    dtcon.log("Event: message_revoke_me", msg.body); // message before it was deleted.
});

client.on('message_ack', (msg, ack) => {
    /*
        == ACK VALUES ==
        ACK_ERROR: -1
        ACK_PENDING: 0
        ACK_SERVER: 1
        ACK_DEVICE: 2
        ACK_READ: 3
        ACK_PLAYED: 4
    */

    if (ack == 3) {
        // The message was read
    }
});

client.on('message_reaction', async (reaction) => {
    dtcon.log('Event: message_reaction', JSON.stringify(reaction));
    let number = reaction.senderId.replace(/@.*$/, '');
    await cmd_to_host(number, reaction, [], "message_reaction");
});


client.on('group_join', async (notification) => {
    // User has joined or been added to the group.
    dtcon.log('Event: group_join', notification);
    if (BOTINFO.STATE != BOT_ACTIVE) {
        // BOT is not processing commands - get out
        return;
    }
    let chat = await client.getChatById(notification.chatId);
    let participant_name = "Unknown";
    try {
        let contact = await client.getContactById(notification.id.participant);
        participant_name = contact.name;
    }
    catch (e) {
        participant_name = "Unknown with error: " + JSON.stringify(e);
    }
    let grpjoininfo = {
        group_id: notification.chatId,
        group_name: chat.name,
        participant_name: participant_name
    };
    let number = notification.id.participant.replace(/@.*$/, '');
    await cmd_to_host(number, grpjoininfo, [], "group_join");
});

client.on('group_leave', (notification) => {
    // User has left or been kicked from the group.
    dtcon.log('Event: group_leave', notification);
    //notification.reply('User left.');
});

client.on('group_update', (notification) => {
    // Group picture, subject or description has been updated.
    dtcon.log('Event: group_update', notification);
});

client.on('change_state', async (state) => {
    dtcon.log('Event: CHANGE STATE', state);
    await cmd_to_host(BOTCONFIG.TECHLEAD, state, [], 'change_state', false);
});

client.on('disconnected', async (reason) => {
    dtcon.log('Event: Client was logged out', reason);
    await cmd_to_host(BOTCONFIG.TECHLEAD, reason, [], 'disconnected', false);
});

var clientStartTimeoutObject = null;
async function startClient() {
    dtcon.log("startClient: Initiating client start");
    await client.initialize();
    clientStartTimeoutObject = null;
}

// =========================================================================
// Client monitoring code to start the client if it has not been
// started
async function monitorClient() {
    let state = null;
    try {
        state = await client.getState();
    } catch (e) {
        state = null;
    }
    if (state != "CONNECTED") {
        if (!clientStartTimeoutObject) {
            dtcon.log("monitorClient: Client not connected - start timer to start client in 2 minutes");
            clientStartTimeoutObject = setTimeout(startClient,
                120000);     // Reinitialize client after 120 seconds
        }
    } else {
        if (clientStartTimeoutObject) {
            // Is connected - kill timer to initialize client
            dtcon.log("monitorClient: Client connected - clearing timer to start client");
            clearTimeout(clientStartTimeoutObject);
            clientStartTimeoutObject = null;
        }
    }
}

var monitorClientTimer = setInterval(monitorClient, 30000);

// =========================================================================
// Create the HTTP server
const server = http.createServer((req, res) => {
    if (req.method == 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
    }
    else if (req.method == 'POST') {
        let body = "";
        var headers = req.headers;
        var response = "OK";
        var url = req.url;

        req.on("data", function(chunk) {
            body += chunk;
        });

        req.on("end", async function() {
            var options = {
                method: "post",
                contentType: 'application/json',
                payload: JSON.stringify({})
            };

            try {
                // Non-JSON payloads are ignored
                if (headers['content-type'] != 'application/json') {
                    let errmsg = "Non-json content-type" + headers['content-type'];
                    throw errmsg;
                }

                // Handle the proper JSON payloads
                if (url == "/START") {
                    await EnterCriticalSection(0);
                    SESSION_SECRET = sjcl.decrypt(BOTCONFIG.BOT_SECRET, body);
                    _secret = Math.random().toString(36).substring(2).toUpperCase();
                    SESSION_SECRET = SESSION_SECRET + _secret;
                    response = sjcl.encrypt(BOTCONFIG.BOT_SECRET, _secret);
                    // Set aside 4 minutes to complete because 
                    // WAUtils.wabot_sendmessages in the Google Apps 
                    // Script set aside 2.5 minutes 
                    SESSION_TID = setTimeout(async () => {
                        SESSION_TID = null;
                        SESSION_SECRET = "";
                        await LeaveCriticalSection(0);
                    }, 1000 * 60 * 4);
                } else if (url == "/SENDMESSAGE") {
                    if (SESSION_SECRET == "") {
                        let errmsg = "Illegitimate SENDMESSAGE transaction - session was not established";
                        dtcon.error(errmsg);
                        throw errmsg;
                    }
                    var jsonmsg = sjcl.decrypt(SESSION_SECRET, body);
                    var obj = JSON.parse(jsonmsg);
                    let number;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDMESSAGE`;
                                dtcon.error(response);
                                return;
                            }
                        }
                    }
                    else {
                        response = "ERROR - Illegitimate SENDMESSAGE contents - no Phone nor Group field";
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let state = await client.getState();
                    while (state != "CONNECTED" && count > 0) {
                        await sleep(1000);
                        dtcon.log("Waiting STATE: " + state);
                        count--;
                        state = await client.getState();
                    }
                    if (count < 30) {
                        dtcon.log("Final STATE: " + state);
                    }
                    if (state == "CONNECTED") {
                        await sleep(1000);  // Sleep additional 1 second before sending

                        let msgoption = { mentions: [] };

                        // Detect the mentions in the chat
                        //  mentions are only active in group chats
                        let chat = await client.getChatById(number);
                        if (chat && chat.isGroup) {
                            msgoption.mentions = chat.participants.map((p) => p.id._serialized);
                        }

                        let msgstatus = await client.sendMessage(number, obj.Message, msgoption);

                        response = "OK";
                    }
                    else {
                        response = "ERROR - client is not connected";
                        dtcon.error(response);
                    }
                } else if (url == "/SENDCONTACT") {
                    // Send a poll
                    if (SESSION_SECRET == "") {
                        let errmsg = "Illegitimate SENDCONTACT transaction - session was not established";
                        dtcon.error(errmsg);
                        throw errmsg;
                    }
                    var jsonmsg = sjcl.decrypt(SESSION_SECRET, body);
                    var obj = JSON.parse(jsonmsg);
                    let number;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDCONTACT`;
                                dtcon.error(response);
                                return;
                            }
                        }
                    }
                    else {
                        response = "ERROR - Illegitimate SENDCONTACT contents - no Phone nor Group field";
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let state = await client.getState();
                    while (state != "CONNECTED" && count > 0) {
                        await sleep(1000);
                        dtcon.log("Waiting STATE: " + state);
                        count--;
                        state = await client.getState();
                    }
                    if (count < 30) {
                        dtcon.log("Final STATE: " + state);
                    }
                    if (state == "CONNECTED") {
                        await sleep(1000);  // Sleep additional 1 second before sending
                        let contact = await client.getContactById(obj.ContactId);
                        let msgstatus = await client.sendMessage(number, contact);

                        response = "OK";
                    }
                    else {
                        response = "ERROR - client is not connected";
                        dtcon.error(response);
                    }
                } else if (url == "/SENDPOLL") {
                    // Send a poll
                    if (SESSION_SECRET == "") {
                        let errmsg = "Illegitimate SENDPOLL transaction - session was not established";
                        dtcon.error(errmsg);
                        throw errmsg;
                    }
                    var jsonmsg = sjcl.decrypt(SESSION_SECRET, body);
                    var obj = JSON.parse(jsonmsg);
                    dtcon.log("Sending poll to " + obj.Name + ": " + obj.Poll.pollName + " ; poll options: " + obj.Poll.pollOptions.map((p) => p.name).join("##"));
                    dtcon.log(JSON.stringify(obj.Poll));
                    let number;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDPOLL`;
                                dtcon.error(response);
                                return;
                            }
                        }
                    }
                    else {
                        response = "ERROR - Illegitimate SENDPOLL contents - no Phone nor Group field";
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let state = await client.getState();
                    while (state != "CONNECTED" && count > 0) {
                        await sleep(1000);
                        dtcon.log("Waiting STATE: " + state);
                        count--;
                        state = await client.getState();
                    }
                    if (count < 30) {
                        dtcon.log("Final STATE: " + state);
                    }
                    if (state == "CONNECTED") {
                        await sleep(1000);  // Sleep additional 1 second before sending
                        let npoll = new Poll(obj.Poll.pollName, obj.Poll.pollOptions, obj.Poll.options);
                        response = JSON.stringify(await client.sendMessage(number, npoll));
                    }
                    else {
                        response = "ERROR - client is not connected";
                        dtcon.error(response);
                    }
                } else if (url == "/GROUPMEMBERS") {
                    // Query for group members
                    if (SESSION_SECRET == "") {
                        let errmsg = "Illegitimate GROUPMEMBERS transaction - session was not established";
                        dtcon.error(errmsg);
                        throw errmsg;
                    }
                    var jsonmsg = sjcl.decrypt(SESSION_SECRET, body);
                    var obj = JSON.parse(jsonmsg);
                    dtcon.log("Getting group members of " + obj.Name);
                    if (!'Group' in obj) {
                        response = "ERROR - Illegitimate GROUPMEMBERS contents - no Group field";
                        dtcon.error(response);
                        return;
                    }
                    // Sending to group if object does not have Phone property
                    let number = obj.Group;
                    dtcon.log("Received raw group number: " + number);

                    // Determine if number is invite code or group code
                    // - need to convert to group code if required
                    let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                    if (mx) {
                        // Is a number - append @g.us if required
                        number = mx[2] ? number : `${number}@g.us`;
                    }
                    else {
                        // Invite code - need to convert to group code
                        try {
                            let grp = await client.getInviteInfo(number);
                            number = grp.id._serialized;
                        } catch (e) {
                            // Invalid invite code
                            response = `ERROR - Illegitimate invite code ${obj.Group} given in GROUPMEMBERS`;
                            dtcon.error(response);
                            return;
                        }
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let state = await client.getState();
                    while (state != "CONNECTED" && count > 0) {
                        await sleep(1000);
                        dtcon.log("Waiting STATE: " + state);
                        count--;
                        state = await client.getState();
                    }
                    if (count < 30) {
                        dtcon.log("Final STATE: " + state);
                    }
                    if (state == "CONNECTED") {
                        await sleep(1000);  // Sleep additional 1 second before sending

                        // get the chat
                        let chat = await client.getChatById(number);
                        if (chat && chat.isGroup) {
                            dtcon.log("found chat: ", JSON.stringify(chat.id));
                            let grpmembers = chat.participants
                                .map(p => p.id._serialized);
                            dtcon.log("found " + grpmembers.length + " members");
                            dtcon.log(JSON.stringify(grpmembers));
                            // sjcl.encrypt() returns a string type
                            response = sjcl.encrypt(SESSION_SECRET, JSON.stringify(grpmembers));
                        }
                    }
                    else {
                        response = "ERROR - client is not connected";
                        dtcon.error(response);
                    }
                } else if (url == "/COMMAND") {
                    // Query to send a command
                    if (SESSION_SECRET == "") {
                        let errmsg = "Illegitimate COMMAND transaction - session was not established";
                        dtcon.error(errmsg);
                        throw errmsg;
                    }
                    var jsonmsg = sjcl.decrypt(SESSION_SECRET, body);
                    var obj = JSON.parse(jsonmsg);
                    if (!'Command' in obj) {
                        response = "ERROR - Illegitimate COMMAND contents - no Command field";
                        dtcon.error(response);
                        return;
                    }
                    dtcon.log("Getting command " + obj.Command);
                    let valid_commands = ["reboot", "webappstate", "activate", "sleep", "botoff", "quit", "ping", "groupinfo", "getlog", "rmlog"];

                    // Skip if no valid commands
                    if (!valid_commands.includes(obj.Command)) {
                        return;
                    }

                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let state = await client.getState();

                    // If ping command, respond with pong and WA client state
                    if (obj.Command == "ping") {

                        let cpus = os.cpus();

                        let total = cpus.reduce((psum, cpu) =>
                            psum + Object.values(cpu.times).reduce((pcsum, t) => pcsum + t, 0), 0);
                        let totalidle = cpus.reduce((psum, cpu) =>
                            psum + cpu.times.idle, 0);

                        let cpuusage = 100 * (1.0 - totalidle / total);
                        let memusage = 100 * (1.0 - os.freemem() / os.totalmem());
                        let pongobj = {
                            STATE: BOTINFO.STATE,
                            clientstate: state,
                            cpuusage: cpuusage.toFixed(2) + "%",
                            memusage: memusage.toFixed(2) + "%"
                        };
                        response = "pong:" + JSON.stringify(pongobj);
                        return;
                    }
                    else if (obj.Command === "getlog") {
                        let logfilename = path.join(path.dirname(__filename), 'wabot.log');
                        response = `${BOTINFO.HOSTNAME} logs:\n` + fs.readFileSync(logfilename, 'utf8');
                        return;
                    }
                    else if (obj.Command === "rmlog") {
                        let logfilename = path.join(path.dirname(__filename), 'wabot.log');
                        fs.truncateSync(logfilename);
                        dtcon.log('wabot.log file truncated');
                        return;
                    }
                    else if (obj.Command === "groupinfo") {
                        // Retrieve the group names and IDs that this client belongs to
                        let chats = await client.getChats();
                        const contacts = await client.getContacts();
                        let groups = {};
                        chats = chats.filter(c => c.isGroup && !c.groupMetadata.isParentGroup && !c.groupMetadata.announce);
                        for (const chat of chats) {
                            let grpinfo = {};
                            let desc = chat.description || "None";
                            let creator = "unknown";
                            let creatorphone = chat.owner.user;
                            let contact = contacts.find(c => c.number == creatorphone);
                            if (contact) {
                                creator = contact.name;
                            }

                            let invitecode = "";

                            let pid = chat.participants.find(p => p.id._serialized == client.info.wid._serialized);
                            if (pid.isAdmin) {
                                try {
                                    invitecode = await chat.getInviteCode();
                                } catch (e) {
                                    // Invalid invite code
                                    let errmsg = `ERROR in getInviteCode - ${JSON.stringify(e)}`;
                                    dtcon.error(errmsg);
                                    invitecode = "";
                                }
                            }
                            grpinfo.ID = chat.id._serialized;
                            grpinfo.Description = desc;
                            grpinfo.CreateInfo = `${creator} - ${creatorphone}`;
                            grpinfo.InviteCode = invitecode;
                            groups[chat.name] = grpinfo;
                        }
                        response = JSON.stringify(groups);
                        return;
                    }
                    else if (obj.Command === "quit") {
                        BOTINFO.STATE = BOT_OFF;
                        setTimeout(do_close_server, 1000 * 15);    // close server in 15 seconds
                        return;
                    }
                    else if (obj.Command === "reboot") {
                        BOTINFO.STATE = BOT_OFF;
                        setTimeout(reboot, 1000 * 15, true); // reboot in 15 seconds
                        return;
                    }

                    while (state != "CONNECTED" && count > 0) {
                        await sleep(1000);
                        dtcon.log("Waiting STATE: " + state);
                        count--;
                        state = await client.getState();
                    }
                    if (count < 30) {
                        dtcon.log("Final STATE: " + state);
                    }
                    if (state == "CONNECTED") {
                        await sleep(1000);  // Sleep additional 1 second before sending
                        if (obj.Command === "webappstate") {
                            WEBAPPSTATE_OK = obj.Parameters.state;
                        }
                        else if (obj.Command === "activate") {
                            BOTINFO.STATE = BOT_ACTIVE;
                        }
                        else if (obj.Command === "sleep") {
                            BOTINFO.STATE = BOT_SLEEP;
                        }
                        else if (obj.Command === "botoff") {
                            BOTINFO.STATE = BOT_OFF;
                        }
                    }
                    else {
                        response = "ERROR - client is not connected";
                        dtcon.error(response);
                    }
                } else if (url == "/CLOSE") {
                    options.payload = JSON.stringify({});

                    if (SESSION_SECRET == "") {
                        let errmsg = "Illegitimate CLOSE transaction - session was not established";
                        dtcon.error(errmsg);
                        throw errmsg;
                    }
                    // Validate this is still the same SESSION_SECRET
                    //   by checking a random object encrypted by CLOSE
                    // If secret does not match, decrypt will throw an error.
                    var jsonmsg = sjcl.decrypt(SESSION_SECRET, body);
                    dtcon.log("Session ended");
                    SESSION_SECRET = "";
                    if (SESSION_TID) {
                        clearTimeout(SESSION_TID);
                        SESSION_TID = null;
                    }
                    await LeaveCriticalSection(0);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                }
            }
            catch (e) {
                response = "ERROR: " + JSON.stringify(e);
                dtcon.error(response);
                res.writeHead(400, { 'Content-Type': 'text/plain' });
            }
            finally {
                res.end(response);
            }
        });
    }
});

server.listen(BOTCONFIG.SERVER_PORT);



// Function that message to Google Script host.
// The function returns a string to reply to the command
// or and empty string to indicate that no reply is required.
// Parameters:
//   number : phone number of sender (including possible trailing @c.us)
//   contents: contents of message
//   groups: array of common groups shared with sender
//   waevent: WhatsApp client event; default is "message"
//   bot_active: if true, BOT state must be active; default is true
async function cmd_to_host(number, contents, groups = [], waevent = "message", bot_active = true) {
    var response = "";
    if (number == "status@broadcast") {
        return response;
    }
    if (bot_active && BOTINFO.STATE != BOT_ACTIVE) {
        return response;
    }
    try {
        // Called in a way to make this synchronous
        if (WEBAPPSTATE_OK) {
            let cmd_promise = promise_cmd_to_host(number, contents, groups, waevent);
            response = await cmd_promise;
        }
        else {
            response = "Google outage: Bot commands are not available.";
        }
    } catch (e) {
        // Promise rejected
        dtcon.log(error);
    }
    return response;
}

function promise_cmd_to_host(number, contents, groups = [], waevent = "message") {
    var promise = new Promise((resolve, reject) => {
        var responseBody = '';

        let objevent = { botinfo: BOTINFO };
        objevent[waevent] = {
            number: number.replace(/@.*$/, ''),
            contents: contents,
            groups: groups
        };

        const postData = JSON.stringify(objevent);

        const options = {
            hostname: 'script.google.com',
            port: 443,
            path: BOTCONFIG.GASURL.replace('https://script.google.com', ''),
            method: 'POST',
            timeout: 1000 * 60 * 5, // Google Apps script execution limit is 5 minutes
            //followAllRedirects: true,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            dtcon.log(`STATUS: ${res.statusCode}`);
            res.setEncoding('utf-8');
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                dtcon.log('No more data in response.');
                dtcon.log('Response body: ' + responseBody);
                resolve(responseBody);
            });
        });

        req.on('error', (e) => {
            dtcon.error(`problem with request: ${JSON.stringify(e)}`);
            reject(e);
        });

        // Write data to request body
        req.write(postData);
        req.end();
    });
    return promise;
}
