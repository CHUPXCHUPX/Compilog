const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AuditLogEvent
} = require('discord.js');

const fs = require('fs');

const TOKEN = '';
const CLIENT_ID = '';

/* ================== JSON 로드 ================== */
let logChannels = {};

try {
  logChannels = JSON.parse(fs.readFileSync('./logChannels.json'));
} catch {
  logChannels = {};
}

/* ================== 저장 함수 ================== */
function saveLogs() {
  fs.writeFileSync('./logChannels.json', JSON.stringify(logChannels, null, 2));
}

/* ================== 클라이언트 ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel]
});

/* ================== 슬래시 명령어 ================== */
const commands = [
  new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('set log channel')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('log channel')
        .setRequired(true))
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('slash registered (global)');
  } catch (e) {
    console.log(e);
  }
})();

/* ================== 로그 전송 ================== */
function send(guild, embed) {
  const logId = logChannels[guild.id];
  if (!logId) return;

  const ch = guild.channels.cache.get(logId);
  if (!ch) return;

  ch.send({ embeds: [embed] }).catch(() => {});
}

/* ================== 실행자 찾기 ================== */
async function getExecutor(guild, type, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 5, type });
    const entry = logs.entries.find(e => e.target?.id === targetId);
    return entry?.executor?.tag || 'unknown';
  } catch {
    return 'unknown';
  }
}

/* ================== 봇 시작 ================== */
client.once('ready', () => {
  console.log(`logged in: ${client.user.tag}`);
});

/* ================== 명령어 ================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'setlog') {
    await i.deferReply({ ephemeral: true });

    const ch = i.options.getChannel('channel');
    if (!ch) return i.editReply('no channel');

    logChannels[i.guild.id] = ch.id;
    saveLogs();

    await i.editReply('log channel set for this server');
  }
});

/* ================== 이벤트 로그 ================== */

client.on('guildMemberAdd', m => {
  send(m.guild,
    new EmbedBuilder()
      .setTitle('member join')
      .setDescription(m.user.tag)
      .setColor(0x00ff00)
      .setTimestamp()
  );
});

client.on('guildMemberRemove', async m => {
  const ex = await getExecutor(m.guild, AuditLogEvent.MemberKick, m.id);
  const isKick = ex !== 'unknown';

  send(m.guild,
    new EmbedBuilder()
      .setTitle(isKick ? 'member kick' : 'member leave')
      .addFields(
        { name: 'user', value: m.user.tag },
        { name: 'by', value: ex }
      )
      .setColor(isKick ? 0xff0000 : 0x808080)
      .setTimestamp()
  );
});

client.on('guildBanAdd', async b => {
  const ex = await getExecutor(b.guild, AuditLogEvent.MemberBanAdd, b.user.id);

  send(b.guild,
    new EmbedBuilder()
      .setTitle('member ban')
      .addFields(
        { name: 'user', value: b.user.tag },
        { name: 'by', value: ex }
      )
      .setColor(0x000000)
      .setTimestamp()
  );
});

client.on('messageDelete', async m => {
  if (!m.guild || !m.author) return;
  if (m.author.bot) return;

  const ex = await getExecutor(m.guild, AuditLogEvent.MessageDelete, m.author.id);

  send(m.guild,
    new EmbedBuilder()
      .setTitle('message delete')
      .addFields(
        { name: 'author', value: m.author.tag },
        { name: 'by', value: ex },
        { name: 'content', value: m.content || 'none' }
      )
      .setColor(0xff9900)
      .setTimestamp()
  );
});

client.on('messageUpdate', (o, n) => {
  if (!n.guild || !n.author) return;
  if (n.author.bot) return;
  if (o.content === n.content) return;

  send(n.guild,
    new EmbedBuilder()
      .setTitle('message edit')
      .addFields(
        { name: 'user', value: n.author.tag },
        { name: 'before', value: o.content || 'none' },
        { name: 'after', value: n.content || 'none' }
      )
      .setColor(0xffff00)
      .setTimestamp()
  );
});

client.on('channelCreate', c => {
  send(c.guild,
    new EmbedBuilder()
      .setTitle('channel create')
      .setDescription(c.name)
      .setColor(0x0099ff)
      .setTimestamp()
  );
});

client.on('channelDelete', async c => {
  const ex = await getExecutor(c.guild, AuditLogEvent.ChannelDelete, c.id);

  send(c.guild,
    new EmbedBuilder()
      .setTitle('channel delete')
      .addFields(
        { name: 'channel', value: c.name },
        { name: 'by', value: ex }
      )
      .setColor(0x990000)
      .setTimestamp()
  );
});

client.on('guildMemberUpdate', (o, n) => {
  const add = n.roles.cache.filter(r => !o.roles.cache.has(r.id));
  const rem = o.roles.cache.filter(r => !n.roles.cache.has(r.id));

  if (!add.size && !rem.size) return;

  send(n.guild,
    new EmbedBuilder()
      .setTitle('role update')
      .addFields(
        { name: 'user', value: n.user.tag },
        { name: 'add', value: add.map(r => r.name).join(', ') || 'none' },
        { name: 'remove', value: rem.map(r => r.name).join(', ') || 'none' }
      )
      .setColor(0x9900ff)
      .setTimestamp()
  );
});

client.on('roleCreate', r => {
  send(r.guild,
    new EmbedBuilder()
      .setTitle('role create')
      .setDescription(r.name)
      .setColor(0x0099ff)
      .setTimestamp()
  );
});

client.on('roleDelete', async r => {
  const ex = await getExecutor(r.guild, AuditLogEvent.RoleDelete, r.id);

  send(r.guild,
    new EmbedBuilder()
      .setTitle('role delete')
      .addFields(
        { name: 'role', value: r.name },
        { name: 'by', value: ex }
      )
      .setColor(0x990000)
      .setTimestamp()
  );
});

/* ================== 로그인 ================== */
client.login(TOKEN);