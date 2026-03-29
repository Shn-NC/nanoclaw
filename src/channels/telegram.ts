import https from 'https';
import { Api, Bot } from 'grammy';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

/**
 * Send a message with Telegram Markdown parse mode, falling back to plain text.
 * Claude's output naturally matches Telegram's Markdown v1 format:
 *   *bold*, _italic_, `code`, ```code blocks```, [links](url)
 */
async function sendTelegramMessage(
  api: { sendMessage: Api['sendMessage'] },
  chatId: string | number,
  text: string,
  options: { message_thread_id?: number } = {},
): Promise<void> {
  try {
    await api.sendMessage(chatId, text, {
      ...options,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    // Fallback: send as plain text if Markdown parsing fails
    logger.debug({ err }, 'Markdown send failed, falling back to plain text');
    await api.sendMessage(chatId, text, options);
  }
}

interface TokenConfig {
  token: string;
  role: string; // pusty → wsteczna kompatybilność z pojedynczym botem
}

/**
 * Parsuje TELEGRAM_BOT_TOKENS: "token1:Rola1,token2:Rola2,..."
 * Wraca do TELEGRAM_BOT_TOKEN dla jednego bota.
 */
function parseTokenConfigs(multi?: string, single?: string): TokenConfig[] {
  if (multi) {
    return multi.split(',').flatMap((entry) => {
      const sep = entry.lastIndexOf(':');
      if (sep === -1) return [];
      const token = entry.slice(0, sep).trim();
      const role = entry.slice(sep + 1).trim();
      return token && role ? [{ token, role }] : [];
    });
  }
  if (single) return [{ token: single, role: '' }];
  return [];
}

/** Zamienia nazwę roli na prefix JID. Pusta rola → 'tg' (wsteczna kompatybilność). */
function roleToJidPrefix(role: string): string {
  return role ? `tg_${role.toLowerCase()}` : 'tg';
}

interface BotEntry {
  bot: Bot;
  role: string;
  jidPrefix: string; // np. 'tg_solutiondesigner' lub 'tg'
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private entries: BotEntry[] = [];
  private opts: TelegramChannelOpts;

  constructor(configs: TokenConfig[], opts: TelegramChannelOpts) {
    this.opts = opts;
    for (const { token, role } of configs) {
      this.entries.push({
        bot: new Bot(token, {
          client: {
            baseFetchConfig: { agent: https.globalAgent, compress: true },
          },
        }),
        role,
        jidPrefix: roleToJidPrefix(role),
      });
    }
  }

  private setupBot(entry: BotEntry): void {
    const { bot, role, jidPrefix } = entry;
    const roleLabel = role || 'default';

    // Telegram bot commands handled here — skip them in the general handler
    const TELEGRAM_BOT_COMMANDS = new Set(['chatid', 'ping']);

    // Command to get chat ID (useful for registration)
    bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';
      const escapedRoleLabel = (entry.role || 'default').replace(/_/g, '\\_');
      const escapedChatName = chatName.replace(/_/g, '\\_');
      ctx.reply(
        `Chat ID: \`${entry.jidPrefix}:${chatId}\`\nName: ${escapedChatName}\nType: ${chatType}\nRole: ${escapedRoleLabel}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} (${roleLabel}) is online.`);
    });

    bot.on('message:text', async (ctx) => {
      console.log(
        'Received message from',
        ctx.from?.username,
        'text:',
        ctx.message.text,
      );
      // Automatyczna rejestracja czatu, jeśli jeszcze nie istnieje
      const autoChatJid = `${entry.jidPrefix}:${ctx.chat.id}`;
      let autoGroup = this.opts.registeredGroups()[autoChatJid];
      if (!autoGroup) {
        const chatName =
          ctx.chat.type === 'private'
            ? ctx.from?.first_name || 'Private'
            : (ctx.chat as any).title || autoChatJid;
        const isGroup = ctx.chat.type !== 'private';
        this.opts.onChatMetadata(
          autoChatJid,
          new Date().toISOString(),
          chatName,
          'telegram',
          isGroup,
        );
        // Po dodaniu metadanych, grupa powinna być dostępna w kolejnych wywołaniach
        autoGroup = this.opts.registeredGroups()[autoChatJid];
        if (!autoGroup) {
          // Jeśli nadal nie ma, logujemy błąd i przerywamy
          logger.warn(
            { chatJid: autoChatJid },
            'Failed to register chat automatically',
          );
          return;
        }
      }
      // if (ctx.message.text.includes('test')) {
      // await ctx.reply('I received your test message!');
      // return;
      // }
      if (ctx.message.text.startsWith('/')) {
        const cmd = ctx.message.text.slice(1).split(/[\s@]/)[0].toLowerCase();
        if (TELEGRAM_BOT_COMMANDS.has(cmd)) return;
      }

      const chatJid = `${jidPrefix}:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();
      const threadId = ctx.message.message_thread_id;

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName, role: roleLabel },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        thread_id: threadId ? threadId.toString() : undefined,
      });

      logger.info(
        { chatJid, chatName, sender: senderName, role: roleLabel },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `${jidPrefix}:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    bot.on('message:photo', (ctx) => storeNonText(ctx, '[Photo]'));
    bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    bot.on('message:voice', (ctx) => storeNonText(ctx, '[Voice message]'));
    bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    bot.catch((err) => {
      logger.error({ err: err.message, role: roleLabel }, 'Telegram bot error');
    });
  }

  async connect(): Promise<void> {
    if (this.entries.length === 0) return;

    for (const entry of this.entries) {
      this.setupBot(entry);
    }

    // Start all bots concurrently — each resolves when polling begins
    await Promise.all(
      this.entries.map(
        (entry) =>
          new Promise<void>((resolve) => {
            entry.bot.start({
              onStart: (botInfo) => {
                logger.info(
                  {
                    username: botInfo.username,
                    id: botInfo.id,
                    role: entry.role || 'default',
                  },
                  'Telegram bot connected',
                );
                console.log(
                  `\n  Telegram bot: @${botInfo.username} [${entry.role || 'default'}]`,
                );
                console.log(`  JID prefix: ${entry.jidPrefix}`);
                console.log(
                  `  Send /chatid to the bot to get a chat's registration ID\n`,
                );
                resolve();
              },
            });
          }),
      ),
    );
  }

  async sendMessage(
    jid: string,
    text: string,
    threadId?: string,
  ): Promise<void> {
    const entry = this.entries.find((e) => jid.startsWith(e.jidPrefix + ':'));
    if (!entry) {
      logger.warn({ jid }, 'No Telegram bot found for JID');
      return;
    }

    try {
      const numericId = jid.slice(entry.jidPrefix.length + 1);
      const options = threadId
        ? { message_thread_id: parseInt(threadId, 10) }
        : {};

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await sendTelegramMessage(entry.bot.api, numericId, text, options);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await sendTelegramMessage(
            entry.bot.api,
            numericId,
            text.slice(i, i + MAX_LENGTH),
            options,
          );
        }
      }
      logger.info(
        { jid, length: text.length, threadId, role: entry.role },
        'Telegram message sent',
      );
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  isConnected(): boolean {
    return this.entries.length > 0;
  }

  ownsJid(jid: string): boolean {
    return this.entries.some((e) => jid.startsWith(e.jidPrefix + ':'));
  }

  async disconnect(): Promise<void> {
    await Promise.all(
      this.entries.map(async (entry) => {
        entry.bot.stop();
        logger.info({ role: entry.role || 'default' }, 'Telegram bot stopped');
      }),
    );
    this.entries = [];
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!isTyping) return;
    const entry = this.entries.find((e) => jid.startsWith(e.jidPrefix + ':'));
    if (!entry) return;
    try {
      const numericId = jid.slice(entry.jidPrefix.length + 1);
      await entry.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['TELEGRAM_BOT_TOKENS', 'TELEGRAM_BOT_TOKEN']);
  const multiTokens =
    process.env.TELEGRAM_BOT_TOKENS || envVars.TELEGRAM_BOT_TOKENS;
  const singleToken =
    process.env.TELEGRAM_BOT_TOKEN || envVars.TELEGRAM_BOT_TOKEN;

  const configs = parseTokenConfigs(multiTokens, singleToken);
  if (configs.length === 0) {
    logger.warn(
      'Telegram: neither TELEGRAM_BOT_TOKENS nor TELEGRAM_BOT_TOKEN is set',
    );
    return null;
  }
  return new TelegramChannel(configs, opts);
});
