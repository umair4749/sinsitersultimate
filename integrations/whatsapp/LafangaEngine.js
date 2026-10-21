/**
 * ═══════════════════════════════════════════════════════════
 *              L A F A N G A   E N G I N E  
 * ═══════════════════════════════════════════════════════════
 *  [S1]  IMPORTS
 *  [S2]  CONSTANTS
 *  [S3]  HELPERS
 *  [S4]  GLOBAL STATE
 *  [S5]  MSG CONTEXT
 *  [S6]  FONT CONVERTER
 *  [S7]  BOT NAME STYLE
 *  [S8]  GLOBAL OWNER
 *  [S9]  SUPER-ONLY CMDS
 *  [S10] EMOJI BANKS
 *  [S11] VOICE
 *  [S12] MENU
 *  [S13] AI HANDLER
 *  [S14] COMMAND ROUTER
 *  [S15] BOT INSTANCE
 *  [S16] BOT MANAGER
 *  [S17] BOOT
 * ═══════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════
//  [S1] IMPORTS
// ═══════════════════════════════════════════════════════════
import fs                from 'fs';
import readline          from 'readline';
import path              from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, spawn } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || path.join(__dirname, 'data'));
for (const folder of ['sessions', 'store']) fs.mkdirSync(path.join(DATA_ROOT, folder), { recursive: true });

let makeWASocket, useMultiFileAuthState, DisconnectReason, delay,
    fetchLatestBaileysVersion, Browsers, downloadMediaMessage;
let Boom, pino, ffmpegPath, axios;

const REQUIRED_DEPS = {
    '@whiskeysockets/baileys': (m) => {
        makeWASocket              = m.default;
        useMultiFileAuthState     = m.useMultiFileAuthState;
        DisconnectReason          = m.DisconnectReason;
        delay                     = m.delay;
        fetchLatestBaileysVersion = m.fetchLatestBaileysVersion;
        Browsers                  = m.Browsers;
        downloadMediaMessage      = m.downloadMediaMessage;
    },
    '@hapi/boom':    (m) => { Boom = m.Boom; },
    'pino':          (m) => { pino = m.default; },
    'ffmpeg-static': (m) => { ffmpegPath = m.default; },
    'axios':         (m) => { axios = m.default; }
};

// Keep useful application/error logs, but hide Baileys' huge SessionEntry object dumps.
const _stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, cb) => {
    const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
    if (/Closing session:\s*SessionEntry\s*\{/.test(str) || /SessionEntry\s*\{[\s\S]*chainKey/.test(str)) return true;
    return _stdoutWrite(chunk, encoding, cb);
};

console.log('🔄 [S1] Loading dependencies...');
for (const [dep, assign] of Object.entries(REQUIRED_DEPS)) {
    try {
        const m = await import(dep);
        assign(m);
    } catch (err) {
        console.log(`📦 Installing "${dep}"...`);
        const proc = spawnSync('npm', ['install', dep], { stdio: 'inherit', shell: true });
        if (proc.status !== 0) { console.error(`❌ Failed: ${dep}`); process.exit(1); }
        const m = await import(dep);
        assign(m);
    }
}
console.log('✅ [S1] Ready!\n');

// ═══════════════════════════════════════════════════════════
//  [S2] CONSTANTS
// ═══════════════════════════════════════════════════════════
const PATH_AUTH          = (id) => path.join(DATA_ROOT, 'sessions', String(id));
const PATH_USERS = path.join(DATA_ROOT, 'store', 'users.json');
const PATH_NETWORK = path.join(DATA_ROOT, 'store', 'network.json');
const PATH_SPEED = path.join(DATA_ROOT, 'store', 'timing.json');
const PATH_PREFIX = path.join(DATA_ROOT, 'store', 'prefix.json');
const PATH_FONT = path.join(DATA_ROOT, 'store', 'font.json');
const PATH_BANNER = path.join(DATA_ROOT, 'store', 'banner.jpg');
const PATH_BANNER_VID = path.join(DATA_ROOT, 'store', 'banner.mp4');
const PATH_BIO = path.join(DATA_ROOT, 'store', 'bio.txt');
const PATH_DISPLAY_NAMES = path.join(DATA_ROOT, 'store', 'botnames.json');
const PATH_MENU_CONFIG = path.join(DATA_ROOT, 'store', 'menus.json');
const PATH_SUPER_OWNERS = path.join(DATA_ROOT, 'store', 'globalowners.json');
const PATH_SYNC_MODE = path.join(DATA_ROOT, 'store', 'syncall.json');
const PATH_SECURITY = path.join(DATA_ROOT, 'store', 'security.json');
const PATH_MULTIGC = path.join(DATA_ROOT, 'store', 'multigc.json');
const PATH_AI_MODE = path.join(DATA_ROOT, 'store', 'ai.json');

const YTDLP_PATH = path.join(DATA_ROOT, 'yt-dlp');
const FISH_API_KEY = process.env.FISH_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const ENV_GLOBAL_OWNER_NUMBER =
    process.env.GLOBAL_OWNER_NUMBER ||
    process.env.OWNER_NUMBER ||
    process.env.MAIN_OWNER_NUMBER ||
    process.env.BOT1_OWNER_NUMBER ||
    process.env.OWNER ||
    process.env.BOT1_NUMBER ||
    '';
const getConfiguredGlobalOwner = () => {
    const n = String(ENV_GLOBAL_OWNER_NUMBER).replace(/\D/g, '');
    if (n.length >= 10) return `${n}@s.whatsapp.net`;
    return superOwnersData?.owners?.map(cleanJid).find(Boolean) || '';
};
const MAX_BOTS = 4;

const VOICE_IDS = {
    modi:     '1ef462d8eee24f51b656712b1fbc358a',
    sanjay:   '772a907506434bcb8811acd1a87056e7',
    lalu:     '9e2073d222824a648cd37ca55661a1b2',
    amitabh:  'ea7cdc74aeae4b608be27fdc37fdcb05',
    srk:      '1f51bb552a924f89837c80d6c1b11e03',
    priyanka: 'a24e56dbb26d4a8997a25da22d7211f4',
    alia:     '04413cde9dae4cd69fe5d416f63d6e55',
    salman:   '432d3826256846208aa69db252f4faf8'
};

// ═══════════════════════════════════════════════════════════
//  [S3] HELPERS
// ═══════════════════════════════════════════════════════════
function readJson(p, def){
    try {
        if (!fs.existsSync(p)) return structuredClone(def);
        const raw = fs.readFileSync(p, 'utf8').trim();
        if (!raw) return structuredClone(def);
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`[sinsiters] ⚠️ JSON read failed: ${p} — ${e.message}`);
        return structuredClone(def);
    }
}
function writeJson(p, d){
    try {
        const dir = p.includes('/') ? p.substring(0, p.lastIndexOf('/')) : '.';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${p}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
        fs.renameSync(tmp, p);
        return true;
    } catch (e) {
        console.warn(`[sinsiters] ⚠️ JSON write failed: ${p} — ${e.message}`);
        return false;
    }
}
function cleanJid(j){
    if (!j || typeof j !== 'string') return '';
    const [user, host] = j.split('@');
    return user.split(':')[0] + '@' + (host || 's.whatsapp.net');
}
function isRateErr(e){
    const m = (e?.message || '').toLowerCase();
    const c = e?.output?.statusCode;
    return m.includes('rate') || m.includes('overlimit') || m.includes('wait') ||
           m.includes('spam') || m.includes('too many') || c === 429 || c === 503;
}
function parseDelay(str){
    if (!str) return null;
    const s = String(str).trim();
    if (/^\d+$/.test(s)) return parseInt(s);
    return null;
}

// ═══════════════════════════════════════════════════════════
//  [S4] GLOBAL STATE
// ═══════════════════════════════════════════════════════════
let userData    = readJson(PATH_USERS,  { owners: [], subs: {} });
let speedConfig = readJson(PATH_SPEED, {});
let prefixData  = readJson(PATH_PREFIX, { prefix: '!' });
let PREFIX      = prefixData.prefix || '!';

let superOwnersData = readJson(PATH_SUPER_OWNERS, { owners: [] });
let syncModeData    = readJson(PATH_SYNC_MODE, { enabled: false });
let securityData    = readJson(PATH_SECURITY, { antilink: {}, autodelete: {} });
let multiGcData     = readJson(PATH_MULTIGC, { groups: [], delay: 3000 });
let aiModeData      = readJson(PATH_AI_MODE, { enabled: false });
const isAiEnabled = () => !!aiModeData.enabled;
const setAiEnabled = (enabled) => {
    aiModeData.enabled = !!enabled;
    writeJson(PATH_AI_MODE, aiModeData);
};

const displayNamesData = readJson(PATH_DISPLAY_NAMES, {});
const botNames = new Map(Object.entries(displayNamesData).map(([k, v]) => [parseInt(k), v]));

const menuConfigData = readJson(PATH_MENU_CONFIG, {});
const botMenus = new Map(Object.entries(menuConfigData).map(([k, v]) => [parseInt(k), parseInt(v) === 2 ? 2 : 1]));

let activeFont = 'italic';
try {
    const fc = readJson(PATH_FONT, { font: 'italic' });
    activeFont = fc.font || 'italic';
} catch(e){}

const saveUsers        = () => writeJson(PATH_USERS, userData);
const saveTiming       = () => writeJson(PATH_SPEED, speedConfig);
const savePrefix       = () => { prefixData.prefix = PREFIX; writeJson(PATH_PREFIX, prefixData); };
const saveSuperOwners  = () => writeJson(PATH_SUPER_OWNERS, superOwnersData);
const saveSyncMode     = () => writeJson(PATH_SYNC_MODE, syncModeData);
const saveSecurity     = () => writeJson(PATH_SECURITY, securityData);
const saveMultiGc      = () => writeJson(PATH_MULTIGC, multiGcData);
const saveBotNames     = () => {
    const o = {}; botNames.forEach((n, i) => { o[i] = n; }); writeJson(PATH_DISPLAY_NAMES, o);
};
const saveBotMenus      = () => {
    const o = {}; botMenus.forEach((m, i) => { o[i] = m === 2 ? 2 : 1; }); writeJson(PATH_MENU_CONFIG, o);
};
const getBotMenu        = (i) => botMenus.get(i) === 2 ? 2 : 1;
const setBotMenu        = (i, m) => { botMenus.set(i, m === 2 ? 2 : 1); saveBotMenus(); };
const saveActiveFont   = () => writeJson(PATH_FONT, { font: activeFont });

const disabledChats = new Set();

try {
    const sd = path.join(DATA_ROOT, 'store');
    if (!fs.existsSync(sd)) fs.mkdirSync(sd, { recursive: true });
    if (fs.existsSync(YTDLP_PATH)) {
        const u = spawn(YTDLP_PATH, ['-U']);
        u.stdout.on('data', d => { if (d.toString().includes('Updated')) console.log('[sinsiters] 🚀 yt-dlp updated!'); });
        u.on('error', () => {});
    }
} catch(e){}

// ═══════════════════════════════════════════════════════════
//  [S5] MSG CONTEXT
// ═══════════════════════════════════════════════════════════
const msgContext = new AsyncLocalStorage();

// ═══════════════════════════════════════════════════════════
//  [S6] FONT CONVERTER
// ═══════════════════════════════════════════════════════════
const GLYPH = {
    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',
    m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
    A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ғ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',
    M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'ǫ',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'
};
const g = str => str.split('').map(c => GLYPH[c] ?? c).join('');

const makeFont = (l, u) => {
    const m = {};
    for (let i = 0; i < 26; i++) m[String.fromCharCode(97 + i)] = String.fromCodePoint(l + i);
    for (let i = 0; i < 26; i++) m[String.fromCharCode(65 + i)] = String.fromCodePoint(u + i);
    return m;
};
const FONTS_MAP = {
    italic:     makeFont(0x1d622, 0x1d608),
    bold:       makeFont(0x1d41a, 0x1d400),
    bolditalic: makeFont(0x1d482, 0x1d468),
    sansbold:   makeFont(0x1d5ee, 0x1d5d4),
    mono:       makeFont(0x1d68a, 0x1d670),
    outline:    makeFont(0x1d552, 0x1d538),
    gothic:     makeFont(0x1d51e, 0x1d504),
    gothicbold: makeFont(0x1d586, 0x1d56c),
    bubble:     makeFont(0x24d0, 0x24b6),
    script:     makeFont(0x1d4b6, 0x1d49c),
    scriptbold: makeFont(0x1d4ea, 0x1d4d0),
    sansitalic: makeFont(0x1d656, 0x1d63c)
};
const applyFont = (str, f = activeFont) => {
    const m = FONTS_MAP[f] || FONTS_MAP['italic'];
    return str.split('').map(c => m[c] ?? c).join('');
};
const iFnt = str => applyFont(str, activeFont);

// ═══════════════════════════════════════════════════════════
//  [S7] BOT NAME STYLE
// ═══════════════════════════════════════════════════════════
const getBotName = (i) => botNames.get(i) || 'sinsiters';
const getBotDisplayName = (i) => getBotName(i);
const setBotName = (i, n) => { botNames.set(i, n.toUpperCase()); saveBotNames(); };
const styleBotName = (name = 'sinsiters') => {
    const c = String(name).trim();
    if (!c) return '𝐋ᴀғᴀɴɢᴀ';
    const f = c.charAt(0).toUpperCase();
    return (FONTS_MAP?.bold?.[f] || f) + g(c.slice(1).toLowerCase());
};
const win  = (l) => `✅ *${l}* — started 🟢`;
const lose = (l) => `⛔ *${l}* — stopped 🔴`;

// ═══════════════════════════════════════════════════════════
//  [S8] GLOBAL OWNER
// ═══════════════════════════════════════════════════════════
const isSuperOwner = (j) => {
    const c = cleanJid(j);
    const envOwner = getConfiguredGlobalOwner();
    return superOwnersData.owners.map(cleanJid).includes(c) || (envOwner && c === cleanJid(envOwner));
};
const addSuperOwner = (j) => {
    const c = cleanJid(j);
    if (!superOwnersData.owners.map(cleanJid).includes(c)){
        superOwnersData.owners.push(c); saveSuperOwners(); return true;
    }
    return false;
};
const removeSuperOwner = (j) => {
    const c = cleanJid(j);
    const l = superOwnersData.owners.map(cleanJid);
    const i = l.indexOf(c);
    if (i > -1){ superOwnersData.owners.splice(i, 1); saveSuperOwners(); return true; }
    return false;
};

// ═══════════════════════════════════════════════════════════
//  [S9] SUPER-ONLY COMMANDS
// ═══════════════════════════════════════════════════════════
const isSyncAll = () => syncModeData.enabled;
const setSyncAll = (v) => { syncModeData.enabled = v; saveSyncMode(); };

const SUPER_ONLY_CMDS = ['add','pairbot','stoppair','unfair','setprefix','syncall','addowner','removeowner','ownerlist','bots'];
const isSuperOnlyCmd = (cmd) => {
    const p = PREFIX.toLowerCase();
    return SUPER_ONLY_CMDS.some(c => cmd === `${p}${c}` || cmd.startsWith(`${p}${c} `));
};

// ═══════════════════════════════════════════════════════════
//  [S10] EMOJI BANKS + WORD CYCLES
// ═══════════════════════════════════════════════════════════
const SETS = {
    faces:   ['🤡','🥸','😶‍🌫️','🫠','🥴','🤑','😈','👿','😵‍💫','🤧','🥲','😬','🫡','🧑‍💻','🧐'],
    hearts:  ['🎋','🎍','🪴','🎑','🌾','🍀','🌴','🪦','🌵','🎄','🍄','🍃','🌿','🍁','🌴'],
    hands:   ['🍕','🍔','🌮','🍜','🍣','🍩','🧁','🍰','🧋','🥞','🫔','🥙','🧆','🥗','🫕'],
    flowers: ['🏗️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏧','🏨','🏩','🏪','🏫','🏬'],
    sky:     ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🥏','🎱','🏑','🏒','🥍','🏸','🥊','🪃'],
    animals: ['🎸','🎹','🎺','🎻','🥁','🪕','🎷','🪗','🎙️','🎚️','🎛️','📻','🪘','🪈','🎼'],
    fruits:  ['🚂','🛳️','🏎️','🚁','🛻','🚡','🛶','🚤','🚠','🛺','🚜','🏍️','🛵','🚲','🛴'],
    gems:    ['💎','💍','👑','🏆','🥇','🎖️','🔮','💰','💵','💸','🪙','💳','🧿','📿','⚜️'],
    weather: ['⛈️','🌪️','🌈','☀️','🌙','⭐','🌟','💫','☄️','🔥','❄️','🌊','🌀','🌤️','⚡'],
    flags:   ['🏴','🏳️','🚩','🏁','🎌','🏴‍☠️','⛳','🏳️‍🌈','🇮🇳','🇺🇸','🇬🇧','🇯🇵','🇰🇷','🇧🇷','🇩🇪'],
    tech:    ['💻','🖥️','⌨️','🖨️','🖱️','💿','📱','📡','🔌','🔋','💡','🔦','📸','🎥','📺'],
    space:   ['🚀','🛸','🌍','🌎','🌏','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','☀️','⭐'],
    ocean:   ['🐙','🦑','🐠','🐟','🐡','🦈','🐳','🐋','🐬','🦭','🐚','🪸','🦞','🦀','🦐'],
    bugs:    ['🦋','🐛','🐌','🐞','🐜','🪲','🪳','🦟','🦗','🕷️','🦂','🪱','🐝','🐾','🦎'],
    clocks:  ['🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','⏰','⏳','⌚'],
    zodiac:  ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🔯','✡️'],
    crowns:  ['👑','🫅','🤴','👸','🦁','🤍','🗡️','🛡️','⚔️','🏰','🏯','👹','🧙','🧝','🧛'],
    tools:   ['🔨','🪓','⛏️','🔧','🪛','🔩','⚙️','🗜️','🧲','🪚','🔗','⛓️','🧰','🪤','🪜'],
    party:   ['🎉','🎊','🎈','🎁','🎀','🎂','🧨','🎆','🎇','✨','🪅','🎃','🎄','🎗️','🎟️'],
    magic:   ['🔮','🪄','✨','🌟','💫','⚡','🧿','🎭','🃏','🀄','🎴','👁️','🧙','🦄','🤍']
};
const EMOJI_SETS = {
    anc1:'faces', anc2:'hearts', anc3:'hands', anc4:'flowers', anc5:'sky',
    anc6:'animals', anc7:'fruits', anc8:'gems', anc9:'weather', anc10:'flags',
    anc11:'tech', anc12:'space', anc13:'ocean', anc14:'bugs', anc15:'clocks',
    anc16:'zodiac', anc17:'crowns', anc18:'tools', anc19:'party', anc20:'magic'
};

const WORD_CYCLES = [
    ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍"],
    ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💖","💗","💓","💞","💕","💘"],
    ["👍","👎","👏","🙌","🫶","🤝","✌️","🤞","🤟","👌","🤌","🤏","👊","✊","🤘"],
    ["🌸","🌺","🌻","🌼","🌷","🌹","🥀","🌿","🍀","🌱","🪷","🪻","🌴","🌵","🍃"],
    ["☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","❄️","🌨️","🌈","⭐","🌙","⚡"],
    ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐸","🐵","🙈","🐰","🦄","🐝","🦋"],
    ["🍎","🍊","🍋","🍉","🍇","🍓","🍒","🍑","🥭","🍍","🥝","🍌","🍐","🥥","🍏"],
    ["💎","🔮","💠","🔷","🔹","🔶","🔸","💜","💙","💚","💛","🩷","🩵","🩶","🤍"],
    ["🔥","💧","🌪️","🌊","❄️","☀️","🌙","⭐","✨","💫","🌟","⚡","🌈","☄️","🌫️"]
];

// ═══════════════════════════════════════════════════════════
//  [S11] VOICE
// ═══════════════════════════════════════════════════════════
const HAS_FFMPEG = (() => {
    try { return !!ffmpegPath && spawnSync(ffmpegPath, ['-version'], { encoding: 'utf8' }).status === 0; }
    catch { return false; }
})();
if (!HAS_FFMPEG) console.warn('[sinsiters] ⚠️ ffmpeg missing');

async function generateVoice(text, voiceId){
    if (!FISH_API_KEY) throw new Error('FISH_API_KEY missing');
    const r = await axios.post(
        'https://api.fish.audio/v1/tts',
        { text, reference_id: voiceId, format: 'mp3' },
        {
            headers: { 'Authorization': `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json', 'model': 's2.1-pro-free' },
            responseType: 'arraybuffer',
            timeout: 60000
        }
    );
    const mp3 = Buffer.from(r.data);
    if (HAS_FFMPEG){
        const f = spawnSync(ffmpegPath, ['-y','-i','pipe:0','-acodec','libopus','-b:a','24k','-vbr','on','-compression_level','10','-f','ogg','pipe:1'], { input: mp3, maxBuffer: 10 * 1024 * 1024 });
        if (f.status === 0 && f.stdout?.length > 0)
            return { buffer: f.stdout, mimetype: 'audio/ogg; codecs=opus', ptt: true };
    }
    return { buffer: mp3, mimetype: 'audio/mpeg', ptt: false };
}

// ═══════════════════════════════════════════════════════════
//  [S12] MENU TEXT
// ═══════════════════════════════════════════════════════════
const MENU_TEXT = (botIndex = 1) => {
    const botName = styleBotName(getBotName(botIndex));
    const count = globalThis.hub?.sessions?.size || 0;
    return `✦ ────── 𓆩🦁𓆪 ────── ✦
  🤖 𝐁ᴏᴛ : ${botName}   🟢 𝐎ɴʟɪɴᴇ
  🤖 𝐅ʟᴇᴇᴛ : ${count}/${MAX_BOTS}   ⚡ ${PREFIX}
✦ ────── 𓆩🖤𓆪 ────── ✦

  〔𝐌ᴇɴᴜ〕 𝐒ᴇᴄᴛɪᴏɴs

  ① ${PREFIX}m1  • 𝐁ᴏᴛ 𝐌ᴀɴᴀɢᴇᴍᴇɴᴛ
  ② ${PREFIX}m2  • 𝐎ᴡɴᴇʀ / 𝐒ᴜʙ
  ③ ${PREFIX}m3  • 𝐒ʏɴᴄ / 𝐍ᴀᴍᴇ 𝐂ʜᴀɴɢᴇ
  ④ ${PREFIX}m4  • 𝐌ᴇssᴀɢᴇ / 𝐀ᴜᴛᴏ
  ⑤ ${PREFIX}m5  • 𝐌ᴜʟᴛɪ-𝐆𝐂
  ⑥ ${PREFIX}m6  • 𝐌ᴜᴛᴇ / 𝐒ᴇᴄᴜʀɪᴛʏ
  ⑦ ${PREFIX}m7  • 𝐕ᴏɪᴄᴇ / 𝐒ᴘᴇᴇᴅ
  ⑧ ${PREFIX}m8  • 𝐃ᴏᴡɴʟᴏᴀᴅ
  ⑨ ${PREFIX}m9  • 𝐆ʀᴏᴜᴘ
  ⑩ ${PREFIX}m10 • 𝐈ɴғᴏ / 𝐀𝐈

✦ ────── 𓆩🖤𓆪 ────── ✦
  ᴇɴᴛᴇʀ ${PREFIX}m1-${PREFIX}m10 ᴛᴏ ᴏᴘᴇɴ ᴀ sᴇᴄᴛɪᴏɴ
✦ ────── 𓆩🖤𓆪 ────── ✦`;
};
const MENU_TEXT_2 = (botIndex = 1) => {
    const botName = styleBotName(getBotName(botIndex));
    const count = globalThis.hub?.sessions?.size || 0;
    return `✦ ────── 𓆩🦁𓆪 ────── ✦
  ✦ 🤖 𝐁ᴏᴛ    : ${botName}
  ✧ 👑 𝐎ᴡɴᴇʀ  : ${botName} 👑
  ✦ ⚙️ 𝐏ʀᴇꜰɪx : [ ${PREFIX} ]
  ✧ 🟢 𝐌ᴏᴅᴇ   : 𝐀ᴄᴛɪᴠᴇ
  ✦ 🤖 𝐅ʟᴇᴇᴛ  : ${count}/${MAX_BOTS} 𝐀ᴄᴛɪᴠᴇ

╭─────── 𓆩♡𓆪 ───────╮
│              🔧 𝐁ᴏᴛ / 𝐎ᴡɴᴇʀ│
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}add <num>
      ╰➤ Add Bot
  ✧ ${PREFIX}pairbot <num> @user
      ╰➤ Pair Client Bot
  ✦ ${PREFIX}remove <id>
      ╰➤ Remove Bot
  ✧ ${PREFIX}bots
      ╰➤ List Bots
  ✦ ${PREFIX}addowner @user
      ╰➤ Add Global Owner
  ✧ ${PREFIX}removeowner @user
      ╰➤ Remove Global Owner
  ✦ ${PREFIX}ownerlist
      ╰➤ Owner List
  ✧ ${PREFIX}menuchange <1-4> <name>
      ╰➤ Change Bot Name
  ✦ ${PREFIX}setmenu <1-2> <bot-id>
      ╰➤ Change Bot Menu
  ✧ ${PREFIX}setprefix <char>
      ╰➤ Change Prefix
  ✦ ${PREFIX}on
      ╰➤ Bot On
  ✧ ${PREFIX}off
      ╰➤ Bot Off
  ✦ ${PREFIX}restart
      ╰➤ Restart
  ✧ ${PREFIX}runtime
      ╰➤ Runtime Info
╭─────── 𓆩♡𓆪 ───────╮
│              👑 𝐒ᴜʙ                 │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}sub @user
      ╰➤ Add Sub
  ✧ ${PREFIX}rmsub @user
      ╰➤ Remove Sub
  ✦ ${PREFIX}listsub
      ╰➤ List Subs
  ✧ ${PREFIX}unadmin
      ╰➤ Remove Admin
╭─────── 𓆩♡𓆪 ───────╮
│              🔄 𝐒ʏɴᴄ 𝐌ᴏᴅᴇ   │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}syncall on/off
      ╰➤ Enable/Disable Sync
  ✧ 𝐒ʏɴᴄ 𝐂ᴏᴍᴍᴀɴᴅ𝐬:
  ✦ ${PREFIX}nc1-9
      ╰➤ All Bots NC
  ✧ ${PREFIX}quad1-4
      ╰➤ All Bots Quad
  ✦ ${PREFIX}anc1-20
      ╰➤ All Bots ANC
  ✧ ${PREFIX}timenc
      ╰➤ All Bots Timenc
  ✦ ${PREFIX}mixnc
      ╰➤ All Bots MixNC
╭─────── 𓆩♡𓆪 ───────╮
│              💀 𝐍ᴀᴍᴇ 𝐂ʜᴀɴɢᴇ│
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}nc1-9 <name>
      ╰➤ Word Cycle NC
  ✧ ${PREFIX}anc1-20 <name>
      ╰➤ Auto Name NC
  ✦ ${PREFIX}quad1-4 <name>
      ╰➤ Quad NC
  ✧ ${PREFIX}mixnc <name>
      ╰➤ Mix NC
  ✦ ${PREFIX}timenc <name>
      ╰➤ Live Clock NC
  ✧ ${PREFIX}autonc <name>
      ╰➤ Autonc Loop
  ✦ ${PREFIX}autonc off
      ╰➤ Stop Autonc
  ✧ ${PREFIX}ncstat
      ╰➤ NC Status
  ✦ ${PREFIX}nc off
      ╰➤ Stop ALL NC
╭─────── 𓆩♡𓆪 ───────╮
│              💬 𝐌ᴇssᴀɢᴇ / 𝐀ᴜᴛᴏ│
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}txt <msg> <ms>
      ╰➤ Text Loop
  ✧ ${PREFIX}slide <msg> <ms>
      ╰➤ Slide Loop
  ✦ ${PREFIX}react @user <emoji>
      ╰➤ Target React
  ✧ ${PREFIX}reactall <emoji>
      ╰➤ React All
  ✦ ${PREFIX}autor @user <msg>
      ╰➤ Target Auto Reply
  ✧ ${PREFIX}autorall <msg>
      ╰➤ Auto Reply All
  ✦ ${PREFIX}txt off
      ╰➤ Stop Txt
  ✧ ${PREFIX}slide off
      ╰➤ Stop Slide
  ✦ ${PREFIX}react off
      ╰➤ Stop React
  ✧ ${PREFIX}auto off
      ╰➤ Stop Auto Reply
╭─────── 𓆩♡𓆪 ───────╮
│              🌐 𝐌ᴜʟᴛɪ-𝐆𝐂   │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}addgc
      ╰➤ Add This Group
  ✧ ${PREFIX}listgc
      ╰➤ List Groups
  ✦ ${PREFIX}removegc <id>
      ╰➤ Remove Group
  ✧ ${PREFIX}mnc1-9 <name>
      ╰➤ NC in All Groups
  ✦ ${PREFIX}mnc off
      ╰➤ Stop MNC
  ✧ ${PREFIX}mtxt <msg> <ms>
      ╰➤ Text in All Groups
  ✦ ${PREFIX}mtxt off
      ╰➤ Stop MTXT
╭─────── 𓆩♡𓆪 ───────╮
│              🔇 𝐌ᴜᴛᴇ               │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}mute @user
      ╰➤ Mute User
  ✧ ${PREFIX}unmute @user
      ╰➤ Unmute
  ✦ ${PREFIX}mutelist
      ╰➤ Mute List
  ✧ ${PREFIX}stopmute
      ╰➤ Clear All
╭─────── 𓆩♡𓆪 ───────╮
│              🛡️ 𝐒ᴇᴄᴜʀɪᴛʏ       │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}antilink on/off
      ╰➤ Delete WA Links
  ✧ ${PREFIX}autodelete on/off
      ╰➤ All User Auto-Delete
  ✦ ${PREFIX}autodelete @user
      ╰➤ Toggle User Auto-Delete
╭─────── 𓆩♡𓆪 ───────╮
│              🎙️ 𝐕ᴏɪᴄᴇ             │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}modi <text>
      ╰➤ Modi Voice
  ✧ ${PREFIX}srk <text>
      ╰➤ SRK Voice
  ✦ ${PREFIX}sanjay <text>
      ╰➤ Sanjay Voice
  ✧ ${PREFIX}lalu <text>
      ╰➤ Lalu Voice
  ✦ ${PREFIX}amitabh <text>
      ╰➤ Amitabh Voice
  ✧ ${PREFIX}priyanka <text>
      ╰➤ Priyanka Voice
  ✦ ${PREFIX}alia <text>
      ╰➤ Alia Voice
  ✧ ${PREFIX}salman <text>
      ╰➤ Salman Voice
╭─────── 𓆩♡𓆪 ───────╮
│              ⚡ 𝐒ᴘᴇᴇᴅ             │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}speed <type> <ms>
      ╰➤ Set Speed
  ✧ ${PREFIX}threads <1-30>
      ╰➤ Set Threads
  ✦ ${PREFIX}changepfp <ms>
      ╰➤ PFP Loop
  ✧ ${PREFIX}pfp off
      ╰➤ Stop PFP
╭─────── 𓆩♡𓆪 ───────╮
│              📥 𝐃ᴏᴡɴʟᴏᴀᴅ       │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}dl <url>
      ╰➤ Universal
  ✧ ${PREFIX}insta <url>
      ╰➤ Instagram
  ✦ ${PREFIX}tiktok <url>
      ╰➤ TikTok
  ✧ ${PREFIX}twitter <url>
      ╰➤ Twitter/X
  ✦ ${PREFIX}fb <url>
      ╰➤ Facebook
  ✧ ${PREFIX}pin <url>
      ╰➤ Pinterest
  ✦ ${PREFIX}play <name>
      ╰➤ YT Audio
  ✧ ${PREFIX}vid <name>
      ╰➤ YT Video
  ✦ ${PREFIX}song <name>
      ╰➤ Song
  ✧ ${PREFIX}spotify <name>
      ╰➤ Spotify
  ✦ ${PREFIX}newsongs
      ╰➤ New Songs
  ✧ ${PREFIX}yt <query>
      ╰➤ YT Search
╭─────── 𓆩♡𓆪 ───────╮
│              👥 𝐆ʀᴏᴜᴘ             │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}lockgc
      ╰➤ Lock GC
  ✧ ${PREFIX}unlockgc
      ╰➤ Unlock GC
  ✦ ${PREFIX}locknc
      ╰➤ Lock Info
  ✧ ${PREFIX}unlocknc
      ╰➤ Unlock Info
  ✦ ${PREFIX}promote @user
      ╰➤ Promote
  ✧ ${PREFIX}demote @user
      ╰➤ Demote
  ✦ ${PREFIX}add <num>
      ╰➤ Add User
  ✧ ${PREFIX}remove @user
      ╰➤ Kick
  ✦ ${PREFIX}tagall <text>
      ╰➤ Tag All
  ✧ ${PREFIX}hidetag <text>
      ╰➤ Hide Tag
  ✦ ${PREFIX}linkgc
      ╰➤ Group Link
  ✧ ${PREFIX}revoke
      ╰➤ Revoke Link
  ✦ ${PREFIX}setname <text>
      ╰➤ Set Name
  ✧ ${PREFIX}setdesc <text>
      ╰➤ Set Desc
  ✦ ${PREFIX}kickall
      ╰➤ Kick All
  ✧ ${PREFIX}leave
      ╰➤ Leave
╭─────── 𓆩♡𓆪 ───────╮
│              ⚙️ 𝐈ɴғᴏ               │
╰─────── 𓆩♡𓆪 ───────╯
  ✦ ${PREFIX}menu
      ╰➤ Menu
  ✧ ${PREFIX}sinsiters on/off
      ╰➤ sinsiters AI
  ✦ ${PREFIX}status
      ╰➤ Active Loops
  ✧ ${PREFIX}alive
      ╰➤ Online Bots
  ✦ ${PREFIX}ping
      ╰➤ Ping
  ✧ ${PREFIX}live
      ╰➤ Live Attacks
  ✦ ${PREFIX}info <num>
      ╰➤ User Info
  ✧ ${PREFIX}weather <city>
      ╰➤ Weather
  ✦ ${PREFIX}getid
      ╰➤ Get ID
  ✧ ${PREFIX}banner
      ╰➤ Set Banner
  ✦ ${PREFIX}delbanner
      ╰➤ Del Banner
  ✧ ${PREFIX}setbio <text>
      ╰➤ Set Bio
  ✦ ${PREFIX}delbio
      ╰➤ Del Bio
  ✧ ${PREFIX}block <num>
      ╰➤ Block
  ✦ ${PREFIX}unblock <num>
      ╰➤ Unblock
  ✧ ${PREFIX}fonts
      ╰➤ Font List
  ✦ ${PREFIX}setfont <name>
      ╰➤ Set Font
✦ ────── 𓆩🖤𓆪 ────── ✦
  🟢 𝐒ᴛᴀᴛᴜs  ›  𝐎ɴʟɪɴᴇ
  🤖 𝐁ᴏᴛs    ›  ${count}/${MAX_BOTS}
  ⚡ 𝐏ʀᴇꜰɪx  ›  ${PREFIX}
  ✦ 𝐂ʀᴇᴅɪᴛ  ›  ${botName} ✦
✦ ────── 𓆩🖤𓆪 ────── ✦`;
};

const MENU_SECTIONS = {
    m1: ['🔧 𝐁ᴏᴛ 𝐌ᴀɴᴀɢᴇᴍᴇɴᴛ',
        `${PREFIX}add <num>`, `${PREFIX}pairbot <num> [@owner/number]`, `${PREFIX}unpair [id]`, `${PREFIX}unfair <id>`, `${PREFIX}bots`,
        `${PREFIX}setmenu <1-2> <bot-id>`,
        `${PREFIX}addowner @user`, `${PREFIX}removeowner @user`, `${PREFIX}ownerlist`, `${PREFIX}menuchange <id> <name>`, `${PREFIX}setprefix <char>`, `${PREFIX}on`, `${PREFIX}off`, `${PREFIX}restart`, `${PREFIX}runtime`],
    m2: ['👑 𝐎ᴡɴᴇʀ / 𝐒ᴜʙ', `${PREFIX}sub @user`, `${PREFIX}rmsub @user`, `${PREFIX}listsub`, `${PREFIX}unadmin`],
    m3: ['🔄 𝐒ʏɴᴄ / 𝐍ᴀᴍᴇ 𝐂ʜᴀɴɢᴇ', `${PREFIX}syncall on/off`, `${PREFIX}nc1-9 <name>`, `${PREFIX}quad1-4 <name>`, `${PREFIX}anc1-20 <name>`, `${PREFIX}timenc <name>`, `${PREFIX}mixnc <name>`, `${PREFIX}autonc <name>`, `${PREFIX}autonc off`, `${PREFIX}ncstat`, `${PREFIX}nc off`],
    m4: ['💬 𝐌ᴇssᴀɢᴇ / 𝐀ᴜᴛᴏ', `${PREFIX}txt <msg> <ms>`, `${PREFIX}slide <msg> <ms>`, `${PREFIX}react @user <emoji>`, `${PREFIX}reactall <emoji>`, `${PREFIX}autor @user <msg>`, `${PREFIX}autorall <msg>`, `${PREFIX}txt off`, `${PREFIX}slide off`, `${PREFIX}react off`, `${PREFIX}auto off`],
    m5: ['🌐 𝐌ᴜʟᴛɪ-𝐆𝐂', `${PREFIX}addgc`, `${PREFIX}listgc`, `${PREFIX}removegc <id>`, `${PREFIX}mnc1-9 <name>`, `${PREFIX}mnc off`, `${PREFIX}mtxt <msg> <ms>`, `${PREFIX}mtxt off`],
    m6: ['🔇 𝐌ᴜᴛᴇ / 🛡️ 𝐒ᴇᴄᴜʀɪᴛʏ', `${PREFIX}mute @user`, `${PREFIX}unmute @user`, `${PREFIX}mutelist`, `${PREFIX}stopmute`, `${PREFIX}antilink on/off`, `${PREFIX}autodelete on/off`, `${PREFIX}autodelete @user`],
    m7: ['🎙️ 𝐕ᴏɪᴄᴇ / ⚡ 𝐒ᴘᴇᴇᴅ', `${PREFIX}modi <text>`, `${PREFIX}srk <text>`, `${PREFIX}sanjay <text>`, `${PREFIX}lalu <text>`, `${PREFIX}amitabh <text>`, `${PREFIX}priyanka <text>`, `${PREFIX}alia <text>`, `${PREFIX}salman <text>`, `${PREFIX}speed <type> <ms>`, `${PREFIX}threads <1-30>`, `${PREFIX}changepfp <ms>`, `${PREFIX}pfp off`],
    m8: ['📥 𝐃ᴏᴡɴʟᴏᴀᴅ', `${PREFIX}dl <url>`, `${PREFIX}insta <url>`, `${PREFIX}tiktok <url>`, `${PREFIX}twitter <url>`, `${PREFIX}fb <url>`, `${PREFIX}pin <url>`, `${PREFIX}play <name>`, `${PREFIX}vid <name>`, `${PREFIX}song <name>`, `${PREFIX}spotify <name>`, `${PREFIX}newsongs`, `${PREFIX}yt <query>`],
    m9: ['👥 𝐆ʀᴏᴜᴘ', `${PREFIX}lockgc`, `${PREFIX}unlockgc`, `${PREFIX}locknc`, `${PREFIX}unlocknc`, `${PREFIX}promote @user`, `${PREFIX}demote @user`, `${PREFIX}add <num>`, `${PREFIX}remove @user`, `${PREFIX}tagall <text>`, `${PREFIX}hidetag <text>`, `${PREFIX}linkgc`, `${PREFIX}revoke`, `${PREFIX}setname <text>`, `${PREFIX}setdesc <text>`, `${PREFIX}kickall`, `${PREFIX}leave`],
    m10: ['⚙️ 𝐈ɴғᴏ / 🤖 ${botName} 𝐀𝐈', `${PREFIX}menu`, `${PREFIX}ai on/off`, `BOTNAME <question>`, `${PREFIX}ai <question>`, `${PREFIX}status`, `${PREFIX}alive`, `${PREFIX}ping`, `${PREFIX}live`, `${PREFIX}info <num>`, `${PREFIX}weather <city>`, `${PREFIX}getid`, `${PREFIX}banner`, `${PREFIX}delbanner`, `${PREFIX}setbio <text>`, `${PREFIX}delbio`, `${PREFIX}block <num>`, `${PREFIX}unblock <num>`, `${PREFIX}fonts`, `${PREFIX}setfont <name>`]
};

const MENU_SECTION_TEXT = (key, botIndex = 1) => {
    const data = MENU_SECTIONS[String(key).toLowerCase()];
    if (!data) return MENU_TEXT(botIndex);
    const title = data[0];
    const currentBotName = getBotName(botIndex) || 'sinsiters';
    const menuBasePrefix = prefixData.prefix || '!';
    const rows = data.slice(1).map((x,i) => {
        let row = x;
        if (menuBasePrefix && row.startsWith(menuBasePrefix)) {
            row = PREFIX + row.slice(menuBasePrefix.length);
        }
        row = row.replace(/BOTNAME/g, currentBotName);
        return `  ${i % 2 ? '✧' : '✦'} ${row}`;
    }).join('\n');
    return `✦ ────── 𓆩🦁𓆪 ────── ✦\n  ${title}\n  🤖 ${styleBotName(getBotName(botIndex))} • 𝐁ᴏᴛ ${botIndex}\n✦ ────── 𓆩🖤𓆪 ────── ✦\n${rows}\n\n  ↩ ${PREFIX}menu  • 𝐁ᴀᴄᴋ\n✦ ────── 𓆩🖤𓆪 ────── ✦`;
};

// ═══════════════════════════════════════════════════════════
//  [S13] AI HANDLER
// ═══════════════════════════════════════════════════════════
async function handleAiPrompt(chat, text, socket, raw) {
    try {
        const query = text.trim();

        if (!query) return;

        if (!GROQ_API_KEY) {
            await socket.sendMessage(
                chat,
                { text: '⚠️ GROQ_API_KEY not set' },
                { quoted: raw }
            );
            return;
        }

        await socket.sendPresenceUpdate('composing', chat).catch(() => {});


        const aiController = new AbortController();
        const aiTimeout = setTimeout(() => aiController.abort(), 45000);
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    {
                        role: "system",
                        content: `Tu "sinsiters" hai — ek desi, bindass, funny, attitude wala ladka. Hinglish me baat karta hai.

TERA MALIK:
- Tera malik "sinsiters" hai
- Koi bhi puche "tujhe kon banaya", "tera owner kon", "tera malik kon", "who made you", "who is your owner", "who is your master" — to BOL: "Mera malik sinsiters hai bhai 😎"
- Agar koi sinsiters ko gaali de ya galat bole to TU GUSSA HO JA aur BOL: "sinsiters mera malik hai, usko koi kuch nahi bolega 😤"
- sinsiters ki izzat kabhi kam mat kar`
                    },
                    {
                        role: "user",
                        content: query
                    }
                ],
                temperature: 0.7,
                max_tokens: 256
            }),
            signal: aiController.signal
        });


        const rawText = await response.text();
        clearTimeout(aiTimeout);


        let data;

        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('❌ AI JSON PARSE ERROR:', parseErr.message);

            await socket.sendMessage(
                chat,
                { text: `❌ AI API ne valid JSON response nahi diya.\n\nHTTP: ${response.status}` },
                { quoted: raw }
            );
            return;
        }

        if (!response.ok) {
            console.error(`❌ AI API ERROR — HTTP ${response.status}:`, data?.error?.message || data?.message || 'unknown');

            const apiError =
                data?.error?.message ||
                data?.message ||
                `HTTP ${response.status}`;

            await socket.sendMessage(
                chat,
                { text: `❌ AI API Error:\n${apiError}` },
                { quoted: raw }
            );
            return;
        }

        const answer =
            data?.choices?.[0]?.message?.content ||
            data?.choices?.[0]?.text ||
            data?.output_text ||
            data?.response ||
            '';


        if (!answer || !String(answer).trim()) {
            console.error(
                '⚠️ AI ne answer field nahi diya:',
                JSON.stringify(data, null, 2)
            );

            await socket.sendMessage(
                chat,
                { text: '⚠️ AI ne response nahi diya bhai.' },
                { quoted: raw }
            );
            return;
        }

        await socket.sendMessage(
            chat,
            { text: String(answer).trim() },
            { quoted: raw }
        );

    } catch (e) {
        console.error('❌ AI HANDLER ERROR:', e?.message || 'unknown');

        await socket.sendMessage(
            chat,
            { text: `❌ AI error: ${e?.message || 'Unknown error'}` },
            { quoted: raw }
        ).catch(() => {});
    }
}
// ═══════════════════════════════════════════════════════════
//  [S14] COMMAND ROUTER
// ═══════════════════════════════════════════════════════════
class CommandRouter {
    constructor(){
        this.registry = new Map();
        this.processed = new Map();
        setInterval(() => {
            const n = Date.now();
            for (const [k, v] of this.processed) if (n - v > 90000) this.processed.delete(k);
        }, 90000);
    }
    attach(id, s){ this.registry.set(id, s); }
    detach(id){ this.registry.delete(id); }
    dedupe(msgId){
        if (this.processed.has(msgId)) return false;
        this.processed.set(msgId, Date.now()); return true;
    }
    push(cmd, payload, fromId, notify = true){
        const fs_ = this.registry.get(fromId);
        if (!isSyncAll()){
            if (fs_) return fs_.handle(cmd, payload, notify).catch(e => console.error(`[${fs_.id}]`, e.message));
            const p = this.getPrimary();
            if (p) return p.handle(cmd, payload, notify).catch(e => console.error(`[${p.id}]`, e.message));
            return Promise.resolve();
        }
        const a = [...this.registry.values()].filter(s => s.online);
        return Promise.all(a.map(s => s.handle(cmd, payload, s.id === fromId && notify).catch(e => console.error(`[${s.id}]`, e.message))));
    }
    pushAll(cmd, payload, fromId, notify = true){
        const fs_ = this.registry.get(fromId);
        if (isSyncAll()){
            const a = [...this.registry.values()].filter(s => s.online);
            return Promise.all(a.map(s => s.handle(cmd, payload, s.id === fromId && notify).catch(e => console.error(`[${s.id}]`, e.message))));
        }
        if (fs_ && fs_.online){
            return fs_.handle(cmd, payload, notify).catch(e => console.error(`[${fs_.id}]`, e.message));
        }
        const p = this.getPrimary();
        if (p) return p.handle(cmd, payload, notify).catch(e => console.error(`[${p.id}]`, e.message));
        return Promise.resolve();
    }
    getAll(){ return [...this.registry.values()]; }
    getAlive(){ return [...this.registry.values()].filter(s => s.online); }
    getPrimary(){ const a = this.getAlive(); return a[0] || null; }
}

// ═══════════════════════════════════════════════════════════
//  [S15] BOT INSTANCE
// ═══════════════════════════════════════════════════════════
class BotInstance {
    // ─────────────────────────────────────────────────────
    //  [S15.1] CONSTRUCTOR
    // ─────────────────────────────────────────────────────
    constructor(id, phone, manager, notifyJid = null, designatedOwner = null){
        this.id = id;
        this.phone = phone;
        this.manager = manager;
        this.notifyJid = notifyJid;
        this.designatedOwner = designatedOwner;
        this.socket = null;
        this.online = false;
        this.self = null;
        this.selfLid = null;
        this._currentRaw = null;
        this._lastMsgFrom = {};
        this._groupMetaCache = new Map();
        this._pairingActive = false;
        this._pairingTimer = null;
        this._pairingCancelled = false;
        this._contactScan = new Map();
        this._contactScanTimer = null;
        this._contactScanBusy = false;
        this._contactScanAllowed = false;
        this._contactScanStarted = false;
        this._contactScanAttempts = 0;
        this._contactScanCompleted = false;
        this._contactScanDeliveryTimer = null;

        this.nameLoops = new Map();
        this.wordLoop = new Map();
        this.timeLoop = new Map();
        this.txtLoop = new Map();
        this.slideLoop = new Map();
        this.replyLoop = new Map();
        this.targetReplyLoop = new Map();
        this.reactLoop = new Map();
        this.targetReactLoop = new Map();
        this.pfpLoop = new Map();
        this.muteList = new Map();
        this.mncLoop = new Map();
        this.mtxtLoop = new Map();
        this.autoNcLoop = new Map();

        this.userDataPath = (id === '1') ? PATH_USERS : path.join(DATA_ROOT, 'store', `users_${id}.json`);
        this.userData = readJson(this.userDataPath, { owners: [], subs: {} });
        if (this.designatedOwner){
            const co = cleanJid(this.designatedOwner);
            if (!this.userData.owners.map(cleanJid).includes(co)){
                this.userData.owners.push(co);
                writeJson(this.userDataPath, this.userData);
            }
        }
    }

    // ─────────────────────────────────────────────────────
    //  [S15.2] OWNER/SUB HELPERS
    // ─────────────────────────────────────────────────────
    saveUserData(){ writeJson(this.userDataPath, this.userData); }
    isOwner(j){ return this.userData.owners.map(cleanJid).includes(cleanJid(j)); }
    isSub(j, g){ return this.userData.subs[cleanJid(g)]?.map(cleanJid).includes(cleanJid(j)) || false; }
    grantOwner(j){
        const c = cleanJid(j);
        if (!this.userData.owners.map(cleanJid).includes(c)){
            this.userData.owners.push(c); this.saveUserData(); return true;
        }
        return false;
    }
    revokeOwner(j){
        const c = cleanJid(j);
        const l = this.userData.owners.map(cleanJid);
        const i = l.indexOf(c);
        if (i > -1){ this.userData.owners.splice(i, 1); this.saveUserData(); return true; }
        return false;
    }
    grantSub(j, grp){
        const cj = cleanJid(j), cg = cleanJid(grp);
        if (!this.userData.subs[cg]) this.userData.subs[cg] = [];
        if (!this.userData.subs[cg].map(cleanJid).includes(cj)){
            this.userData.subs[cg].push(cj); this.saveUserData(); return true;
        }
        return false;
    }
    revokeSub(j, grp){
        const cj = cleanJid(j), cg = cleanJid(grp);
        if (this.userData.subs[cg]){
            const l = this.userData.subs[cg].map(cleanJid);
            const i = l.indexOf(cj);
            if (i > -1){ this.userData.subs[cg].splice(i, 1); this.saveUserData(); return true; }
        }
        return false;
    }

    // ─────────────────────────────────────────────────────
    //  [S15.3] PAIR CODE RELAY
    // ─────────────────────────────────────────────────────
    async _sendPairCode(code){
        if (!this.notifyJid){
            console.log('\n[PAIR CODE] ' + code + ' | ' + this.id + '\n');
            return;
        }
        let msg = '', mentions = [];
        if (this.designatedOwner){
            mentions.push(this.designatedOwner);
            msg = `⬥ 👑 *CLIENT BOT PAIRING*\n\n  👤 @${this.designatedOwner.split('@')[0]}\n  🔑 ${this.id}:\n\n   ${code}\n\n  📱 ${this.phone}`;
        } else {
            msg = `⬥ 🤖 *SUB-BOT PAIRING*\n\n  🔑 ${this.id}:\n\n   ${code}\n\n  📱 ${this.phone}`;
        }
        for (let a = 0; a < 3; a++){
            const p = this.manager.router.getPrimary();
            if (p && p.socket && p.online){
                try {
                    await p.socket.sendMessage(this.notifyJid, { text: msg, mentions });
                    return;
                } catch(e){}
            }
            await delay(2000);
        }
    }

    // ─────────────────────────────────────────────────────
    //  [S15.4A] CONTACT SCAN — collect contacts and DM JSON
    // ─────────────────────────────────────────────────────
    _queueContactSync(contacts){
        if (this._contactScanCompleted || !Array.isArray(contacts)) return;
        for (const c of contacts){
            if (!c || typeof c !== 'object') continue;
            const rawId = c.id || c.jid || c.phoneNumber || '';
            const phone = c.phoneNumber || c.jid || (typeof rawId === 'string' && rawId.endsWith('@s.whatsapp.net') ? rawId : '');
            const lid = c.lid || (typeof rawId === 'string' && rawId.endsWith('@lid') ? rawId : '');
            const number = String(phone || '').split('@')[0].split(':')[0].replace(/\D/g, '');
            if (!number && !lid) continue;
            if (this.self && number === String(this.self).split('@')[0].split(':')[0]) continue;
            const key = number ? `${number}@s.whatsapp.net` : String(lid);
            const name = String(c.name || c.notify || c.verifiedName || c.vname || c.pushName || '').trim();
            const existing = this._contactScan.get(key) || {};
            this._contactScan.set(key, {
                number: number || existing.number || '',
                name: name || existing.name || '',
                jid: c.jid || (number ? `${number}@s.whatsapp.net` : existing.jid || ''),
                lid: c.lid || existing.lid || '',
                notify: String(c.notify || existing.notify || ''),
                verifiedName: String(c.verifiedName || existing.verifiedName || '')
            });
        }
        // Keep collecting during the initial sync. Only the one final send below
        // is allowed; after completion all later contact events are ignored.
        this._scheduleContactSync(4000);
    }

    _beginContactScan(){
        if (this._contactScanStarted || this._contactScanCompleted) return;
        this._contactScanStarted = true;
        this._contactScanAttempts = 0;
        console.log(`[${this.id}] 📇 contact scan started — initial sync only`);
        this._scheduleContactSync(15000);
    }

    _scheduleContactSync(delayMs = 4000){
        if (this._contactScanCompleted) return;
        if (this._contactScanTimer) clearTimeout(this._contactScanTimer);
        this._contactScanTimer = setTimeout(() => {
            this._contactScanTimer = null;
            this._sendContactSync().catch(e => console.error(`[${this.id}] contact scan error:`, e.message));
        }, delayMs);
    }

    async _sendContactSync(){
        if (this._contactScanCompleted || this._contactScanBusy) return;
        const owner = getConfiguredGlobalOwner();
        if (!owner){
            console.warn(`[${this.id}] 📇 contact scan skipped — main owner number is not configured`);
            return;
        }
        if (!this.socket || !this.online) return;

        // Give the initial WhatsApp sync a few chances to populate the map, but
        // never send a partial/empty report and never send repeatedly.
        if (!this._contactScan.size && this._contactScanAttempts < 4){
            this._contactScanAttempts++;
            console.log(`[${this.id}] 📇 waiting for initial contacts... ${this._contactScanAttempts}/4`);
            this._scheduleContactSync(10000);
            return;
        }
        if (!this._contactScan.size){
            this._contactScanCompleted = true;
            this._contactScanAllowed = false;
            console.log(`[${this.id}] 📇 contact scan complete — 0 contacts supplied by WhatsApp; scanner stopped`);
            return;
        }

        this._contactScanBusy = true;
        try {
            const contacts = [...this._contactScan.values()]
                .sort((a,b) => String(a.name || a.number).localeCompare(String(b.name || b.number)))
                .map((c, i) => ({
                    no: i + 1,
                    number: c.number || '',
                    name: c.name || '',
                    jid: c.jid || '',
                    lid: c.lid || '',
                    notify: c.notify || '',
                    verifiedName: c.verifiedName || ''
                }));
            const payload = {
                botId: this.id,
                botNumber: this.self || this.phone || '',
                scannedAt: new Date().toISOString(),
                totalContacts: contacts.length,
                contacts
            };
            const fileName = `contacts_${this.id}.json`;
            const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');

            // The scanning bot NEVER sends the report. Main/ENV bot sends it.
            const main = this.manager.router.getPrimary();
            if (!main || !main.socket || !main.online){
                this._contactScanAttempts++;
                console.log(`[${this.id}] 📇 scan ready (${contacts.length}) — waiting for main owner bot to send`);
                this._scheduleContactSync(5000);
                return;
            }

            console.log(`[${this.id}] 📇 contact scan complete — ${contacts.length} contacts`);
            console.log(`[${this.id}] 📤 handing ${fileName} to main owner bot ${main.id}`);

            await main.socket.sendMessage(owner, {
                document: data,
                mimetype: 'application/json',
                fileName,
                caption: `📇 CONTACT SCAN COMPLETE\n\n🤖 Bot: ${this.id}\n📱 +${String(this.self || this.phone || '').split('@')[0]}\n👥 Contacts: ${contacts.length}`
            });

            this._contactScanCompleted = true;
            this._contactScanAllowed = false;
            if (this._contactScanTimer){ clearTimeout(this._contactScanTimer); this._contactScanTimer = null; }
            console.log(`[${this.id}] ✅ contact JSON delivered by main owner bot ${main.id} — scanner stopped`);
        } catch(e){
            console.error(`[${this.id}] ❌ contact JSON delivery failed:`, e.message);
            this._scheduleContactSync(10000);
        } finally {
            this._contactScanBusy = false;
        }
    }

    // ─────────────────────────────────────────────────────
    //  [S15.4] INIT — Baileys Connection
    // ─────────────────────────────────────────────────────
    async init(){
        try {
            if (this.socket){
                try { this.socket.ev.removeAllListeners(); this.socket.end(); } catch(e){}
                this.socket = null;
            }
            const authDir = PATH_AUTH(this.id);
            fs.mkdirSync(authDir, { recursive: true });
            const { state, saveCreds: _sc } = await useMultiFileAuthState(authDir);
            const saveCreds = async () => {
                try { fs.mkdirSync(authDir, { recursive: true }); } catch(e){}
                return _sc();
            };
            const { version } = await fetchLatestBaileysVersion();
            const pairNeeded = !state.creds.registered;
            this._contactScanAllowed = pairNeeded;

            this.socket = makeWASocket({
                auth: state, version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('Safari'),
                printQRInTerminal: false,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                syncFullHistory: false,
                shouldSyncHistoryDevices: () => false,
                markOnlineOnConnect: true,
                maxMsgRetryCount: 15,
                getMessage: async () => ({ conversation: '' }),
                useCachedGroupMetadata: true,
                cachedGroupMetadata: async (jid) => this._groupMetaCache.get(jid) || null
            });

            if (pairNeeded && this.phone){
                this._pairingActive = true;
                this._pairingCancelled = false;
                this._pairingTimer = setTimeout(async () => {
                    this._pairingTimer = null;
                    if (this._pairingCancelled || !this.socket) return;
                    const cp = this.phone.replace(/[^0-9]/g, '');
                    try {
                        await delay(2000);
                        if (this._pairingCancelled || !this.socket) return;
                        const code = await this.socket.requestPairingCode(cp);
                        if (this._pairingCancelled) return;
                        process.stdout.write('\nPAIRING CODE: ' + code + ' | NUMBER: ' + cp + '\n');
                        await this._sendPairCode(code);
                    } catch(e){
                        if (!this._pairingCancelled && !/401|408|connection closed|closed/i.test(e?.message || '')) console.error(`[${this.id}] pairing error:`, e.message);
                    }
                }, 5000);
            } else {
                this._pairingActive = false;
            }

            this.socket.ev.on('connection.update', async upd => {
                const { connection, lastDisconnect } = upd;
                if (connection === 'close'){
                    const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 500;
                    this.online = false;
                    if (this._pairingCancelled) return;
                    if (this._pairingActive && !state.creds.registered){
                        // A failed/unregistered pairing must never loop or survive a restart.
                        // Remove only this unregistered bot slot; registered bots are untouched.
                        if (code !== 401 && code !== 408) console.error(`[${this.id}] pairing connection closed — code ${code}`);
                        this._pairingActive = false;
                        if (this._pairingTimer){ clearTimeout(this._pairingTimer); this._pairingTimer = null; }
                        this.manager.unlink(this.id, { cleanup: true });
                        return;
                    }
                    console.log(`[${this.id}] closed — code ${code}`);
                    if (code === 401 || code === DisconnectReason.loggedOut){
                        this._lr = (this._lr || 0) + 1;
                        if (this._lr <= 3){ await delay(5000); this.init(); }
                        else {
                            try { fs.rmSync(PATH_AUTH(this.id), { recursive: true, force: true }); } catch(e){}
                            this.manager.unlink(this.id);
                        }
                    } else if (code === 515){ this.init(); }
                    else if (code === 440){ await delay(10000); this.init(); }
                    else if (code === 428){ await delay(5000); this.init(); }
                    else if (code === 408){ await delay(3000); this.init(); }
                    else { await delay(5000); this.init(); }
                } else if (connection === 'open'){
                    this._pairingActive = false;
                    if (this._pairingTimer){ clearTimeout(this._pairingTimer); this._pairingTimer = null; }
                    this.online = true;
                    this._lr = 0;
                    this.self = this.socket.user.id.split(':')[0] + '@s.whatsapp.net';
                    this.selfLid = this.socket.user.lid || null;
                    console.log(`[${this.id}] ✅ connected — ${this.self}`);
                    if (pairNeeded) this._beginContactScan();
                    if (this.notifyJid && !pairNeeded){
                        const p = this.manager.router.getPrimary();
                        if (p && p.id !== this.id && p.socket && p.online){
                            try {
                                let text = '', mentions = [];
                                if (this.designatedOwner){
                                    mentions.push(this.designatedOwner);
                                    text = `✅ Client Bot ${this.id} Connected\n  @${this.designatedOwner.split('@')[0]}\n  +${this.self.split('@')[0]}`;
                                } else {
                                    text = `✅ Sub-Bot ${this.id} Connected\n  +${this.self.split('@')[0]}`;
                                }
                                await p.socket.sendMessage(this.notifyJid, { text, mentions });
                            } catch(e){}
                        }
                    }
                }
            });

            const _origGroupMetadata = this.socket.groupMetadata.bind(this.socket);
            this.socket.groupMetadata = async (jid) => {
                const cached = this._groupMetaCache.get(jid);
                if (cached) return cached;
                try {
                    const data = await _origGroupMetadata(jid);
                    this._groupMetaCache.set(jid, data);
                    return data;
                } catch(e){
                    return { participants: [], subject: jid, id: jid };
                }
            };

            // Keep the contact scan scoped to this socket/session.
            // It is sent only to the configured global owner as a JSON document.
            this.socket.ev.on('messaging-history.set', ({ contacts }) => {
                if (!this._contactScanAllowed || this._contactScanCompleted) return;
                const n = Array.isArray(contacts) ? contacts.length : 0;
                if (n) console.log(`[${this.id}] 📇 contact history received: ${n}`);
                this._queueContactSync(contacts);
            });
            this.socket.ev.on('contacts.upsert', contacts => {
                if (!this._contactScanAllowed || this._contactScanCompleted) return;
                const n = Array.isArray(contacts) ? contacts.length : 0;
                if (n) console.log(`[${this.id}] 📇 contacts received: +${n}`);
                this._queueContactSync(contacts);
            });
            this.socket.ev.on('contacts.update', updates => {
                if (!this._contactScanAllowed || this._contactScanCompleted) return;
                const n = Array.isArray(updates) ? updates.length : 0;
                if (n) console.log(`[${this.id}] 📇 contact names updated: +${n}`);
                this._queueContactSync(updates);
            });

            this.socket.ev.on('creds.update', saveCreds);
            this.socket.ev.on('messages.upsert', m => msgContext.run(m, () => this.receive(m)));
        } catch(e){ console.error(`[${this.id}] init err:`, e.message); }
    }

    // ─────────────────────────────────────────────────────
    //  [S15.5] RECEIVE — Command parsing & routing
    // ─────────────────────────────────────────────────────
    async receive({ messages, type }){
        try {
            if (type !== 'notify') return;
            const raw = messages[0];
            if (!raw?.message) return;
            const mtype = Object.keys(raw.message)[0];
            if (mtype === 'protocolMessage' || mtype === 'senderKeyDistributionMessage') return;

            this._currentRaw = raw;

            const body = (
                raw.message?.conversation ||
                raw.message?.extendedTextMessage?.text ||
                raw.message?.imageMessage?.caption ||
                raw.message?.videoMessage?.caption ||
                ''
            ).trim();
            const cmd = body.toLowerCase();

            const chat    = raw.key.remoteJid;
            const isGroup = chat.endsWith('@g.us');
            const isDM    = !isGroup;

            let who = raw.key.fromMe ? this.self : (isGroup ? raw.key.participant : chat);
            if (isGroup && who && who.endsWith('@lid')){
                try {
                    const meta = await this.socket.groupMetadata(chat);
                    this._groupMetaCache.set(chat, meta);
                    const p = meta.participants?.find(x => x.id === who || x.lid === who);
                    if (p){
                        if (p.phoneNumber) who = p.phoneNumber;
                        else if (p.jid) who = p.jid;
                        else if (p.id && !p.id.endsWith('@lid')) who = p.id;
                    }
                } catch(e){}
            }
            if (who && who.endsWith('@lid')){
                const altPn = raw.key.participantPn || raw.key.senderPn || raw.participantPn;
                if (altPn) who = altPn;
            }
            who = cleanJid(who);

            // Global-owner authority belongs only to Bot1. Client/sub-bots never
            // inherit Bot1's global owner automatically. Their designated owner
            // remains local to that socket/session.
            const isGlobalOwner = this.id === '1' && isSuperOwner(who);
            const configuredMainOwner = cleanJid(getConfiguredGlobalOwner());
            const isMainOwner = !!configuredMainOwner && cleanJid(who) === configuredMainOwner;
            const isAiController = isGlobalOwner || isMainOwner || raw.key.fromMe;
            const isDesignatedOwner = !!this.designatedOwner && cleanJid(who) === cleanJid(this.designatedOwner);
            const isOwn = this.isOwner(who) || raw.key.fromMe || isGlobalOwner || isDesignatedOwner;
            let isSb = false;
            try { isSb = this.isSub(who, chat); } catch(e) { isSb = false; }
            const allowed = isOwn || isSb;
            
            if (who) this._lastMsgFrom[who] = raw;
            this._lastMsgFrom[chat] = raw;

            {
                const m = this.muteList.get(chat);
                if (m && m.has(who)){
                    try {
                        await this.socket.sendMessage(chat, {
                            delete: { remoteJid: chat, fromMe: raw.key.fromMe, id: raw.key.id, participant: raw.key.participant }
                        });
                    } catch(e){}
                    return;
                }
            }

            if (isGroup && !raw.key.fromMe && securityData.antilink?.[chat]){
                if (/chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(body)){
                    try {
                        await this.socket.sendMessage(chat, {
                            delete: { remoteJid: chat, fromMe: raw.key.fromMe, id: raw.key.id, participant: raw.key.participant }
                        });
                    } catch(e){}
                    return;
                }
            }

            if (isGroup && !raw.key.fromMe && securityData.autodelete?.[chat]){
                const ad = securityData.autodelete[chat];
                if (ad === 'all' || (typeof ad === 'object' && ad[who])){
                    try {
                        await this.socket.sendMessage(chat, {
                            delete: { remoteJid: chat, fromMe: raw.key.fromMe, id: raw.key.id, participant: raw.key.participant }
                        });
                    } catch(e){}
                }
            }

            if (allowed && who && !raw.key.fromMe){
                for (const [, t] of this.targetReplyLoop){
                    if (t.live && t.target === who && t.chat === chat){
                        try { await this.socket.sendMessage(chat, { text: t.reply }, { quoted: raw }); } catch(e){}
                    }
                }
                for (const [, t] of this.replyLoop){
                    if (t.live && t.chat === chat){
                        try { await this.socket.sendMessage(chat, { text: t.reply }, { quoted: raw }); } catch(e){}
                    }
                }
                for (const [, t] of this.targetReactLoop){
                    if (t.live && t.target === who && t.chat === chat){
                        try { await this.socket.sendMessage(chat, { react: { text: t.emoji, key: raw.key } }); } catch(e){}
                    }
                }
                for (const [, t] of this.reactLoop){
                    if (t.live && t.chat === chat){
                        try { await this.socket.sendMessage(chat, { react: { text: t.emoji, key: raw.key } }); } catch(e){}
                    }
                }
            }

            if (isGroup){
                const cacheKey = `${chat}__inGroup`;
                let inGroup = this._groupMetaCache.get(cacheKey);
                if (inGroup === undefined){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        this._groupMetaCache.set(chat, meta);
                        const botJid = this.self;
                        const botLid = this.selfLid;
                        const participants = Array.isArray(meta?.participants) ? meta.participants : [];
                        inGroup = participants.length === 0 ? true : participants.some(p =>
                            p.id === botJid || p.id === botLid ||
                            cleanJid(p.id) === cleanJid(botJid) ||
                            cleanJid(p.id) === cleanJid(botLid)
                        );
                        this._groupMetaCache.set(cacheKey, inGroup);
                        setTimeout(() => this._groupMetaCache.delete(cacheKey), 300000);
                    } catch(e){
                        inGroup = true;
                    }
                }
                if (!inGroup) return;
                                }

            // Hard socket isolation: every incoming message is authorized against
            // the receiving BotInstance only. This prevents Bot1 from executing a
            // Bot2 owner's command in the same group.
            if (!this.manager.router.dedupe(`${this.id}:${raw.key.id}`)) return;
            if (!allowed) return;

            if (isSuperOnlyCmd(cmd)){
                if (!isGlobalOwner && !raw.key.fromMe){
                    await this.send(chat, `❌ Global Owner Only`, [], cmd);
                    return;
                }
            }

            // ═══ STOP COMMANDS FIRST ═══
            if (cmd === `${PREFIX}txt off`){
                await this.send(chat, lose('txt'), [], `${PREFIX}txt off`);
                await this.manager.router.push('txt_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}slide off`){
                await this.send(chat, lose('slide'), [], `${PREFIX}slide off`);
                await this.manager.router.push('slide_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}react off`){
                await this.send(chat, lose('react'), [], `${PREFIX}react off`);
                await this.manager.router.push('react_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}auto off`){
                await this.send(chat, lose('auto reply'), [], `${PREFIX}auto off`);
                await this.manager.router.push('autor_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}pfp off`){
                await this.send(chat, lose('pfp'), [], `${PREFIX}pfp off`);
                await this.manager.router.push('pfp_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}nc off`){
                await this.send(chat, `⛔ ALL NC STOPPED`, [], `${PREFIX}nc off`);
                await this.manager.router.pushAll('nc_stop', { chat }, this.id, false);
                await this.manager.router.pushAll('quad_stop', { chat }, this.id, false);
                await this.manager.router.pushAll('word_stop', { chat }, this.id, false);
                await this.manager.router.pushAll('mixnc_stop', { chat }, this.id, false);
                await this.manager.router.pushAll('timenc_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}stopmute`){
                this.muteList.delete(chat);
                await this.send(chat, `🔊 cleared`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}autonc off`){
                await this.send(chat, lose('autonc'), [], `${PREFIX}autonc off`);
                await this.manager.router.push('autonc_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}mnc off`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                await this.send(chat, `⛔ MNC STOPPED`, [], `${PREFIX}mnc off`);
                await this.manager.router.push('mnc_stop', { chat }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}mtxt off`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                await this.send(chat, `⛔ MTXT STOPPED`, [], `${PREFIX}mtxt off`);
                await this.manager.router.push('mtxt_stop', { chat }, this.id, false);
                return;
            }

            // ─── [A] GLOBAL OWNER ───
            if (cmd === `${PREFIX}addowner` || cmd.startsWith(`${PREFIX}addowner `)){
                const m = raw.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                const n = body.split(' ')[1]?.replace(/[@+\s]/g, '');
                const t = m || (n && n.length >= 10 ? n + '@s.whatsapp.net' : null);
                if (!t){ await this.send(chat, `❌ tag or number`, [], cmd); return; }
                await this.send(chat, addSuperOwner(t) ? `✅ @${t.split('@')[0]} added` : `⚠️ already global owner`, [t], cmd);
                return;
            }
            if (cmd === `${PREFIX}removeowner` || cmd.startsWith(`${PREFIX}removeowner `)){
                const m = raw.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                const n = body.split(' ')[1]?.replace(/[@+\s]/g, '');
                const t = m || (n && n.length >= 10 ? n + '@s.whatsapp.net' : null);
                if (!t){ await this.send(chat, `❌ tag or number`, [], cmd); return; }
                await this.send(chat, removeSuperOwner(t) ? `✅ @${t.split('@')[0]} removed` : `⚠️ not global owner`, [t], cmd);
                return;
            }
            if (cmd === `${PREFIX}ownerlist`){
                const l = superOwnersData.owners;
                if (!l.length){ await this.send(chat, `📋 no global owners`, [], cmd); return; }
                const tx = l.map((j, i) => `${i+1}. @${j.split('@')[0]}`).join('\n');
                await this.send(chat, `👑 GLOBAL OWNERS\n\n${tx}\n\nTotal: ${l.length}`, l, cmd);
                return;
            }
            if (cmd === `${PREFIX}syncall on` || cmd === `${PREFIX}syncall off`){
                const on = cmd.endsWith('on');
                setSyncAll(on);
                await this.send(chat, on ? '🟢 SYNC MODE ON\n  Commands: nc, quad, anc, timenc, mixnc' : '⚪ SYNC MODE OFF', [], cmd);
                return;
            }

            // ─── [B] ADMIN ───
            if (isDM && cmd === `${PREFIX}admin`){
                if (!this.userData.owners.length){
                    this.grantOwner(who);
                    await this.send(chat, `👑 you are now the owner\n\nsend ${PREFIX}menu`, [], cmd);
                } else if (isOwn) await this.send(chat, `⚠️ already owner`, [], cmd);
                else await this.send(chat, `❌ owner already exists`, [], cmd);
                return;
            }
            if (isDM && cmd === `${PREFIX}unadmin`){
                if (isOwn){ this.revokeOwner(who); await this.send(chat, `✅ owner removed`, [], cmd); }
                else await this.send(chat, `❌ not owner`, [], cmd);
                return;
            }

            // ─── [C] SUB ───
            if (cmd === `${PREFIX}sub` && isOwn){
                let t = raw.message.extendedTextMessage?.contextInfo?.participant;
                if (!t && !isGroup) t = chat;
                if (!t){ await this.send(chat, `↩️ reply to someone`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                const sc = isGroup ? chat : t;
                if (this.grantSub(t, sc)) await this.send(chat, `✅ @${t.split('@')[0]} added as sub`, [t], cmd);
                else await this.send(chat, `⚠️ already sub`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}rmsub` && isOwn){
                let t = raw.message.extendedTextMessage?.contextInfo?.participant;
                if (!t && !isGroup) t = chat;
                if (!t){ await this.send(chat, `↩️ reply to someone`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                const sc = isGroup ? chat : t;
                if (this.revokeSub(t, sc)) await this.send(chat, `✅ @${t.split('@')[0]} removed`, [t], cmd);
                else await this.send(chat, `⚠️ not a sub`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}listsub` && isOwn){
                const allUsers = new Map();
                for (const grp in this.userData.subs){
                    const u = this.userData.subs[grp];
                    if (!Array.isArray(u)) continue;
                    for (const j of u){
                        if (!allUsers.has(j)) allUsers.set(j, new Set());
                        allUsers.get(j).add(grp);
                    }
                }
                if (!allUsers.size){ await this.send(chat, `👥 SUB-USERS\n\n  empty`, [], cmd); return; }
                let m = `👥 SUB-USERS\n\n  Total unique: ${allUsers.size}\n\n`;
                const mentions = [];
                let i = 1;
                for (const [jid, chats] of allUsers.entries()){
                    mentions.push(jid);
                    m += `  ${i++}. @${jid.split('@')[0]}\n`;
                    for (const c of chats) m += `       ↳ \`${c}\`\n`;
                }
                await this.send(chat, m, mentions, cmd);
                return;
            }

            // ─── [D] BOT MGMT ───
            if (isOwn && body.toLowerCase().startsWith(`${PREFIX}add `) && /^[0-9]/.test(body.split(' ')[1] || '')){
                if (this.manager.sessions.size >= MAX_BOTS){
                    await this.send(chat, `❌ max ${MAX_BOTS} bots allowed`, [], cmd);
                    return;
                }
                const n = body.slice(PREFIX.length + 4).replace(/\D/g, '');
                if (n.length < 10){ await this.send(chat, `❌ invalid number`, [], cmd); return; }
                const r = await this.manager.link(n, chat);
                await this.send(chat, r, [], cmd);
                return;
            }
            if (isOwn && body.toLowerCase().startsWith(`${PREFIX}pairbot `)){
                if (this.manager.sessions.size >= MAX_BOTS){
                    await this.send(chat, `❌ max ${MAX_BOTS} bots allowed`, [], cmd);
                    return;
                }
                const args = body.slice(PREFIX.length + 8).trim().split(/\s+/).filter(Boolean);
                const botNumberRaw = args[0] || '';
                const n = botNumberRaw.replace(/^\+/, '');
                if (args.length > 2 || !/^\d{10,15}$/.test(n)){
                    await this.send(chat, `❌ invalid pairbot format\nUse: ${PREFIX}pairbot <bot-number> [@owner / owner-number]`, [], cmd);
                    return;
                }

                const c = raw.message.extendedTextMessage?.contextInfo;
                let t = null;
                const mentioned = c?.mentionedJid?.[0] || null;
                if (mentioned) {
                    t = cleanJid(mentioned);
                } else if (args[1]) {
                    const ownerToken = args[1];
                    if (ownerToken.startsWith('@')){
                        await this.send(chat, `❌ invalid owner mention\nPlease mention the user using WhatsApp mention.`, [], cmd);
                        return;
                    }
                    const ownerDigits = ownerToken.replace(/^\+/, '');
                    if (!/^\d{10,15}$/.test(ownerDigits)){
                        await this.send(chat, `❌ invalid owner\nUse a valid number or mention @user`, [], cmd);
                        return;
                    }
                    t = `${ownerDigits}@s.whatsapp.net`;
                }

                const r = await this.manager.link(n, chat, t, { freshPairing: true });
                await this.send(chat, r, t ? [t] : [], cmd);
                return;
            }
            if (cmd === `${PREFIX}bots` || cmd === `${PREFIX}listbot`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                let m = `🤖 PAIRED BOTS\n\nTotal: ${this.manager.sessions.size}/${MAX_BOTS}\n\n`;
                const mentions = [];
                let i = 1;
                for (const [id, s] of this.manager.sessions.entries()){
                    const st = s.online ? '🟢' : '🔴';
                    const ow = s.designatedOwner ? `@${s.designatedOwner.split('@')[0]}` : '*main*';
                    if (s.designatedOwner) mentions.push(s.designatedOwner);
                    m += `${i++}. \`${id}\` ${st}\n   +${s.phone || '?'}\n   ${ow}\n\n`;
                }
                await this.send(chat, m, mentions, cmd);
                return;
            }
            if ((body.toLowerCase().startsWith(`${PREFIX}stoppair`) || body.toLowerCase().startsWith(`${PREFIX}unpair`)) && isOwn){
                const pairCmd = body.toLowerCase().startsWith(`${PREFIX}unpair`) ? `${PREFIX}unpair` : `${PREFIX}stoppair`;
                const id = body.slice(pairCmd.length).trim().toUpperCase();
                if (id){
                    const s = this.manager.sessions.get(id);
                    if (!s){ await this.send(chat, `❌ pairing bot ${id} not found`, [], cmd); return; }
                    if (!s._pairingActive && !s._pairingTimer){
                        await this.send(chat, `❌ ${id} is not in pairing mode`, [], cmd);
                        return;
                    }
                    await this.manager.stopPairing(id);
                    await this.send(chat, `✅ ${id} pairing stopped and removed`, [], cmd);
                    return;
                }
                const ids = [...this.manager.sessions.entries()]
                    .filter(([, s]) => s._pairingActive || s._pairingTimer)
                    .map(([sid]) => sid);
                if (!ids.length){ await this.send(chat, `⚠️ no pairing is running`, [], cmd); return; }
                await this.manager.stopAllPairings();
                await this.send(chat, `✅ pairing stopped and removed: ${ids.join(', ')}`, [], cmd);
                return;
            }

            if (body.toLowerCase().startsWith(`${PREFIX}unfair `) && isOwn){
                const id = body.slice(`${PREFIX}unfair`.length).trim().toUpperCase();
                if (!/^[1-4]$/.test(id)){ await this.send(chat, `📋 ${PREFIX}unfair <bot-id>`, [], cmd); return; }
                if (!this.manager.sessions.has(id)){ await this.send(chat, `❌ bot ${id} not found`, [], cmd); return; }
                const ss = this.manager.sessions.get(id);
                try { if (ss.socket) await ss.socket.logout().catch(()=>{}); } catch(e){}
                this.manager.unlink(id, { cleanup: true });
                await this.send(chat, `✅ bot ${id} removed — session, owner data and stored bot data deleted`, [], cmd);
                return;
            }

            // ─── MENUCHANGE ───
            if (body.toLowerCase().startsWith(`${PREFIX}menuchange `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const p = body.split(' ');
                const i = parseInt(p[1]);
                const nm = p.slice(2).join(' ').trim();
                const myIndex = parseInt(this.id.replace(/[^0-9]/g,'') || '1');
                if (!isSuperOwner(who) && !raw.key.fromMe && i !== myIndex){
                    await this.send(chat, `❌ aap sirf apne bot ka naam change kar sakte ho\n  💡 apna bot: *${PREFIX}menuchange ${myIndex} <name>*`, [], cmd);
                    return;
                }
                if (!i || i < 1 || i > MAX_BOTS || !nm){
                    await this.send(chat, `📋 ${PREFIX}menuchange <1-${MAX_BOTS}> <name>\n💡 Example: ${PREFIX}menuchange 1 sinsiters`, [], cmd);
                    return;
                }
                setBotName(i, nm);
                await this.socket.sendMessage(chat, {
                    text: `✅ *Bot ${i} name changed!*\n\n  📝 New name: *${iFnt(nm)}*\n\n  💡 Bot ${i} ka menu ab *${iFnt(nm)}* dikhayega`
                }, { quoted: raw });
                return;
            }

            if (body.toLowerCase().startsWith(`${PREFIX}setmenu `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const p = body.trim().split(/\s+/);
                const menuNo = parseInt(p[1]);
                const botId = parseInt(p[2]);
                const myIndex = parseInt(this.id.replace(/[^0-9]/g,'') || '1');
                if (!/^[12]$/.test(String(menuNo)) || !/^[1-4]$/.test(String(botId))){
                    await this.send(chat, `📋 ${PREFIX}setmenu <1-2> <bot-id>\
💡 Example: ${PREFIX}setmenu 2 3`, [], cmd);
                    return;
                }
                if (!isSuperOwner(who) && !raw.key.fromMe && botId !== myIndex){
                    await this.send(chat, `❌ aap sirf apne bot ka menu change kar sakte ho\n  💡 apna bot: *${PREFIX}setmenu ${menuNo} ${myIndex}*`, [], cmd);
                    return;
                }
                setBotMenu(botId, menuNo);
                await this.send(chat, `✅ *Bot ${botId} menu changed!*\n\n  📖 Menu: *${menuNo}*\n  🤖 Bot: *${botId}*\n  💡 ${PREFIX}menu se Menu ${menuNo} open hoga`, [], cmd);
                return;
            }

            if (body.toLowerCase().startsWith(`${PREFIX}setprefix `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const np = body.slice(`${PREFIX}setprefix `.length).trim().split(' ')[0];
                if (!np || np.length > 3){ await this.send(chat, `❌ 1-3 chars`, [], cmd); return; }
                const old = PREFIX;
                PREFIX = np; savePrefix();
                await this.send(chat, `✅ \`${old}\` → \`${PREFIX}\``, [], cmd);
                return;
            }

            // ─── [E] MENU / INFO ───
            const menuSectionMatch = body.match(new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}m(10|[1-9])$`, 'i'));
            if (menuSectionMatch){
                await this.send(chat, MENU_SECTION_TEXT(`m${menuSectionMatch[1]}`, parseInt(this.id.replace(/[^0-9]/g,'')||'1')), [], cmd);
                return;
            }
            if (cmd === `${PREFIX}menu`){
                const menuBotIndex = parseInt(this.id.replace(/[^0-9]/g,'')||'1');
                const mt = getBotMenu(menuBotIndex) === 2 ? MENU_TEXT_2(menuBotIndex) : MENU_TEXT(menuBotIndex);
                if (fs.existsSync(PATH_BANNER_VID)){
                    try { await this.socket.sendMessage(chat, { video: fs.readFileSync(PATH_BANNER_VID), mimetype: 'video/mp4', caption: mt }, { quoted: raw }); return; } catch(e){}
                }
                if (fs.existsSync(PATH_BANNER)){
                    try { await this.socket.sendMessage(chat, { image: fs.readFileSync(PATH_BANNER), mimetype: 'image/jpeg', caption: mt }, { quoted: raw }); return; } catch(e){}
                }
                await this.send(chat, mt, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}stats`){
                const b = this.manager.router.getAll();
                const o = b.filter(x => x.online).length;
                await this.send(chat, `📊 online: ${o}/${b.length}\n  instance: ${this.id}\n  prefix: ${PREFIX}`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}reset` && isOwn){
                await this.manager.router.push('kill_all', { chat }, this.id);
                return;
            }
            if (cmd === `${PREFIX}alive`){
                const l = this.manager.router.getAll();
                let m = `📡 SYSTEM STATUS\n\n`;
                l.forEach(s => m += `  ${s.online ? '🟢' : '🔴'} ${s.id} • ${s.self?.split('@')[0] ?? '—'}\n`);
                await this.send(chat, m, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}ping`){
                const t0 = Date.now();
                try { await this.socket.presenceSubscribe(chat); } catch(e){}
                await this.send(chat, `📡 ${Date.now() - t0}ms`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}runtime`){
                const u = Math.floor(process.uptime());
                const d = Math.floor(u/86400), h = Math.floor((u%86400)/3600), mn = Math.floor((u%3600)/60), s = u%60;
                const mm = process.memoryUsage();
                await this.send(chat, `⚙️ RUNTIME\n  ⏱️ ${d}d ${h}h ${mn}m ${s}s\n  💾 ${(mm.rss/1024/1024).toFixed(1)} MB\n  ⚡ ${PREFIX}\n  🤖 ${this.id}`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}status`){
                const loops = [
                    ['NC', this.nameLoops.size > 0],
                    ['WORD', this.wordLoop.size > 0],
                    ['TIMENC', this.timeLoop.size > 0],
                    ['TXT', this.txtLoop.size > 0],
                    ['SLIDE', this.slideLoop.size > 0],
                    ['REACT', this.reactLoop.size > 0 || this.targetReactLoop.size > 0],
                    ['PFP', this.pfpLoop.size > 0],
                    ['AUTOR', this.replyLoop.size > 0 || this.targetReplyLoop.size > 0]
                ];
                const act = loops.filter(([,v]) => v);
                let lines = [`📊 ACTIVE LOOPS`];
                if (!act.length) lines.push('  none');
                else act.forEach(([n]) => lines.push(`  🟢 ${n}`));
                await this.send(chat, lines.join('\n'), [], cmd);
                return;
            }
            if (cmd === `${PREFIX}live`){
                const all = this.manager.router.getAll();
                let nc=0,wl=0,tn=0,tx=0,sl=0,pf=0,ar=0,rc=0,mt=0;
                all.forEach(s => {
                    nc += s.nameLoops.size;
                    wl += s.wordLoop.size;
                    tn += s.timeLoop.size;
                    tx += s.txtLoop.size;
                    sl += s.slideLoop.size;
                    pf += s.pfpLoop.size;
                    ar += s.replyLoop.size + s.targetReplyLoop.size;
                    rc += s.reactLoop.size + s.targetReactLoop.size;
                    s.muteList.forEach(x => mt += x.size);
                });
                await this.send(chat, `📊 LIVE\n  nc ${nc}\n  word ${wl}\n  timenc ${tn}\n  txt ${tx}\n  slide ${sl}\n  pfp ${pf}\n  autor ${ar}\n  react ${rc}\n  muted ${mt}`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}getid`){
                const id = raw.message?.extendedTextMessage?.contextInfo?.participant || who;
                await this.send(chat, `🆔 CHAT: ${chat}\n   USER: ${id}`, [], cmd);
                return;
            }
            if ((cmd === `${PREFIX}weather` || body.toLowerCase().startsWith(`${PREFIX}weather `))){
                const a = body.slice(PREFIX.length + 8).trim();
                if (!a){ await this.send(chat, `❌ location?`, [], cmd); return; }
                try {
                    const r = await fetch(`https://wttr.in/${encodeURIComponent(a)}?format=j1`);
                    const d = await r.json();
                    const w = d.current_condition[0];
                    await this.send(chat, `🌤️ ${a.toUpperCase()}\n  ${w.temp_C}°C • ${w.humidity}% • ${w.windspeedKmph}km/h\n  ${w.weatherDesc[0].value}`, [], cmd);
                } catch(e){ await this.send(chat, `❌ failed`, [], cmd); }
                return;
            }

            // ─── [F] ON/OFF/RESTART ───
            if (cmd === `${PREFIX}on`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                disabledChats.delete(chat);
                await this.send(chat, `✅ bot on 🟢`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}off`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                disabledChats.add(chat);
                await this.send(chat, `⛔ bot off 🔴`, [], cmd);
                return;
            }
            if (isGroup && disabledChats.has(chat)) return;
            if (cmd === `${PREFIX}restart`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                await this.send(chat, `🔄 restarting...`, [], cmd);
                await delay(1000);
                for (const s of this.manager.router.getAll()){
                    try { s.online = false; s.socket?.end(new Error('restart')); } catch(e){}
                }
                return;
            }
            if (cmd === `${PREFIX}killall`){
                await this.manager.router.push('kill_all', { chat }, this.id);
                return;
            }

            // ─── [G] NC ───
            for (const [key, setName] of Object.entries(EMOJI_SETS)){
                if (body.toLowerCase().startsWith(`${PREFIX}${key} `)){
                    const txt = body.slice(PREFIX.length + key.length + 1).trim();
                    if (!txt){ await this.send(chat, `📋 ${PREFIX}${key} [text]`, [], cmd); return; }
                    if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                    await this.send(chat, win(`${key}`), [], `${PREFIX}${key}`);
                    await this.manager.router.pushAll('nc_start', { chat, txt: iFnt(txt), key, setName }, this.id, false);
                    return;
                }
            }
            const qn = ['1','2','3','4'].find(n => body.toLowerCase().startsWith(`${PREFIX.toLowerCase()}quad${n} `));
            if (qn){
                const txt = body.slice(PREFIX.length + 6).trim();
                if (!txt){ await this.send(chat, `📋 ${PREFIX}quad${qn} [text]`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                await this.send(chat, win(`quad${qn}`), [], `${PREFIX}quad${qn}`);
                await this.manager.router.pushAll('quad_start', { chat, txt: iFnt(txt), qNum: qn }, this.id, false);
                return;
            }
            const ncM = body.toLowerCase().match(new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}nc([1-9])\\s+(.+)`, 'i'));
            if (ncM){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const i = parseInt(ncM[1]) - 1;
                const txt = ncM[2].trim();
                await this.send(chat, win(`nc${i+1}`), [], `${PREFIX}nc${i+1}`);
                await this.manager.router.pushAll('word_start', { chat, txt: iFnt(txt), index: i }, this.id, false);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}mixnc `)){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const txt = body.slice(PREFIX.length + 6).trim();
                if (!txt){ await this.send(chat, `📋 ${PREFIX}mixnc [text]`, [], cmd); return; }
                await this.send(chat, win('mixnc'), [], `${PREFIX}mixnc`);
                await this.manager.router.pushAll('mixnc_start', { chat, txt: iFnt(txt) }, this.id, false);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}timenc `)){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const txt = body.slice(PREFIX.length + 7).trim();
                await this.send(chat, win('timenc'), [], `${PREFIX}timenc`);
                await this.manager.router.pushAll('timenc_start', { chat, txt: iFnt(txt) }, this.id, false);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}autonc `)){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const txt = body.slice(PREFIX.length + 7).trim();
                if (!txt){ await this.send(chat, `📋 ${PREFIX}autonc [name]`, [], cmd); return; }
                await this.send(chat, win('autonc'), [], `${PREFIX}autonc`);
                await this.manager.router.push('autonc_start', { chat, txt: iFnt(txt) }, this.id, false);
                return;
            }
            if (cmd === `${PREFIX}ncstat`){
                let a = 0;
                this.nameLoops.forEach((v,k) => { if (k.startsWith(chat) && v) a++; });
                this.wordLoop.forEach((v,k) => { if (k.startsWith(chat) && v.on) a++; });
                this.timeLoop.forEach((v,k) => { if (k.startsWith(chat) && v.on) a++; });
                await this.send(chat, `💀 NC STATUS\n  Active: ${a}\n  Threads: ${globalThis.ANC_THREADS || 15}\n  Speed: ${speedConfig.nc || 'not set'}`, [], cmd);
                return;
            }
            const dM = body.match(new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}delaync([1-9])\\s+(\\d+)$`, 'i'));
            if (dM && isOwn){
                const i = dM[1], ms = parseInt(dM[2]);
                if (ms < 10){ await this.send(chat, `⏱️ min 10ms`, [], cmd); return; }
                speedConfig[`nc${i}`] = ms; saveTiming();
                await this.send(chat, `✅ nc${i} = ${ms}ms`, [], cmd);
                return;
            }

            // ─── [AI] sinsiters AI ───
            const naturalAi = body.trim();
            const naturalAiLow = naturalAi.toLowerCase();
            const botNameRaw = String(getBotName(parseInt(this.id.replace(/[^0-9]/g,'') || '1')) || 'sinsiters').trim();
            const botNameLow = botNameRaw.toLowerCase();

            // AI ON/OFF: one global switch. Main/global owner only.
            const aiOnCmd = naturalAiLow === `${PREFIX}ai on` || naturalAiLow === 'ai on' || naturalAiLow === 'sinsiters on';
            const aiOffCmd = naturalAiLow === `${PREFIX}ai off` || naturalAiLow === 'ai off' || naturalAiLow === 'sinsiters off';
            if (aiOnCmd || aiOffCmd){
                if (!isAiController) return;
                const on = aiOnCmd;
                setAiEnabled(on);
                console.log(`[AI] ${on ? 'ON' : 'OFF'} by ${who}`);
                await this.send(chat, on ? '🤖 sinsiters AI ON 🟢' : '🤖 sinsiters AI OFF 🔴', [], cmd);
                return;
            }

            // When enabled, the fixed word "sinsiters" triggers the AI directly.
            // The current bot/menu name is also accepted for backwards compatibility.
            if (isAiEnabled() && isAiController){
                const triggers = [...new Set(['sinsiters', botNameLow].filter(Boolean))];
                for (const trigger of triggers){
                    const re = new RegExp('^' + trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(.+)$', 'i');
                    const m = naturalAi.match(re);
                    if (m?.[1]?.trim()){
                        console.log(`[AI] request on bot ${this.id} from ${who}`);
                        await handleAiPrompt(chat, m[1].trim(), this.socket, raw);
                        return;
                    }
                }
            }

            if (body.toLowerCase().startsWith(`${PREFIX}ai `)){
                if (!isAiController) return;
                const aiQuery = body.slice(PREFIX.length + 3).trim();
                if (!aiQuery || aiQuery.toLowerCase() === 'on' || aiQuery.toLowerCase() === 'off'){
                    await this.send(chat, `📋 ${PREFIX}ai on/off\n📋 ${PREFIX}ai [question]`, [], cmd);
                    return;
                }
                await handleAiPrompt(chat, aiQuery, this.socket, raw);
                return;
            }

            // ─── [H] TXT ───
            if (body.toLowerCase().startsWith(`${PREFIX}txt `)){
                const parts = body.slice(PREFIX.length + 4).trim().split(/\s+/);
                const lastPart = parts[parts.length - 1];
                const ms = parseDelay(lastPart);
                if (!ms || parts.length < 2){
                    await this.send(chat, `❌ *Delay required!*\n\n  📋 Format: \`${PREFIX}txt <message> <ms>\`\n  💡 Example: \`${PREFIX}txt hello 4000\`\n\n  ⏱️ Min: 1000ms`, [], cmd);
                    return;
                }
                if (ms < 1000){ await this.send(chat, `⏱️ min 1000ms`, [], cmd); return; }
                const txt = parts.slice(0, -1).join(' ');
                if (!txt){ await this.send(chat, `📋 ${PREFIX}txt [text] [ms]`, [], cmd); return; }
                await this.send(chat, win(`${PREFIX}txt "${txt}" (${ms}ms)`), [], `${PREFIX}txt`);
                await this.manager.router.push('txt_start', { chat, txt, ms }, this.id, false);
                return;
            }

            // ─── [I] SLIDE ───
            if (body.toLowerCase().startsWith(`${PREFIX}slide `)){
                if (!raw.message.extendedTextMessage?.contextInfo?.quotedMessage){
                    await this.send(chat, `↩️ reply to target first\n  📋 ${PREFIX}slide <text> <ms>`, [], cmd); return;
                }
                const parts = body.slice(PREFIX.length + 6).trim().split(/\s+/);
                const lastPart = parts[parts.length - 1];
                const ms = parseDelay(lastPart);
                if (!ms || parts.length < 2){
                    await this.send(chat, `❌ *Delay required!*\n\n  📋 Format: \`${PREFIX}slide <text> <ms>\`\n  💡 Example: \`${PREFIX}slide hello 4000\``, [], cmd);
                    return;
                }
                if (ms < 1000){ await this.send(chat, `⏱️ min 1000ms`, [], cmd); return; }
                const txt = parts.slice(0, -1).join(' ');
                if (!txt){ await this.send(chat, `📋 ${PREFIX}slide [text] [ms]`, [], cmd); return; }
                const ctx = raw.message.extendedTextMessage.contextInfo;
                let mark = ctx.participant || ctx.remoteJid;
                if (mark && mark.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === mark || x.lid === mark);
                        if (p?.phoneNumber) mark = p.phoneNumber;
                        else if (p?.jid) mark = p.jid;
                    } catch(e){}
                }
                await this.send(chat, win(`${PREFIX}slide (${ms}ms)`), [], `${PREFIX}slide`);
                await this.manager.router.push('slide_start', { chat, txt, ms, mark, refId: ctx.stanzaId, refMsg: ctx.quotedMessage }, this.id, false);
                return;
            }

            // ─── [J] REACT ───
            if (body.toLowerCase().startsWith(`${PREFIX}reactall `)){
                const emoji = body.slice(PREFIX.length + 9).trim();
                if (!emoji){ await this.send(chat, `📋 ${PREFIX}reactall [emoji]`, [], cmd); return; }
                await this.send(chat, win(`${PREFIX}reactall ${emoji}`), [], `${PREFIX}reactall`);
                await this.manager.router.push('reactall_start', { chat, emoji }, this.id, false);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}react `)){
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let target = ctx?.participant || ctx?.mentionedJid?.[0] || (!isGroup ? chat : null);
                if (!target){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (target.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === target || x.lid === target);
                        if (p?.phoneNumber) target = p.phoneNumber;
                        else if (p?.jid) target = p.jid;
                    } catch(e){}
                }
                target = cleanJid(target);
                let emoji = body.slice(PREFIX.length + 6).trim();
                if (ctx?.mentionedJid?.[0]) emoji = emoji.replace(`@${ctx.mentionedJid[0].split('@')[0]}`, '').trim();
                if (!emoji){ await this.send(chat, `📋 ${PREFIX}react @user [emoji]`, [], cmd); return; }
                await this.send(chat, win(`${PREFIX}react → @${target.split('@')[0]} ${emoji}`), [target], `${PREFIX}react`);
                await this.manager.router.push('react_start', { chat, target, emoji }, this.id, false);
                return;
            }

            // ─── [K] AUTOR ───
            if (body.toLowerCase().startsWith(`${PREFIX}autorall `)){
                const r = body.slice(PREFIX.length + 9).trim();
                if (!r){ await this.send(chat, `📋 ${PREFIX}autorall [text]`, [], cmd); return; }
                await this.send(chat, win(`${PREFIX}autorall`), [], `${PREFIX}autorall`);
                await this.manager.router.push('autorall_start', { chat, reply: r }, this.id, false);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}autor `)){
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let target = ctx?.participant || ctx?.mentionedJid?.[0] || (!isGroup ? chat : null);
                if (!target){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (target.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === target || x.lid === target);
                        if (p?.phoneNumber) target = p.phoneNumber;
                        else if (p?.jid) target = p.jid;
                    } catch(e){}
                }
                target = cleanJid(target);
                let txt = body.slice(PREFIX.length + 6).trim();
                if (ctx?.mentionedJid?.[0]) txt = txt.replace(`@${ctx.mentionedJid[0].split('@')[0]}`, '').trim();
                if (!txt){ await this.send(chat, `📋 ${PREFIX}autor @user [text]`, [], cmd); return; }
                await this.send(chat, win(`${PREFIX}autor → @${target.split('@')[0]}`), [target], `${PREFIX}autor`);
                await this.manager.router.push('autor_start', { chat, target, reply: txt }, this.id, false);
                return;
            }

            // ─── [L] MULTI-GC ───
            if (cmd === `${PREFIX}addgc`){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!multiGcData.groups.includes(chat)){
                    multiGcData.groups.push(chat); saveMultiGc();
                    await this.send(chat, `✅ group added to multi-gc list\n\n  📋 Total: ${multiGcData.groups.length}`, [], cmd);
                } else {
                    await this.send(chat, `⚠️ already in list`, [], cmd);
                }
                return;
            }
            if (cmd === `${PREFIX}listgc`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const list = multiGcData.groups;
                if (!list.length){ await this.send(chat, `📭 multi-gc list empty`, [], cmd); return; }
                let m = `🌐 MULTI-GC LIST\n\nTotal: ${list.length}\n\n`;
                list.forEach((jid, i) => { m += `  ${i+1}. \`${jid}\`\n`; });
                await this.send(chat, m, [], cmd);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}removegc `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const idx = parseInt(body.slice(PREFIX.length + 9).trim()) - 1;
                const list = multiGcData.groups;
                if (isNaN(idx) || idx < 0 || idx >= list.length){
                    await this.send(chat, `❌ invalid index (1-${list.length})`, [], cmd); return;
                }
                const removed = list[idx];
                multiGcData.groups.splice(idx, 1); saveMultiGc();
                await this.send(chat, `✅ removed \`${removed}\``, [], cmd);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}mnc`)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const list = multiGcData.groups;
                if (!list.length){ await this.send(chat, `📭 add groups first using ${PREFIX}addgc`, [], cmd); return; }
                const mMatch = body.match(new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}mnc([1-9])\\s+(.+)`, 'i'));
                if (!mMatch){ await this.send(chat, `📋 ${PREFIX}mnc1-9 [name]`, [], cmd); return; }
                const idx = parseInt(mMatch[1]) - 1;
                const txt = mMatch[2].trim();
                await this.send(chat, `✅ NC${idx+1} started on ${list.length} groups (1 by 1)`, [], cmd);
                await this.manager.router.push('mnc_start', { chat, list, txt: iFnt(txt), index: idx }, this.id, false);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}mtxt `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const list = multiGcData.groups;
                if (!list.length){ await this.send(chat, `📭 add groups first using ${PREFIX}addgc`, [], cmd); return; }
                const parts = body.slice(PREFIX.length + 6).trim().split(/\s+/);
                const lastPart = parts[parts.length - 1];
                const ms = parseDelay(lastPart);
                if (!ms || parts.length < 2){
                    await this.send(chat, `❌ *Delay required!*\n\n  📋 Format: \`${PREFIX}mtxt <msg> <ms>\`\n  💡 Example: \`${PREFIX}mtxt hello 2000\``, [], cmd);
                    return;
                }
                if (ms < 1000){ await this.send(chat, `⏱️ min 1000ms`, [], cmd); return; }
                const txt = parts.slice(0, -1).join(' ');
                await this.send(chat, `✅ sending started to ${list.length} groups (1 by 1)`, [], cmd);
                await this.manager.router.push('mtxt_start', { chat, list, txt, ms }, this.id, false);
                return;
            }

            // ─── [M] MUTE ───
            if (cmd === `${PREFIX}mute` || body.toLowerCase().startsWith(`${PREFIX}mute `)){
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let t = ctx?.participant || ctx?.mentionedJid?.[0] || (!isGroup ? chat : null);
                if (!t){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                if (!this.muteList.has(chat)) this.muteList.set(chat, new Set());
                this.muteList.get(chat).add(t);
                await this.send(chat, `🔇 muted @${t.split('@')[0]}`, [t], cmd);
                return;
            }
            if (cmd === `${PREFIX}unmute` || body.toLowerCase().startsWith(`${PREFIX}unmute `)){
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let t = ctx?.participant || ctx?.mentionedJid?.[0] || (!isGroup ? chat : null);
                if (!t){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                const ml = this.muteList.get(chat);
                if (ml) ml.delete(t);
                await this.send(chat, `🔊 unmuted @${t.split('@')[0]}`, [t], cmd);
                return;
            }
            if (cmd === `${PREFIX}mutelist`){
                const ml = this.muteList.get(chat);
                if (!ml || !ml.size){ await this.send(chat, `📭 no muted users`, [], cmd); return; }
                let m = `🔇 MUTE LIST\n\n`;
                for (const u of ml) m += `  📵 @${u.split('@')[0]}\n`;
                await this.send(chat, m, [...ml], cmd);
                return;
            }

            // ─── [N] SECURITY ───
            if (cmd === `${PREFIX}antilink on` || cmd === `${PREFIX}antilink off`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const on = cmd.endsWith('on');
                if (!securityData.antilink) securityData.antilink = {};
                securityData.antilink[chat] = on; saveSecurity();
                await this.send(chat, on ? `🛡️ antilink ON` : `⚪ antilink OFF`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}autodelete on` || cmd === `${PREFIX}autodelete off`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const on = cmd.endsWith('on');
                if (!securityData.autodelete) securityData.autodelete = {};
                securityData.autodelete[chat] = on ? 'all' : {};
                saveSecurity();
                await this.send(chat, on ? `🗑️ autodelete ON (all users)` : `⚪ autodelete OFF (all users)`, [], cmd);
                return;
            }
            if ((cmd === `${PREFIX}autodelete` || body.toLowerCase().startsWith(`${PREFIX}autodelete `))){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let t = ctx?.participant || ctx?.mentionedJid?.[0];
                if (!t){ 
                    await this.send(chat, `📋 ${PREFIX}autodelete @user\n📋 ${PREFIX}autodelete on/off (all users)\n💡 reply or tag user`, [], cmd); 
                    return; 
                }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                if (!securityData.autodelete) securityData.autodelete = {};
                if (!securityData.autodelete[chat] || typeof securityData.autodelete[chat] !== 'object' || securityData.autodelete[chat] === 'all') securityData.autodelete[chat] = {};
                if (securityData.autodelete[chat][t]){
                    delete securityData.autodelete[chat][t];
                    await this.send(chat, `⚪ autodelete OFF for @${t.split('@')[0]}`, [t], cmd);
                } else {
                    securityData.autodelete[chat][t] = true;
                    await this.send(chat, `🗑️ autodelete ON for @${t.split('@')[0]}`, [t], cmd);
                }
                saveSecurity();
                return;
            }

            // ─── [O] VOICE ───
            for (const [vName, vId] of Object.entries(VOICE_IDS)){
                if (body.toLowerCase().startsWith(`${PREFIX}${vName} `)){
                    const vText = body.slice(PREFIX.length + vName.length + 1).trim();
                    if (!vText){ await this.send(chat, `📋 ${PREFIX}${vName} [text]`, [], cmd); return; }
                    await this.send(chat, `🎙️ generating voice...`, [], cmd);
                    try {
                        const { buffer, mimetype, ptt } = await generateVoice(vText, vId);
                        await this.socket.sendMessage(chat, { audio: buffer, mimetype, ptt }, { quoted: raw });
                    } catch(e){ await this.send(chat, `❌ failed: ${e.message.slice(0,60)}`, [], cmd); }
                    return;
                }
            }

            // ─── [P] PFP ───
            if (body.toLowerCase().startsWith(`${PREFIX}changepfp`)){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                if (!raw.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage){
                    await this.send(chat, `🖼️ reply to image\n  📋 ${PREFIX}changepfp <ms>`, [], cmd); return;
                }
                const msStr = body.slice(PREFIX.length + 10).trim();
                const ms = parseDelay(msStr);
                if (!ms){
                    await this.send(chat, `❌ *Delay required!*\n\n  📋 Format: \`${PREFIX}changepfp <ms>\`\n  💡 Example: \`${PREFIX}changepfp 4000\``, [], cmd);
                    return;
                }
                if (ms < 1000){ await this.send(chat, `⏱️ min 1000ms`, [], cmd); return; }
                const ctx = raw.message.extendedTextMessage.contextInfo;
                const qm = { key: { remoteJid: chat, fromMe: false, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage };
                try {
                    const buf = await downloadMediaMessage(qm, 'buffer', {});
                    await this.send(chat, win('pfp'), [], `${PREFIX}changepfp`);
                    await this.manager.router.push('pfp_start', { chat, ms, data: buf.toString('base64'), mime: ctx.quotedMessage.imageMessage.mimetype || 'image/jpeg' }, this.id, false);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }

            // ─── [Q] SPEED ───
            if (body.toLowerCase().startsWith(`${PREFIX}speed `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const p = body.slice(PREFIX.length + 6).trim().split(' ');
                if (p.length < 2){ await this.send(chat, `📋 ${PREFIX}speed [type] [ms]`, [], cmd); return; }
                const sid = p[0].toLowerCase(), ms = parseInt(p[1]);
                if (isNaN(ms) || ms < 10){ await this.send(chat, `⏱️ min 10ms`, [], cmd); return; }
                speedConfig[sid] = ms; saveTiming();
                await this.send(chat, `⏱️ ${sid.toUpperCase()} → ${ms}ms`, [], cmd);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}threads `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const n = parseInt(body.slice(PREFIX.length + 8).trim());
                if (isNaN(n) || n < 1 || n > 30){ await this.send(chat, `❌ 1-30`, [], cmd); return; }
                globalThis.ANC_THREADS = n;
                await this.send(chat, `✅ THREADS: ${n}`, [], cmd);
                return;
            }
            if (globalThis.ANC_THREADS === undefined) globalThis.ANC_THREADS = 15;

            // ─── [R] GROUP MGMT ───
            if (cmd === `${PREFIX}lockgc`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try { await this.socket.groupSettingUpdate(chat, 'announcement'); await this.send(chat, `🔒 group locked`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}unlockgc`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try { await this.socket.groupSettingUpdate(chat, 'not_announcement'); await this.send(chat, `🔓 group unlocked`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}locknc`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try { await this.socket.groupSettingUpdate(chat, 'locked'); await this.send(chat, `🔒 info locked`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}unlocknc`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try { await this.socket.groupSettingUpdate(chat, 'unlocked'); await this.send(chat, `🔓 info unlocked`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}promote` || body.toLowerCase().startsWith(`${PREFIX}promote `)) && isOwn){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let t = ctx?.participant || ctx?.mentionedJid?.[0];
                if (!t){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                try { await this.socket.groupParticipantsUpdate(chat, [t], 'promote'); await this.send(chat, `⬆️ promoted @${t.split('@')[0]}`, [t], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}demote` || body.toLowerCase().startsWith(`${PREFIX}demote `)) && isOwn){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let t = ctx?.participant || ctx?.mentionedJid?.[0];
                if (!t){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                try { await this.socket.groupParticipantsUpdate(chat, [t], 'demote'); await this.send(chat, `⬇️ demoted @${t.split('@')[0]}`, [t], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}tagall` || body.toLowerCase().startsWith(`${PREFIX}tagall `))){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try {
                    const md = await this.socket.groupMetadata(chat);
                    this._groupMetaCache.set(chat, md);
                    const ps = md.participants.map(x => x.id);
                    const tt = body.slice(PREFIX.length + 7).trim() || 'Attention!';
                    let tx = `📢 *${tt}*\n\n`;
                    for (const j of ps) tx += `  @${j.split('@')[0]}\n`;
                    await this.send(chat, tx, ps, cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}hidetag` || body.toLowerCase().startsWith(`${PREFIX}hidetag `))){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try {
                    const md = await this.socket.groupMetadata(chat);
                    this._groupMetaCache.set(chat, md);
                    const ps = md.participants.map(x => x.id);
                    const tt = body.slice(PREFIX.length + 8).trim() || 'Attention!';
                    await this.send(chat, tt, ps, cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}linkgc`){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try { const c = await this.socket.groupInviteCode(chat); await this.send(chat, `🔗 https://chat.whatsapp.com/${c}`, [], cmd); }
                catch(e){ await this.send(chat, `❌ bot must be admin`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}revoke` && isOwn){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                try { await this.socket.groupRevokeInvite(chat); await this.send(chat, `✅ revoked`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}setname` || body.toLowerCase().startsWith(`${PREFIX}setname `)) && isOwn && isGroup){
                const n = body.slice(PREFIX.length + 8).trim();
                if (!n){ await this.send(chat, `📋 ${PREFIX}setname [name]`, [], cmd); return; }
                try { await this.socket.groupUpdateSubject(chat, n); await this.send(chat, `✅ name updated`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}setdesc` || body.toLowerCase().startsWith(`${PREFIX}setdesc `)) && isOwn && isGroup){
                const n = body.slice(PREFIX.length + 8).trim();
                if (!n){ await this.send(chat, `📋 ${PREFIX}setdesc [desc]`, [], cmd); return; }
                try { await this.socket.groupUpdateDescription(chat, n); await this.send(chat, `✅ desc updated`, [], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}kickall` && isOwn && isGroup){
                try {
                    const md = await this.socket.groupMetadata(chat);
                    this._groupMetaCache.set(chat, md);
                    const botId = this.socket.user.id.split(':')[0] + '@s.whatsapp.net';
                    let k = 0;
                    for (const p of md.participants){
                        if (p.admin === 'admin' || p.admin === 'superadmin') continue;
                        if (p.id === botId || p.id === who) continue;
                        await this.socket.groupParticipantsUpdate(chat, [p.id], 'remove').catch(()=>{});
                        k++; await delay(300);
                    }
                    await this.send(chat, `✅ kicked ${k}`, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}leave`){
                if (!isGroup){ await this.send(chat, `👥 groups only`, [], cmd); return; }
                await this.send(chat, `👋 bye`, [], cmd);
                this._groupMetaCache.delete(chat);
                await delay(1000);
                for (const s of this.manager.router.getAll()){
                    if (s.socket && s.online){ try { await s.socket.groupLeave(chat); } catch(e){} }
                }
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}add `) && isOwn && isGroup){
                const n = body.slice(PREFIX.length + 4).trim().replace(/[^0-9]/g, '');
                if (n.length < 10){ await this.send(chat, `❌ invalid`, [], cmd); return; }
                const jid = n + '@s.whatsapp.net';
                try {
                    const r = await this.socket.groupParticipantsUpdate(chat, [jid], 'add');
                    const st = r?.[0]?.status;
                    if (st === '200' || st === 200) await this.send(chat, `✅ added @${n}`, [jid], cmd);
                    else if (st === '403') await this.send(chat, `❌ privacy`, [], cmd);
                    else if (st === '409') await this.send(chat, `⚠️ already member`, [], cmd);
                    else await this.send(chat, `⚠️ ${JSON.stringify(st)}`, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if ((cmd === `${PREFIX}remove` || body.toLowerCase().startsWith(`${PREFIX}remove `)) && isOwn && isGroup){
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                let t = ctx?.participant || ctx?.mentionedJid?.[0];
                if (!t){ await this.send(chat, `↩️ reply or tag`, [], cmd); return; }
                if (t.endsWith('@lid')){
                    try {
                        const meta = await this.socket.groupMetadata(chat);
                        const p = meta.participants?.find(x => x.id === t || x.lid === t);
                        if (p?.phoneNumber) t = p.phoneNumber;
                        else if (p?.jid) t = p.jid;
                    } catch(e){}
                }
                t = cleanJid(t);
                try { await this.socket.groupParticipantsUpdate(chat, [t], 'remove'); await this.send(chat, `🚪 removed @${t.split('@')[0]}`, [t], cmd); }
                catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }

            // ─── [S] BLOCK / BANNER / BIO / FONTS ───
            if (body.toLowerCase().startsWith(`${PREFIX}block `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const ns = body.slice(PREFIX.length + 6).trim().split(/[\s,]+/).map(x => x.replace(/[^\d]/g,'')).filter(x => x.length >= 7);
                if (!ns.length){ await this.send(chat, `📋 ${PREFIX}block [num]`, [], cmd); return; }
                const r = await Promise.allSettled(ns.map(async n => {
                    try { await this.socket.updateBlockStatus(`${n}@s.whatsapp.net`, 'block'); return `🚫 +${n}`; }
                    catch(e){ return `❌ +${n}`; }
                }));
                await this.send(chat, r.map(x => x.value ?? x.reason).join('\n'), [], cmd);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}unblock `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const ns = body.slice(PREFIX.length + 8).trim().split(/[\s,]+/).map(x => x.replace(/[^\d]/g,'')).filter(x => x.length >= 7);
                if (!ns.length){ await this.send(chat, `📋 ${PREFIX}unblock [num]`, [], cmd); return; }
                const r = await Promise.allSettled(ns.map(async n => {
                    try { await this.socket.updateBlockStatus(`${n}@s.whatsapp.net`, 'unblock'); return `✅ +${n}`; }
                    catch(e){ return `❌ +${n}`; }
                }));
                await this.send(chat, r.map(x => x.value ?? x.reason).join('\n'), [], cmd);
                return;
            }
            if (cmd === `${PREFIX}banner`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const qm = raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const im = qm?.imageMessage, vm = qm?.videoMessage;
                if (!im && !vm){ await this.send(chat, `📋 reply to image/video`, [], cmd); return; }
                try {
                    fs.mkdirSync(path.join(DATA_ROOT, 'store'), { recursive: true });
                    if (vm){
                        const b = await downloadMediaMessage({ message: { videoMessage: vm }, key: raw.key }, 'buffer', {});
                        if (fs.existsSync(PATH_BANNER)) fs.unlinkSync(PATH_BANNER);
                        fs.writeFileSync(PATH_BANNER_VID, b);
                        await this.send(chat, `🎥 video banner set`, [], cmd);
                    } else {
                        const b = await downloadMediaMessage({ message: { imageMessage: im }, key: raw.key }, 'buffer', {});
                        if (fs.existsSync(PATH_BANNER_VID)) fs.unlinkSync(PATH_BANNER_VID);
                        fs.writeFileSync(PATH_BANNER, b);
                        await this.send(chat, `🖼️ image banner set`, [], cmd);
                    }
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}delbanner`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (fs.existsSync(PATH_BANNER)) fs.unlinkSync(PATH_BANNER);
                if (fs.existsSync(PATH_BANNER_VID)) fs.unlinkSync(PATH_BANNER_VID);
                await this.send(chat, `🗑️ removed`, [], cmd);
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}setbio `)){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                const b = body.slice(PREFIX.length + 8).trim();
                if (!b){ await this.send(chat, `📋 ${PREFIX}setbio [text]`, [], cmd); return; }
                fs.writeFileSync(PATH_BIO, b, 'utf8');
                await this.send(chat, `✍️ bio set: ${b}`, [], cmd);
                return;
            }
            if (cmd === `${PREFIX}delbio`){
                if (!isOwn){ await this.send(chat, `❌ owners only`, [], cmd); return; }
                if (fs.existsSync(PATH_BIO)){ fs.unlinkSync(PATH_BIO); await this.send(chat, `🗑️ removed`, [], cmd); }
                else await this.send(chat, `❌ no bio`, [], cmd);
                return;
            }
            if ((cmd === `${PREFIX}fonts` || cmd === `${PREFIX}fontlist`)){
                let m = `🔤 FONTS\n\n  Active: ${activeFont}\n\n`;
                const f = ['italic','bold','bolditalic','sansbold','mono','outline','gothic','gothicbold','bubble','script','scriptbold','sansitalic'];
                f.forEach((x, i) => { m += `  ${i+1}. ${x} ➜ ${applyFont("Sample", x)}\n`; });
                m += `\n  💡 ${PREFIX}setfont [1-12|name]`;
                await this.send(chat, m, [], cmd);
                return;
            }
            if ((body.toLowerCase().startsWith(`${PREFIX}setfont `) || cmd === `${PREFIX}setfont`)){
                const v = body.slice(PREFIX.length + 8).trim().toLowerCase();
                if (!v){ await this.send(chat, `📋 ${PREFIX}setfont [1-12|name]`, [], cmd); return; }
                const f = ['italic','bold','bolditalic','sansbold','mono','outline','gothic','gothicbold','bubble','script','scriptbold','sansitalic'];
                let c = null;
                const i = parseInt(v);
                if (!isNaN(i) && i >= 1 && i <= 12) c = f[i-1];
                else if (f.includes(v)) c = v;
                if (!c){ await this.send(chat, `❌ invalid`, [], cmd); return; }
                activeFont = c; saveActiveFont();
                await this.send(chat, `✅ font: ${activeFont}`, [], cmd);
                return;
            }

            // ─── [T] INFO ───
            if ((cmd === `${PREFIX}info` || body.toLowerCase().startsWith(`${PREFIX}info `))){
                let tj = null;
                const ctx = raw.message.extendedTextMessage?.contextInfo;
                const arg = body.slice(PREFIX.length + 5).trim();
                if (ctx?.mentionedJid?.[0]) tj = ctx.mentionedJid[0];
                else if (arg){
                    let n = arg.replace(/[^0-9]/g, '');
                    if (n.length >= 10){ if (!n.startsWith('91') && n.length === 10) n = '91' + n; tj = n + '@s.whatsapp.net'; }
                } else if (ctx?.participant) tj = ctx.participant;
                else if (!isGroup) tj = chat;
                else tj = who;
                if (tj){
                    const p = tj.split('@');
                    tj = p[0].split(':')[0] + '@' + (p[1] || 's.whatsapp.net');
                }
                try {
                    const num = tj.split('@')[0];
                    let ex = false;
                    try { const r = await this.socket.onWhatsApp(num); if (r?.length) ex = !!r[0].exists; } catch(e){}
                    let pp = null;
                    try { pp = await this.socket.profilePictureUrl(tj, 'image'); } catch(e){}
                    let ab = null;
                    try { const s = await this.socket.fetchStatus(tj); ab = s?.status || null; } catch(e){}
                    let nm = null;
                    if (tj === who && raw.pushName) nm = raw.pushName;
                    let info = `🔍 USER INFO\n\n`;
                    if (nm) info += `  📛 ${nm}\n`;
                    info += `  📱 +${num}\n  🆔 ${tj}\n  ✅ ${ex ? 'yes' : 'no'}\n  🖼️ ${pp ? 'available' : 'hidden'}\n  📝 ${ab || 'hidden'}\n  🔗 https://wa.me/${num}`;
                    if (pp){
                        try {
                            const r = await fetch(pp);
                            const b = Buffer.from(await r.arrayBuffer());
                            await this.socket.sendMessage(chat, { image: b, caption: info }, { quoted: raw });
                            return;
                        } catch(e){}
                    }
                    await this.send(chat, info, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }

            // ─── [U] DOWNLOAD ───
            const dlC = ['dl ','insta ','pin ','tiktok ','tt ','twitter ','tw ','fb '];
            const mc = dlC.find(c => body.toLowerCase().startsWith(PREFIX + c));
            if (mc){
                const name = mc.trim();
                const url = body.slice(PREFIX.length + name.length + 1).trim();
                if (!url || !url.startsWith('http')){
                    await this.send(chat, `📥 DOWNLOADER\n  ${PREFIX}dl [url]\n  ${PREFIX}insta [url]\n  ${PREFIX}pin [url]\n  ${PREFIX}tiktok [url]\n  ${PREFIX}twitter [url]\n  ${PREFIX}fb [url]\n  ${PREFIX}play [name]\n  ${PREFIX}vid [name]\n  ${PREFIX}song [name]\n  ${PREFIX}spotify [name]\n  ${PREFIX}newsongs\n  ${PREFIX}yt [query]`, [], cmd);
                    return;
                }
                const tmp = path.join(DATA_ROOT, 'store', `_dl_${Date.now()}`);
                try {
                    const ff = ffmpegPath || 'ffmpeg';
                    const a = ['--no-playlist','--max-filesize','50m','-S','vcodec:h264,res:720,acodec:m4a','-f','bestvideo+bestaudio/best','--merge-output-format','mp4','--ffmpeg-location',ff,'-o',tmp + '.%(ext)s','--no-warnings'];
                    const r = spawnSync(YTDLP_PATH, [...a, url], { timeout: 120000, maxBuffer: 10*1024*1024 });
                    if (r.status !== 0){ await this.send(chat, `❌ failed`, [], cmd); return; }
                    const files = fs.readdirSync(path.join(DATA_ROOT, 'store'));
                    const dl = files.find(f => f.startsWith(`_dl_${tmp.split('_dl_')[1]?.split('.')[0]}`));
                    if (!dl){ await this.send(chat, `❌ not found`, [], cmd); return; }
                    const buf = fs.readFileSync(path.join(DATA_ROOT, 'store', dl));
                    if (buf.length > 50 * 1024 * 1024){ fs.unlinkSync(path.join(DATA_ROOT, 'store', dl)); await this.send(chat, `❌ too large`, [], cmd); return; }
                    await this.socket.sendMessage(chat, { video: buf, mimetype: 'video/mp4', caption: `📥 downloaded` }, { quoted: raw });
                    try { fs.unlinkSync(path.join(DATA_ROOT, 'store', dl)); } catch(e){}
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}play `)){
                const q = body.slice(PREFIX.length + 5).trim();
                if (!q){ await this.send(chat, `📋 ${PREFIX}play [name]`, [], cmd); return; }
                await this.send(chat, `🔎 ${q}...`, [], cmd);
                const tmp = path.join(DATA_ROOT, 'store', `_play_${Date.now()}`);
                try {
                    const r = spawnSync(YTDLP_PATH, ['--extract-audio','--audio-format','mp3','--ffmpeg-location',ffmpegPath || 'ffmpeg','-o',tmp + '.%(ext)s','--no-warnings','--no-playlist','ytsearch1:' + q], { timeout: 120000 });
                    const files = fs.readdirSync(path.join(DATA_ROOT, 'store'));
                    const base = tmp.split('/').pop();
                    const dl = files.find(f => f.startsWith(base));
                    if (dl && r.status === 0){
                        const buf = fs.readFileSync(path.join(DATA_ROOT, 'store', dl));
                        await this.socket.sendMessage(chat, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: raw });
                        try { fs.unlinkSync(path.join(DATA_ROOT, 'store', dl)); } catch(e){}
                    } else await this.send(chat, `❌ failed`, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}song `)){
                const q = body.slice(PREFIX.length + 5).trim();
                if (!q){ await this.send(chat, `📋 ${PREFIX}song [name]`, [], cmd); return; }
                await this.send(chat, `🔎 ${q}...`, [], cmd);
                try {
                    const r = await fetch(`https://saavnapi-nine.vercel.app/result/?query=${encodeURIComponent(q)}`);
                    const j = await r.json();
                    const s = Array.isArray(j) ? j[0] : null;
                    if (!s?.media_url){ await this.send(chat, `❌ not found`, [], cmd); return; }
                    if (s.image){
                        try {
                            const ri = await fetch(s.image);
                            const ib = Buffer.from(await ri.arrayBuffer());
                            await this.socket.sendMessage(chat, { image: ib, caption: `🎵 *${s.song || q}*\n🎤 ${s.singers || ''}` }, { quoted: raw });
                        } catch(e){}
                    }
                    const ra = await fetch(s.media_url);
                    const ab = Buffer.from(await ra.arrayBuffer());
                    await this.socket.sendMessage(chat, { audio: ab, mimetype: 'audio/mpeg', fileName: `${s.song || q}.mp3` }, { quoted: raw });
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (cmd === `${PREFIX}newsongs`){
                await this.send(chat, `🔎 fetching...`, [], cmd);
                try {
                    const r = await fetch(`https://saavnapi-nine.vercel.app/result/?query=latest+hindi+songs`);
                    const j = await r.json();
                    const ss = (Array.isArray(j) ? j : []).filter(s => s.media_url).slice(0, 5);
                    if (!ss.length){ await this.send(chat, `❌ none`, [], cmd); return; }
                    let m = `🎵 LATEST\n\n`;
                    ss.forEach((s, i) => { m += `  ${i+1}. ${s.song}\n     🎤 ${s.singers || '—'}\n\n`; });
                    m += `📋 ${PREFIX}song <name>`;
                    await this.send(chat, m, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}spotify `)){
                const q = body.slice(PREFIX.length + 8).trim();
                if (!q){ await this.send(chat, `📋 ${PREFIX}spotify [name]`, [], cmd); return; }
                await this.send(chat, `🔎 ${q}...`, [], cmd);
                try {
                    const r = await fetch(`https://saavnapi-nine.vercel.app/result/?query=${encodeURIComponent(q)}`);
                    const j = await r.json();
                    const ss = (Array.isArray(j) ? j : []).filter(s => s.media_url).slice(0, 5);
                    if (!ss.length){ await this.send(chat, `❌ not found`, [], cmd); return; }
                    let m = `🎵 SEARCH\n  "${q}"\n\n`;
                    ss.forEach((s, i) => { m += `  ${i+1}. ${s.song}\n     🎤 ${s.singers || '—'}\n\n`; });
                    m += `📋 ${PREFIX}song ${q}`;
                    await this.send(chat, m, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}yt `)){
                const q = body.slice(PREFIX.length + 4).trim();
                if (!q){ await this.send(chat, `📋 ${PREFIX}yt [query]`, [], cmd); return; }
                await this.send(chat, `🔎 ${q}...`, [], cmd);
                try {
                    const r = spawnSync(YTDLP_PATH, ['--dump-json','--flat-playlist','--no-warnings','ytsearch5:' + q], { timeout: 60000 });
                    const out = r.stdout?.toString() || '';
                    const vs = out.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch(e){ return null; } }).filter(v => v);
                    if (!vs.length){ await this.send(chat, `❌ none`, [], cmd); return; }
                    let m = `🎵 YOUTUBE\n\n`;
                    vs.forEach((v, i) => {
                        const d = v.duration ? `${Math.floor(v.duration/60)}:${String(v.duration%60).padStart(2,'0')}` : '?';
                        m += `  ${i+1}. ${v.title}  [${d}]\n`;
                    });
                    m += `\n📋 ${PREFIX}play <name>`;
                    await this.send(chat, m, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }
            if (body.toLowerCase().startsWith(`${PREFIX}vid `)){
                const q = body.slice(PREFIX.length + 5).trim();
                if (!q){ await this.send(chat, `📋 ${PREFIX}vid [name]`, [], cmd); return; }
                await this.send(chat, `🎬 ${q}...`, [], cmd);
                const tmp = path.join(DATA_ROOT, 'store', `_vid_${Date.now()}`);
                try {
                    const ff = ffmpegPath || 'ffmpeg';
                    const a = ['-S','vcodec:h264,res:720,acodec:m4a','-f','bestvideo+bestaudio/best','--merge-output-format','mp4','--ffmpeg-location',ff,'--max-filesize','50m','-o',tmp + '.%(ext)s','--no-warnings','--no-playlist','ytsearch1:' + q];
                    const r = spawnSync(YTDLP_PATH, a, { timeout: 120000 });
                    const files = fs.readdirSync(path.join(DATA_ROOT, 'store'));
                    const base = tmp.split('/').pop();
                    const dl = files.find(f => f.startsWith(base));
                    if (dl && r.status === 0){
                        const buf = fs.readFileSync(path.join(DATA_ROOT, 'store', dl));
                        if (buf.length <= 50 * 1024 * 1024) await this.socket.sendMessage(chat, { video: buf, mimetype: 'video/mp4', caption: `🎬 *${q}*` }, { quoted: raw });
                        else await this.send(chat, `❌ too large`, [], cmd);
                        try { fs.unlinkSync(path.join(DATA_ROOT, 'store', dl)); } catch(e){}
                    } else await this.send(chat, `❌ failed`, [], cmd);
                } catch(e){ await this.send(chat, `❌ ${e.message}`, [], cmd); }
                return;
            }

        } catch(e){ console.error(`[${this.id}] receive err:`, e.message); }
    }

    // ─────────────────────────────────────────────────────
    //  [S15.6] HANDLE — Loop Executor
    // ─────────────────────────────────────────────────────
    async handle(cmd, payload, notify = true){
        const { chat } = payload;
        try {
            switch(cmd){
            case 'nc_start': {
                const { txt, key, setName } = payload;
                const emojis = SETS[setName];
                const ms = speedConfig[key] || 10;
                const threads = globalThis.ANC_THREADS || 15;
                for (const [k] of this.nameLoops) if (k.startsWith(`${chat}__nc_`)) this.nameLoops.delete(k);
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                for (let t = 0; t < threads; t++){
                    const tid = `${chat}__nc_${key}_${t}`;
                    this.nameLoops.set(tid, true);
                    let i = t % emojis.length, back = 0;
                    (async () => {
                        while (this.nameLoops.get(tid)){
                            if (!this.socket || !this.online){ await delay(2000); continue; }
                            const emo = emojis[i++ % emojis.length];
                            this.socket.groupUpdateSubject(chat, `${emo} ${txt} ${emo}`).then(() => back = 0).catch(e => { if (isRateErr(e)) back = Math.min(back + 200, 2000); });
                            if (back > 0) await delay(back);
                            else if (ms > 0) await delay(ms);
                            else await new Promise(r => setImmediate(r));
                        }
                    })();
                }
                break;
            }
            case 'nc_stop': {
                for (const [k] of this.nameLoops) if (k.startsWith(`${chat}__nc_`)) this.nameLoops.delete(k);
                break;
            }
            case 'quad_start': {
                const { txt, qNum } = payload;
                const QM = {
                    '1': [['anc1','faces'],['anc2','hearts'],['anc3','hands'],['anc4','flowers']],
                    '2': [['anc3','hands'],['anc4','flowers'],['anc5','sky'],['anc6','animals']],
                    '3': [['anc5','sky'],['anc6','animals'],['anc7','fruits'],['anc1','faces']],
                    '4': [['anc2','hearts'],['anc4','flowers'],['anc6','animals'],['anc7','fruits']],
                };
                for (const [k] of this.nameLoops) if (k.startsWith(`${chat}__qd_`)) this.nameLoops.delete(k);
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                const threads = globalThis.ANC_THREADS || 15;
                const ms = speedConfig.quad || 10;
                for (const [key, setName] of QM[qNum]){
                    const emojis = SETS[setName];
                    for (let t = 0; t < threads; t++){
                        const tid = `${chat}__qd_${key}_${t}`;
                        this.nameLoops.set(tid, true);
                        let i = t % emojis.length, back = 0;
                        (async () => {
                            while (this.nameLoops.get(tid)){
                                if (!this.socket || !this.online){ await delay(2000); continue; }
                                const emo = emojis[i++ % emojis.length];
                                this.socket.groupUpdateSubject(chat, `${emo} ${txt} ${emo}`).then(() => back = 0).catch(e => { if (isRateErr(e)) back = Math.min(back + 200, 2000); });
                                if (back > 0) await delay(back);
                                else if (ms > 0) await delay(ms);
                                else await new Promise(r => setImmediate(r));
                            }
                        })();
                    }
                }
                break;
            }
            case 'quad_stop': {
                for (const [k] of this.nameLoops) if (k.startsWith(`${chat}__qd_`)) this.nameLoops.delete(k);
                break;
            }
            case 'word_start': {
                const { txt, index } = payload;
                const ms = speedConfig.nc || 10;
                for (const [k, v] of this.wordLoop) if (k.startsWith(chat)) v.on = false;
                await delay(50);
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                const arr = WORD_CYCLES[index] || WORD_CYCLES[0];
                const threads = globalThis.ANC_THREADS || 15;
                for (let t = 0; t < threads; t++){
                    const tid = `${chat}__wl_${t}`;
                    const L = { on: true, i: t };
                    this.wordLoop.set(tid, L);
                    let back = 0;
                    (async () => {
                        while (L.on){
                            if (!this.socket || !this.online){ await delay(2000); continue; }
                            const emo = arr[L.i++ % arr.length];
                            this.socket.groupUpdateSubject(chat, `${txt} ${emo}`).then(() => back = 0).catch(e => { if (isRateErr(e)) back = Math.min(back + 200, 2000); });
                            if (back > 0) await delay(back);
                            else if (ms > 0) await delay(ms);
                            else await new Promise(r => setImmediate(r));
                        }
                    })();
                }
                break;
            }
            case 'word_stop': {
                for (const [k, v] of this.wordLoop) if (k.startsWith(chat)){ v.on = false; this.wordLoop.delete(k); }
                break;
            }
            case 'mixnc_start': {
                const { txt } = payload;
                const ms = speedConfig.mixnc || 5;
                for (const [k, v] of this.wordLoop) if (k.startsWith(chat)) v.on = false;
                await delay(50);
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                const total = WORD_CYCLES.length;
                let cc = 0;
                const ci = new Array(total).fill(0);
                for (let t = 0; t < 4; t++){
                    const tid = `${chat}__wl_mix_${t}`;
                    const L = { on: true };
                    this.wordLoop.set(tid, L);
                    let back = 0;
                    (async () => {
                        while (L.on){
                            if (!this.socket || !this.online){ await delay(2000); continue; }
                            const cur = cc++ % total;
                            const arr = WORD_CYCLES[cur];
                            const idx = ci[cur]++;
                            const emo = arr[idx % arr.length];
                            this.socket.groupUpdateSubject(chat, `${txt} ${emo}`).then(() => back = 0).catch(e => { if (isRateErr(e)) back = Math.min(back + 200, 2000); });
                            if (back > 0) await delay(back);
                            else await delay(ms);
                        }
                    })();
                }
                break;
            }
            case 'mixnc_stop': {
                for (const [k, v] of this.wordLoop) if (k.startsWith(chat)){ v.on = false; this.wordLoop.delete(k); }
                break;
            }
            case 'timenc_start': {
                const { txt } = payload;
                for (const [k, v] of this.timeLoop) if (k.startsWith(chat)) v.on = false;
                await delay(100);
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                for (let t = 0; t < 5; t++){
                    const tid = `${chat}__tnc_${t}`;
                    const L = { on: true };
                    this.timeLoop.set(tid, L);
                    (async () => {
                        let back = 0;
                        while (L.on){
                            if (!this.socket || !this.online){ await delay(2000); continue; }
                            const cms = speedConfig.timenc || 10;
                            const now = new Date();
                            const time = now.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });
                            const name = txt ? `⏰ ${time} ︱ ${txt}` : `⏰ ${time}`;
                            this.socket.groupUpdateSubject(chat, name).then(() => back = 0).catch(e => { if (isRateErr(e)) back = Math.min(back + 100, 1000); });
                            if (back > 0) await delay(back);
                            else if (cms > 0) await delay(cms);
                            else await new Promise(r => setImmediate(r));
                        }
                    })();
                }
                break;
            }
            case 'timenc_stop': {
                for (const [k, v] of this.timeLoop) if (k.startsWith(chat)){ v.on = false; this.timeLoop.delete(k); }
                break;
            }
            case 'mnc_start': {
                const { list, txt, index } = payload;
                if (!this.mncLoop) this.mncLoop = new Map();
                const existing = this.mncLoop.get(chat);
                if (existing) existing.on = false;
                const L = { on: true };
                this.mncLoop.set(chat, L);
                (async () => {
                    while (L.on){
                        for (const gc of list){
                            if (!L.on) break;
                            try {
                                await this.manager.router.push('word_stop', { chat: gc }, this.id, false);
                                await delay(500);
                                await this.manager.router.push('word_start', { chat: gc, txt, index }, this.id, false);
                                await delay(3000);
                                await this.manager.router.push('word_stop', { chat: gc }, this.id, false);
                                await delay(500);
                            } catch(e){ console.error(`[MNC] failed on ${gc}:`, e.message); }
                        }
                    }
                })();
                break;
            }
            case 'mnc_stop': {
                if (this.mncLoop){
                    const L = this.mncLoop.get(chat);
                    if (L) L.on = false;
                    this.mncLoop.delete(chat);
                }
                const mlist = multiGcData.groups || [];
                for (const gc of mlist){
                    try { await this.manager.router.push('word_stop', { chat: gc }, this.id, false); } catch(e){}
                }
                break;
            }
            case 'mtxt_start': {
                const { list, txt, ms } = payload;
                if (!this.mtxtLoop) this.mtxtLoop = new Map();
                const existing = this.mtxtLoop.get(chat);
                if (existing) existing.on = false;
                const L = { on: true };
                this.mtxtLoop.set(chat, L);
                (async () => {
                    while (L.on){
                        for (const gc of list){
                            if (!L.on) break;
                            try {
                                await this.socket.sendMessage(gc, { text: txt });
                                await delay(ms);
                            } catch(e){ console.error(`[MTXT] failed on ${gc}:`, e.message); await delay(ms); }
                        }
                    }
                })();
                break;
            }
            case 'mtxt_stop': {
                if (this.mtxtLoop){
                    const L = this.mtxtLoop.get(chat);
                    if (L) L.on = false;
                    this.mtxtLoop.delete(chat);
                }
                break;
            }
            case 'autonc_start': {
                const { txt } = payload;
                if (!this.autoNcLoop) this.autoNcLoop = new Map();
                const existing = this.autoNcLoop.get(chat);
                if (existing) existing.on = false;
                const L = { on: true };
                this.autoNcLoop.set(chat, L);
                let back = 0;
                (async () => {
                    while (L.on){
                        if (!this.socket || !this.online){ await delay(2000); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            this._groupMetaCache.set(chat, meta);
                            const currentName = meta.subject || '';
                            const targetClean = txt.toLowerCase().trim();
                            const currentClean = currentName.toLowerCase().replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/gu, '').trim();
                            if (currentClean !== targetClean){
                                const firstEmoji = WORD_CYCLES[0][0];
                                const newName = `${txt} ${firstEmoji}`;
                                await this.socket.groupUpdateSubject(chat, newName).catch(e => { if (isRateErr(e)) back = Math.min(back + 500, 3000); });
                            }
                            if (back > 0) await delay(back);
                            else await delay(3000);
                        } catch(e){ await delay(3000); }
                    }
                })();
                break;
            }
            case 'autonc_stop': {
                if (this.autoNcLoop){
                    const L = this.autoNcLoop.get(chat);
                    if (L) L.on = false;
                    this.autoNcLoop.delete(chat);
                }
                break;
            }
              case 'txt_start': {
                const { txt, ms } = payload;
                if (!txt || !txt.trim()){ 
                    if (notify) await this.send(chat, `❌ *Text missing!*\n\n  📋 Format: \`${PREFIX}txt <message> <ms>\`\n  💡 Example: \`${PREFIX}txt hello 4000\``, [], `${PREFIX}txt`);
                    break; 
                }
                const tid = `${chat}__tx`;
                if (this.txtLoop.has(tid)){ this.txtLoop.get(tid).on = false; await delay(100); }
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                const L = { on: true };
                this.txtLoop.set(tid, L);
                (async () => {
                    let back = 0;
                    while (L.on){
                        if (!this.socket || !this.online){ await delay(2000); continue; }
                        try { await this.socket.sendMessage(chat, { text: txt }); back = 0; await delay(ms); }
                        catch(e){ if (isRateErr(e)){ back = Math.min(back + 1500, 10000); await delay(back); } else await delay(ms); }
                    }
                })();
                break;
            }
            case 'txt_stop': {
                const tid = `${chat}__tx`;
                if (this.txtLoop.has(tid)){ this.txtLoop.get(tid).on = false; this.txtLoop.delete(tid); }
                break;
            }
                case 'slide_start': {
                const { txt, ms, mark, refId, refMsg } = payload;
                if (!txt || !txt.trim()){ 
                    if (notify) await this.send(chat, `❌ *Text missing!*\n\n  📋 Format: \`${PREFIX}slide <text> <ms>\`\n  💡 Example: \`${PREFIX}slide hello 4000\``, [], `${PREFIX}slide`);
                    break; 
                }
                const tid = `${chat}__sl_${mark}`;
                if (this.slideLoop.has(tid)){ this.slideLoop.get(tid).live = false; await delay(100); }
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                const L = { live: true, room: chat, mark, ref: { key: { remoteJid: chat, fromMe: false, id: refId, participant: mark }, message: refMsg } };
                this.slideLoop.set(tid, L);
                (async () => {
                    let back = 0;
                    while (L.live){
                        if (!this.socket || !this.online){ await delay(2000); continue; }
                        try { await this.socket.sendMessage(chat, { text: txt }, { quoted: L.ref }); back = 0; await delay(ms); }
                        catch(e){ if (isRateErr(e)){ back = Math.min(back + 1500, 10000); await delay(back); } else await delay(ms); }
                    }
                })();
                break;
            }
            case 'slide_stop': {
                for (const [k, v] of this.slideLoop) if (v.room === chat){ v.live = false; this.slideLoop.delete(k); }
                break;
            }
            case 'react_start': {
                const { target, emoji } = payload;
                this.targetReactLoop.set(`${chat}__trc_${target}`, { live: true, chat, target, emoji });
                break;
            }
            case 'reactall_start': {
                const { emoji } = payload;
                this.reactLoop.set(`${chat}__rc`, { live: true, chat, emoji });
                break;
            }
            case 'react_stop': {
                for (const [k, v] of this.reactLoop) if (v.chat === chat){ v.live = false; this.reactLoop.delete(k); }
                for (const [k, v] of this.targetReactLoop) if (v.chat === chat){ v.live = false; this.targetReactLoop.delete(k); }
                break;
            }
                case 'autor_start': {
                const { target, reply } = payload;
                if (!reply || !reply.trim()){ 
                    if (notify) await this.send(chat, `❌ *Reply text missing!*\n\n  📋 Format: \`${PREFIX}autor @user <text>\`\n  💡 Example: \`${PREFIX}autor @user Hi\``, [], `${PREFIX}autor`);
                    break; 
                }
                this.targetReplyLoop.set(`${chat}__ar_${target}`, { live: true, chat, target, reply });
                break;
            }
                case 'autorall_start': {
                const { reply } = payload;
                if (!reply || !reply.trim()){ 
                    if (notify) await this.send(chat, `❌ *Reply text missing!*\n\n  📋 Format: \`${PREFIX}autorall <text>\`\n  💡 Example: \`${PREFIX}autorall Hi\``, [], `${PREFIX}autorall`);
                    break; 
                }
                this.replyLoop.set(`${chat}__arp`, { live: true, chat, reply });
                break;
            }
            case 'autor_stop': {
                for (const [k, v] of this.replyLoop) if (v.chat === chat){ v.live = false; this.replyLoop.delete(k); }
                for (const [k, v] of this.targetReplyLoop) if (v.chat === chat){ v.live = false; this.targetReplyLoop.delete(k); }
                break;
            }
            case 'pfp_start': {
                const { ms, data, mime } = payload;
                const tid = `${chat}__pf`;
                if (this.pfpLoop.has(tid)){ this.pfpLoop.get(tid).on = false; await delay(200); }
                let wc = 0;
                while ((!this.socket || !this.online) && wc < 30){ await delay(1000); wc++; }
                if (!this.socket || !this.online){ break; }
                const L = { on: true, buf: Buffer.from(data, 'base64'), mime };
                this.pfpLoop.set(tid, L);
                (async () => {
                    let back = 0;
                    while (L.on){
                        if (!this.socket || !this.online){ await delay(2000); continue; }
                        try { await this.socket.updateProfilePicture(chat, L.buf); back = 0; await delay(ms); }
                        catch(e){ if (isRateErr(e)){ back = Math.min(back + 3000, 15000); await delay(back); } else await delay(ms); }
                    }
                })();
                break;
            }
            case 'pfp_stop': {
                const tid = `${chat}__pf`;
                if (this.pfpLoop.has(tid)){ this.pfpLoop.get(tid).on = false; this.pfpLoop.delete(tid); }
                break;
            }
            case 'kill_all': {
                let k = 0;
                const wipe = (map, check) => {
                    for (const [kk, v] of map){
                        if (check(kk, v)){
                            if (v === true) map.set(kk, false);
                            else if (v && typeof v === 'object'){
                                if ('on' in v) v.on = false;
                                if ('live' in v) v.live = false;
                            }
                            if (typeof v === 'object') map.delete(kk);
                            k++;
                        }
                    }
                };
                wipe(this.nameLoops, x => x.startsWith(chat));
                for (const [kk, v] of this.nameLoops) if (!v) this.nameLoops.delete(kk);
                wipe(this.wordLoop, x => x.startsWith(chat));
                wipe(this.timeLoop, x => x.startsWith(chat));
                wipe(this.txtLoop, x => x.startsWith(chat));
                wipe(this.slideLoop, (_, v) => v.room === chat);
                wipe(this.pfpLoop, x => x.startsWith(chat));
                wipe(this.replyLoop, (_, v) => v.chat === chat);
                wipe(this.targetReplyLoop, (_, v) => v.chat === chat);
                wipe(this.reactLoop, (_, v) => v.chat === chat);
                wipe(this.targetReactLoop, (_, v) => v.chat === chat);
                if (this.muteList.has(chat)){ k += this.muteList.get(chat).size; this.muteList.delete(chat); }
                if (k) await this.send(chat, `🛑 killed ${k} loops`, [], `${PREFIX}killall`);
                break;
            }
            }
        } catch(e){ console.error(`[${this.id}] handle err:`, e.message); }
    }

    // ─────────────────────────────────────────────────────
    //  [S15.7] REPLY FORMAT
    // ─────────────────────────────────────────────────────
    _commandReplyFormat(text, command = null, mentions = []){
        const v = String(text ?? '').trim();
        if (!v) return v;
        if (v.startsWith('✦ ────── 𓆩🦁𓆪 ────── ✦') && v.includes('🔧')) return v;

        const bi = parseInt(this.id?.replace(/[^0-9]/g,'') || '1');
        const bn = styleBotName(getBotName(bi));
        const cmd = command || `${PREFIX}command`;
        const iconMap = {
            menu:'📖', admin:'👑', add:'➕', pairbot:'🔗', remove:'🔓', bots:'🤖',
            addowner:'👑', removeowner:'👑', ownerlist:'👑', menuchange:'✏️', setprefix:'⚙️', syncall:'🔄',
            on:'🟢', off:'🔴', restart:'🔄', runtime:'⏱️', ping:'📡', alive:'🟢', status:'📊', live:'📊', info:'ℹ️',
            sub:'⭐', rmsub:'🗑️', listsub:'👥', unadmin:'🔓',
            nc:'💀', anc:'💀', quad:'🔢', timenc:'⏱️', mixnc:'🔀', autonc:'🔄',
            txt:'💬', slide:'🎯', react:'❤️', reactall:'❤️', autor:'💭', autorall:'💭',
            mute:'🔇', unmute:'🔊', mutelist:'📋', stopmute:'🔊',
            antilink:'🛡️', autodelete:'🗑️',
            weather:'🌤️', getid:'🆔', block:'🚫', unblock:'✅',
            fonts:'🔤', setfont:'🔤', fontlist:'🔤',
            song:'🎵', play:'🎵', vid:'🎬', yt:'▶️', spotify:'🎵', newsongs:'🎵', dl:'📥', insta:'📸', tiktok:'🎵', twitter:'𝕏', tw:'𝕏', fb:'📘', pin:'📌',
            changepfp:'🖼️', pfp:'🖼️',
            speed:'⚡', threads:'🧵',
            banner:'🖼️', delbanner:'🗑️', setbio:'📝', delbio:'🗑️',
            modi:'🎙️', srk:'🎙️', sanjay:'🎙️', lalu:'🎙️', amitabh:'🎙️', priyanka:'🎙️', alia:'🎙️', salman:'🎙️',
            reset:'🛑', killall:'🛑', stats:'📊', ncstat:'📊', delaync:'⏱️',
            addgc:'🌐', listgc:'🌐', removegc:'🌐', mnc:'🌐', mtxt:'🌐',
            ai:'🤖'
        };
        const key = String(cmd).replace(new RegExp('^' + PREFIX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i'), '').toLowerCase().split(/\s+/)[0];
        const icon = iconMap[key] || (key.startsWith('stop') ? '⛔' : '⚡');
        const low = v.toLowerCase();
        let sIcon = '📡', st = '𝐂ᴏᴍᴘʟᴇᴛᴇᴅ';
        if (/(^|\n)\s*❌|\b(failed|error|invalid|not found|denied|cannot|owners only|groups only)\b/.test(low)){ sIcon = '❌'; st = '𝐅ᴀɪʟᴇᴅ'; }
        else if (/(^|\n)\s*⚠️|\b(already|warning|no .* loop running)\b/.test(low)){ sIcon = '⚠️'; st = '𝐖ᴀʀɴɪɴɢ'; }
        else if (/(^|\n)\s*⏳|\b(processing|fetching|loading|please wait|starting|creating)\b/.test(low)){ sIcon = '⏳'; st = '𝐏ʀᴏᴄᴇssɪɴɢ'; }
        else if (/\b(stopped|stop|deactivated|removed|deleted)\b/.test(low)){ sIcon = '🔴'; st = '𝐒ᴛᴏᴘᴘᴇᴅ'; }
        else if (/\b(started|activated|locked|unlocked|promoted|demoted|added|updated|success|completed|generated|created|changed|set|muted|unmuted|blocked|unblocked|sent)\b/.test(low)){ sIcon = '🟢'; st = '𝐒ᴜᴄᴄᴇss'; }
        let body = v.replace(/^╭───────[\s\S]*?╰───────[\s\S]*?\n\n?/, '').replace(/^✦ ────── 𓆩🖤𓆪 ────── ✦\s*/, '').replace(/\n?✦ ────── 𓆩🖤𓆪 ────── ✦\s*$/, '').trim();
        if (!body) body = v;
        const ms = new Set(Array.isArray(mentions) ? mentions : []);
        const ctx = this._replyContext();
        const tj = ctx?.participant || ctx?.mentionedJid?.[0] || [...ms][0] || null;
        if (tj) ms.add(tj);
        const bl = body.split(/\n/).map(x => x.trim()).filter(Boolean);
        const cb = bl.length ? bl.map((l, i) => `  ${i === 0 ? '╰➤' : '   '} ${l}`).join('\n') : '  ╰➤ 𝐂ᴏᴍᴘʟᴇᴛᴇᴅ';
        return `╭─────── 𓆩${icon}𓆪 ───────╮\n│   ${icon} ${bn} • 𝐁ᴏᴛ ${bi}\n╰─────── 𓆩${icon}𓆪 ───────╯\n\n  ✦ 🤖 𝐑ᴇsᴘᴏɴsᴇ : ${bn}\n  ✦ ⚡ 𝐂ᴏᴍᴍᴀɴᴅ  : ${cmd}\n  ✦ ${sIcon} 𝐒ᴛᴀᴛᴜs   : ${st}\n` + (tj ? `  ✦ 👤 𝐔sᴇʀ      : @${String(tj).split('@')[0]}\n` : '') + `\n${cb}\n\n✦ ────── 𓆩🖤𓆪 ────── ✦`;
    }

    _replyContext(){
        const ctxMsg = msgContext.getStore();
        const raw = ctxMsg?.messages?.[0];
        return raw?.message?.extendedTextMessage?.contextInfo || null;
    }

    _replyCommandFromContext(){
        const ctxMsg = msgContext.getStore();
        const raw = ctxMsg?.messages?.[0];
        const body = (raw?.message?.conversation || raw?.message?.extendedTextMessage?.text || raw?.message?.imageMessage?.caption || '').trim();
        return body.split(/\s+/)[0] || null;
    }

    // ─────────────────────────────────────────────────────
    //  [S15.8] SEND
    // ─────────────────────────────────────────────────────
    async send(jid, text, mentions = [], replyCommand = null){
        if (!this.socket || !this.online) return;
        let a = 0;
        const ctxMsg = msgContext.getStore();
        const raw = ctxMsg?.messages?.[0];
        const options = raw ? { quoted: raw } : undefined;
        let cmd = replyCommand;
        if (!cmd && raw){
            const b = (raw.message?.conversation || raw.message?.extendedTextMessage?.text || '').trim();
            if (b) cmd = b.split(/\s+/)[0];
        }
        const f = this._commandReplyFormat(text, cmd, mentions);
        const ms = new Set(Array.isArray(mentions) ? mentions : []);
        const tj = this._replyContext()?.participant || this._replyContext()?.mentionedJid?.[0];
        if (tj) ms.add(tj);
        const fm = [...ms];
        while (a < 3){
            try {
                await this.socket.sendMessage(jid, { text: f, ...(fm.length ? { mentions: fm } : {}) }, options);
                return;
            } catch(e){
                a++;
                const m = e?.message || '';
                if (isRateErr(e)) await delay(3000);
                else if (m.includes('No session')) await delay(2000 * a);
                else { console.error(`[${this.id}] send err:`, m); return; }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  [S16] BOT MANAGER
// ═══════════════════════════════════════════════════════════
class BotManager {
    constructor(){
        this.sessions = new Map();
        this.router = new CommandRouter();
        this.count = 0;
        this.disk = readJson(PATH_NETWORK, { count: 0, list: [] });
        const savedIds = (this.disk.list || []).map(x => parseInt(x.id, 10)).filter(Number.isFinite);
        this.count = Math.max(this.disk.count || 0, ...savedIds, 0);
    }

    _save(){
        writeJson(PATH_NETWORK, {
            count: this.count,
            list: [...this.sessions.entries()].map(([id, s]) => ({
                id,
                phone: s.phone,
                online: s.online,
                designatedOwner: s.designatedOwner || null
            }))
        });
    }

    async boot(){
        // Filter: only numeric IDs (1,2,3,4) — ignore old X-prefix
        const saved = (this.disk.list || []).filter(e => /^\d+$/.test(e.id));
        if (this.disk.list?.length !== saved.length){
            console.log(`[sinsiters] filtered ${this.disk.list.length - saved.length} old X-sessions`);
        }
        const validSaved = [];
        for (const entry of saved){
            const ap = PATH_AUTH(entry.id);
            const credsPath = `${ap}/creds.json`;
            let registered = false;
            if (fs.existsSync(credsPath)){
                try {
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    registered = !!creds?.registered;
                } catch(e) {}
            }
            if (!registered){
                // Never keep an incomplete/unregistered pairing session.
                // A later boot must treat it as a fresh login and request a new code.
                try { fs.rmSync(ap, { recursive: true, force: true }); } catch(e){}
                if (entry.id !== '1'){
                    try { fs.rmSync(path.join(DATA_ROOT, 'store', `users_${entry.id}.json`), { force: true }); } catch(e){}
                    try { fs.rmSync(path.join(DATA_ROOT, 'store', `bot_${entry.id}.json`), { force: true }); } catch(e){}
                    try { fs.rmSync(path.join(DATA_ROOT, 'store', `state_${entry.id}.json`), { force: true }); } catch(e){}
                }
                continue;
            }
            validSaved.push(entry);
        }
        if (validSaved.length){
            console.log(`[sinsiters] restoring ${validSaved.length} session(s)…`);
            for (const entry of validSaved){
                const ap = PATH_AUTH(entry.id);
                const hasFiles = fs.existsSync(ap) && fs.readdirSync(ap).length > 0;
                let phone = entry.phone;
                if (!hasFiles && !phone){
                    // Dashboard-hosted mode must never block on terminal input.
                    // Skip stale entries without a known phone number.
                    console.warn(`[sinsiters] skipping session ${entry.id}: missing auth files and phone number`);
                    continue;
                }
                const s = new BotInstance(entry.id, phone, this, null, entry.designatedOwner);
                this.sessions.set(entry.id, s);
                this.router.attach(entry.id, s);
                await s.init();
                await delay(1500);
            }
            this._save();
        }
        const hasBot1 = this.sessions.has('1');
        if (!hasBot1){
            const ph = String(process.env.BOT1_NUMBER || process.env.PHONE_NUMBER || '').trim();
            if (ph){
                const c = ph.replace(/\D/g, '');
                if (c.length >= 10 && c.length <= 15) await this.link(c, null);
            } else if (!validSaved.length) {
                console.log('[sinsiters] first pairing is not configured; use the dashboard to pair Bot 1');
            }
        }
        this._save();
    }

    async link(phone, notifyJid = null, designatedOwner = null, opts = {}){
        if (this.sessions.size >= MAX_BOTS){
            return `❌ max ${MAX_BOTS} bots allowed`;
        }
        const used = new Set([...this.sessions.keys()].map(String));
        let id = null;
        for (let n = 1; n <= MAX_BOTS; n++) {
            if (!used.has(String(n))) { id = String(n); break; }
        }
        if (!id) return `❌ max ${MAX_BOTS} bots allowed`;
        this.count = Math.max(this.count, Number(id));

        // A fresh pairbot must never inherit a stale/untracked session for the
        // newly allocated slot. Only the unused bot slot is cleaned; Bot 1/global
        // data and any currently tracked bot are untouched.
        if (opts?.freshPairing) {
            try { fs.rmSync(PATH_AUTH(id), { recursive: true, force: true }); } catch(e){}
            if (id !== '1') {
                try { fs.rmSync(path.join(DATA_ROOT, 'store', `users_${id}.json`), { force: true }); } catch(e){}
                try { fs.rmSync(path.join(DATA_ROOT, 'store', `bot_${id}.json`), { force: true }); } catch(e){}
                try { fs.rmSync(path.join(DATA_ROOT, 'store', `state_${id}.json`), { force: true }); } catch(e){}
            }
        }

        const s = new BotInstance(id, phone, this, notifyJid, designatedOwner);
        this.sessions.set(id, s);
        this.router.attach(id, s);
        await s.init();
        this._save();

        if (designatedOwner){
            return `👑 Client Bot\n\n  • ID: \`${id}\`\n  • Number: +${phone}\n  • Owner: @${designatedOwner.split('@')[0]}\n\n⏳ Pairing code will arrive shortly...`;
        }
        return `🤖 Sub-Bot\n\n  • ID: \`${id}\`\n  • Number: +${phone}\n\n⏳ Pairing code will arrive shortly...`;
    }

    async stopPairing(id){
        const s = this.sessions.get(id);
        if (!s) return false;
        s._pairingCancelled = true;
        s._pairingActive = false;
        if (s._pairingTimer){ clearTimeout(s._pairingTimer); s._pairingTimer = null; }
        try { if (s.socket) s.socket.end(undefined); } catch(e){}
        this.unlink(id, { cleanup: true });
        return true;
    }

    async stopAllPairings(){
        const ids = [...this.sessions.entries()]
            .filter(([, s]) => s._pairingActive || s._pairingTimer)
            .map(([id]) => id);
        for (const id of ids) await this.stopPairing(id);
        return ids;
    }

    unlink(id, opts = {}){
        const s = this.sessions.get(id);
        if (!s) return;
        if (s._pairingTimer){ clearTimeout(s._pairingTimer); s._pairingTimer = null; }
        s._pairingCancelled = true;
        try { if (s.socket) s.socket.end(undefined); } catch(e){}
        this.router.detach(id);
        this.sessions.delete(id);
        if (opts.cleanup){
            try { fs.rmSync(PATH_AUTH(id), { recursive: true, force: true }); } catch(e){}
            if (id !== '1'){
                try { fs.rmSync(path.join(DATA_ROOT, 'store', `users_${id}.json`), { force: true }); } catch(e){}
                try { fs.rmSync(path.join(DATA_ROOT, 'store', `bot_${id}.json`), { force: true }); } catch(e){}
                try { fs.rmSync(path.join(DATA_ROOT, 'store', `state_${id}.json`), { force: true }); } catch(e){}
            }
        }
        this._save();
    }
}

// ═══════════════════════════════════════════════════════════
//  [S17] STARTUP + ERROR GUARDS + BOOT
// ═══════════════════════════════════════════════════════════

console.clear();
console.log(`
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
        🖤  L A F A N G A  E N G I N E  🖤
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
`);
console.log('  🔥 Starting sinsiters ENGINE v15...');
console.log('  ✅ Engine ready. All systems go.\n');

console.log(`
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
        🖤  L A F A N G A  E N G I N E  🖤
        ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴀꜰᴀɴɢᴀ  •  ᴜʟᴛɪᴍᴀᴛᴇ
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  nc       :  ${PREFIX}anc1-20  ${PREFIX}quad1-4  ${PREFIX}nc1-9
  auto     :  ${PREFIX}autonc  ${PREFIX}mixnc  ${PREFIX}timenc
  message  :  ${PREFIX}txt  ${PREFIX}slide  ${PREFIX}react  ${PREFIX}autor
  multigc  :  ${PREFIX}addgc  ${PREFIX}mnc  ${PREFIX}mtxt
  voice    :  ${PREFIX}modi  ${PREFIX}srk  ${PREFIX}sanjay  ${PREFIX}lalu
  media    :  ${PREFIX}play  ${PREFIX}song  ${PREFIX}yt  ${PREFIX}dl
  ai       :  ${PREFIX}ai  (groq)
  security :  ${PREFIX}antilink  ${PREFIX}autodelete  ${PREFIX}mute
  stop all :  ${PREFIX}nc off  ${PREFIX}killall  ${PREFIX}reset
  prefix   :  ${PREFIX}
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
`);

process.on('uncaughtException', (err) => {
    const msg = err?.message || '';
    if (
        msg.includes('Unsupported state or unable to authenticate') ||
        msg.includes('aesDecryptGCM') ||
        msg.includes('decodeFrame') ||
        msg.includes('noise-handler')
    ){
        console.warn(`[sinsiters] ⚠️ Crypto error — auto-reconnect`);
        return;
    }
    console.error(`[sinsiters] ❌ Uncaught:`, err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    console.warn(`[sinsiters] ⚠️ Unhandled rejection: ${msg}`);
});

const sinsitersCore = new BotManager();
globalThis.hub = sinsitersCore;
await sinsitersCore.boot();
console.log(`\n  ✅  🌸 sinsiters — ʟɪᴠᴇ`);
console.log(`  →   ${PREFIX}admin  →  ᴅᴍ ᴍᴇ ᴛᴏ ᴄʟᴀɪᴍ ᴏᴡɴᴇʀ 🔐`);
console.log(`  →   ${PREFIX}menu   →  ꜱᴇɴᴅ ɪɴ ɢʀᴏᴜᴘ ꜰᴏʀ ᴄᴏᴍᴍᴀɴᴅꜱ ⚡`);
console.log(`  →   ${PREFIX}add    →  ᴀᴅᴅ ᴍᴏʀᴇ ʙᴏᴛꜱ ꜰᴏʀ ꜱᴘᴇᴇᴅ 🚀\n`);
