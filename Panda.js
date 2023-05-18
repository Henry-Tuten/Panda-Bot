const Discord = require('discord.js');
const { Client, GatewayIntentBits } = require('discord.js');
const sql = require('mssql');

//---------------Create Client/Intents-----------------
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildVoiceStates,  // Added this line
	],
});
//-----------------------------------------------------



//---------------Database Connection-------------------
require('dotenv').config();

const token = process.env.TOKEN;
let allowedChannels = [process.env.ALLOWED_CHANNELS];

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true'  // We're doing a string comparison since all values in .env are loaded as strings
    }
}
//-----------------------------------------------------

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  sql.connect(config).then(pool => {
      console.log('Connected to SQL Server!');
      return pool;
  }).catch(err => {
      console.error('SQL Server connection error:', err);
  });
});

client.login(token);


const outputChannels = new Map();
const prefixes = {};

//---------------Message Protocol-----------------
client.on('messageCreate', async message => {
  console.log('Message Detected.')

  if (message.content.startsWith('!sOC')) {
    if (message.member.permissions.has('ADMINISTRATOR')) {
        const channelId = message.content.split(' ')[1]; // This will extract the channel ID from the command
        const channel = message.guild.channels.cache.get(channelId);

        if (!channel) {
            message.channel.send(`Channel with ID ${channelId} does not exist.`);
            return;
        }

        outputChannels.set(message.guild.id, channelId);
        message.channel.send(`Output channel has been set to <#${channelId}>.`);
        return;
    } else {
        message.channel.send('You do not have permission to use this command.');
        return;
    }
}

      // Check if the message starts with any of the prefixes
  const guildPrefixes = prefixes[message.guild.id] || [];
  for (const prefix of guildPrefixes) {
    if (message.content.startsWith(prefix)) {
      // If the message starts with a prefix, delete it and send it to the specified channel
      try {
          const specifiedChannelId = outputChannels.get(message.guild.id);

          if (!specifiedChannelId) {
              message.channel.send('No output channel has been set.');
              return;
          }

          const specifiedChannel = message.guild.channels.cache.get(specifiedChannelId);

          if (!specifiedChannel) {
              message.channel.send(`Output channel with ID ${specifiedChannelId} does not exist.`);
              return;
          }

          await message.delete();
          await specifiedChannel.send(`${message.author.tag}: ${message.content}`);
          return; // Exit the loop once we found a matching prefix
      } catch (err) {
          console.error('Error when deleting or forwarding the message:', err);
      }
  }
}

  // Ignore messages from bots
  if (message.author.bot) return;

  try {
    const pool = await sql.connect(config);

    // Insert message data into the other table
    await pool.request()
      .input('content', sql.VarChar(255), message.content)
      .input('username', sql.VarChar(255), message.author.username)
      .input('discriminator', sql.VarChar(255), message.author.discriminator)
      .input('userId', sql.VarChar(255), message.author.id)
      .input('channelName', sql.VarChar(255), message.channel.name)
      .input('channelId', sql.VarChar(255), message.channel.id)
      .input('timestamp', sql.BigInt, message.createdTimestamp)
      .query('INSERT INTO messages (content, username, discriminator, userid, channelname, channelid, timestamp) VALUES (@content, @username, @discriminator, @userid, @channelname, @channelid, @timestamp)');
  } 
    
    catch (err) {
    console.error('SQL error', err);
  }
  console.log("Message Sent.")

  if (message.content.startsWith('!ap')) {
    const newPrefix = message.content.split(' ')[1];
    if (newPrefix) {
        try {
            const pool = await sql.connect(config);
            await pool.request()
                .input('guildId', sql.VarChar(255), message.guild.id)
                .input('prefix', sql.VarChar(255), newPrefix)
                .query('INSERT INTO prefixes (guildId, prefix) VALUES (@guildId, @prefix)');
            if (!prefixes[message.guild.id]) {
                prefixes[message.guild.id] = [];
            }
            prefixes[message.guild.id].push(newPrefix);
            message.channel.send(`Prefix "${newPrefix}" has been added.`);
        } catch (err) {
            console.error('SQL error', err);
        }
    } else {
        message.channel.send('You need to specify a prefix to add.');
    }
}
  //--------------------Remove Prefix--------------------
  if (message.content.startsWith('!rp')) {
    const prefixToRemove = message.content.split(' ')[1];
        if (prefixToRemove) {
            try {
                const pool = await sql.connect(config);
                await pool.request()
                    .input('guildId', sql.VarChar(255), message.guild.id)
                    .input('prefix', sql.VarChar(255), prefixToRemove)
                    .query('DELETE FROM prefixes WHERE guildId = @guildId AND prefix = @prefix');
                const index = prefixes[message.guild.id].indexOf(prefixToRemove);
                if (index > -1) {
                    prefixes[message.guild.id].splice(index, 1);
                }
                message.channel.send(`Prefix "${prefixToRemove}" has been removed.`);
            } catch (err) {
                console.error('SQL error', err);
            }
        } else {
            message.channel.send('You need to specify a prefix to remove.');
        }
    }
  //------------------------------------------------

  //---------------------Add Channel----------------
  if (message.content.startsWith('!ac')) {
    console.log("Addchannel command triggered");
    if (message.member && message.member.permissions.has("ADMINISTRATOR")) {
      try {
        const pool = await sql.connect(config);
  
        const channelId = message.content.split(' ')[1];
  
        // Check if the channel exists in the guild
        const channel = message.guild.channels.cache.get(channelId);
        if (!channel) {
          // If the channel doesn't exist, send a message and return
          message.channel.send(`No channel with ID ${channelId} exists in this guild.`);
          return;
        }
  
        // Check if the channel already exists in the database
        const result = await pool.request()
          .input('guildId', sql.VarChar(255), message.guild.id)
          .input('channelId', sql.VarChar(255), channelId)
          .query('SELECT * FROM allowedChannels WHERE guildId = @guildId AND channelId = @channelId');
  
        if (result.recordset.length > 0) {
          // Channel already exists in the database
          message.channel.send(`Channel with ID ${channelId} is already in the allowed channels list.`);
        } else {
          // Add the channel to the database
          await pool.request()
            .input('guildId', sql.VarChar(255), message.guild.id)
            .input('channelId', sql.VarChar(255), channelId)
            .input('addedBy', sql.VarChar(255), message.author.username) // User who added the channel
            .input('addedAt', sql.BigInt, message.createdTimestamp) // Time when the channel was added
            .query('INSERT INTO allowedChannels (guildId, channelId, addedBy, addedAt) VALUES (@guildId, @channelId, @addedBy, @addedAt)');
          message.channel.send(`Channel with ID ${channelId} has been added to the allowed channels list by ${message.author.username}.`);
          console.log('Channel Added')
  
          // Fetch past messages from the channel
          const messages = await channel.messages.fetch({ limit: 100 }); // Fetches the last 100 messages. Adjust the limit as needed.
  
          for (const [, msg] of messages) {
            try {
              await pool.request()
                .input('id', sql.VarChar(255), msg.id)
                .input('content', sql.VarChar(MAX), msg.content)
                .input('username', sql.VarChar(255), msg.author.username)
                .input('discriminator', sql.VarChar(255), msg.author.discriminator)
                .input('userid', sql.VarChar(255), msg.author.id)
                .input('channelname', sql.VarChar(255), channel.name)
                .input('channelid', sql.VarChar(255), channelId)
                .input('timestamp', sql.BigInt, msg.createdTimestamp)
                .query('INSERT INTO messages (id, content, username, discriminator, userid, channelname, channelid, timestamp) VALUES (@id, @content, @username, @discriminator, @userid, @channelname, @channelid, @timestamp)');
            } catch (err) {
              console.error('SQL error when saving message', err);
            }
          }
        }
      } catch (err) {
        console.error('SQL error', err);
      }
    } else {
      message.channel.send('You do not have permission to use this command.');
    }
  }
  //---------------------------------------------------

  //--------------------Remove Channel------------------
  if (message.content.startsWith('!rc')) {
    // Check if user has ADMINISTRATOR permission
    if (message.member.permissions.has("ADMINISTRATOR")) {
      try {
        const pool = await sql.connect(config);
        await pool.request()
          .input('guildId', sql.VarChar(255), message.guild.id)
          .input('channelId', sql.VarChar(255), message.channel.id)
          .query('DELETE FROM allowedChannels WHERE guildId = @guildId AND channelId = @channelId');
        message.channel.send('This channel has been removed from the allowed channels list.');
      } catch (err) {
        console.error('SQL error', err);
      }
    } else {
      message.channel.send('You do not have permission to use this command.');
    }
  }

  if (message.content.startsWith('!fetch')) {
    if (message.member && message.member.permissions.has("ADMINISTRATOR")) {
      try {
        const pool = await sql.connect(config);
  
        // Get all allowed channels
        const result = await pool.request()
          .input('guildId', sql.VarChar(255), message.guild.id)
          .query('SELECT * FROM allowedChannels WHERE guildId = @guildId');
  
        const allowedChannels = result.recordset;
  
        // Loop through each allowed channel
        for (let i = 0; i < allowedChannels.length; i++) {
          const { channelId } = allowedChannels[i];
  
          // Check if the channel exists in the guild
          const channel = message.guild.channels.cache.get(channelId);
          if (!channel) {
            console.log(`Channel with ID ${channelId} no longer exists in this guild.`);
            continue;
          }
  
          // Fetch past messages from the channel
          const messages = await channel.messages.fetch({ limit: 100 }); // Fetches the last 100 messages. Adjust the limit as needed.
  
          for (const [, msg] of messages) {
            try {
              await pool.request()
                .input('id', sql.VarChar(255), msg.id)
                .input('content', sql.VarChar(8000), msg.content) // replaced MAX with 8000
                .input('username', sql.VarChar(255), msg.author.username)
                .input('discriminator', sql.VarChar(255), msg.author.discriminator)
                .input('userid', sql.VarChar(255), msg.author.id)
                .input('channelname', sql.VarChar(255), channel.name)
                .input('channelid', sql.VarChar(255), channelId)
                .input('timestamp', sql.BigInt, msg.createdTimestamp)
                .query('INSERT INTO messages (id, content, username, discriminator, userid, channelname, channelid, timestamp) VALUES (@id, @content, @username, @discriminator, @userid, @channelname, @channelid, @timestamp)');
            } catch (err) {
              console.error('SQL error when saving message', err);
            }
          }
        }
  
        console.log('Finished fetching past messages for all allowed channels.');
      } catch (err) {
        console.error('SQL error', err);
      }
    } else {
      message.channel.send('You do not have permission to use this command.');
    }
  }
});

//-------------------------VOICE RECORDS-----------------------
const UserVoice = new Map();
//notes
//modify the code to add channel id, username, channelName like above
// ask chatgpt4 to modify according to the entire block
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!oldState.channel && newState.channel) {
    console.log(`${newState.member.user.tag} joined ${newState.channel.name}`);
    UserVoice.set(newState.member.id, {
      channelId: newState.channel.id, // Ensure to capture the channel id here
      channelName: newState.channel.name, // Store channel name here
      joinedAt: Date.now(),
    });
  } else if (oldState.channel && !newState.channel) {
    console.log(`${oldState.member.user.tag} left ${oldState.channel.name}`);
    const voiceData = UserVoice.get(oldState.member.id);
    if (voiceData) {
      const { channelId, channelName, joinedAt } = voiceData;
      const duration = Date.now() - joinedAt;
      console.log(`${oldState.member.user.tag} was in the channel for ${duration} milliseconds`);

      const request = new sql.Request();
      const query = `
        INSERT INTO UserVoice (UserId, ChannelId, JoinedAt, LeftAt, Duration, ChannelName) 
        VALUES (@userId, @channelId, @joinedAt, @leftAt, @duration, @channelName);
      `;
      request.input('userId', sql.NVarChar, oldState.member.id);
      request.input('channelId', sql.NVarChar, channelId);
      request.input('joinedAt', sql.DateTime, new Date(joinedAt));
      request.input('leftAt', sql.DateTime, new Date(Date.now()));
      request.input('duration', sql.Int, duration);
      request.input('channelName', sql.NVarChar, channelName); // Now you have stored channel name

      try {
        await request.query(query);
        console.log('Log saved to database');
      } catch (error) {
        console.error('Error saving log to database', error);
      }

      UserVoice.delete(oldState.member.id);
    }
  }
});