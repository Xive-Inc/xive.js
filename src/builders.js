import { OptionType } from "./constants.js";

/** @param {unknown} color a number, `#rrggbb`, or [r, g, b] */
export function resolveColor(color) {
  if (color === null || color === undefined) return undefined;
  if (typeof color === "number") return color;
  if (Array.isArray(color)) return (color[0] << 16) + (color[1] << 8) + color[2];
  if (typeof color === "string") return parseInt(color.replace(/^#/, ""), 16);
  return undefined;
}

/**
 * Build a rich embed. Same methods as discord.js's EmbedBuilder, and the same JSON — Xive's embed
 * format uses the field names and limits every webhook sender already writes.
 */
export class EmbedBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) {
    /** @type {Record<string, any>} */
    this.data = { ...data, fields: data.fields ? [...data.fields] : undefined };
  }

  /** @param {string | null} title */ setTitle(title) { this.data.title = title ?? undefined; return this; }
  /** @param {string | null} text */ setDescription(text) { this.data.description = text ?? undefined; return this; }
  /** @param {string | null} url */ setURL(url) { this.data.url = url ?? undefined; return this; }
  /** @param {unknown} color */ setColor(color) { this.data.color = resolveColor(color); return this; }
  /** @param {Date | number | null} [ts] */
  setTimestamp(ts = Date.now()) {
    this.data.timestamp = ts === null ? undefined : new Date(ts).toISOString();
    return this;
  }
  /** @param {{ name: string, iconURL?: string, url?: string } | null} author */
  setAuthor(author) {
    this.data.author = author ? { name: author.name, icon_url: author.iconURL, url: author.url } : undefined;
    return this;
  }
  /** @param {{ text: string, iconURL?: string } | null} footer */
  setFooter(footer) {
    this.data.footer = footer ? { text: footer.text, icon_url: footer.iconURL } : undefined;
    return this;
  }
  /** @param {string | null} url */ setImage(url) { this.data.image = url ? { url } : undefined; return this; }
  /** @param {string | null} url */ setThumbnail(url) { this.data.thumbnail = url ? { url } : undefined; return this; }
  /** @param {...({ name: string, value: string, inline?: boolean } | { name: string, value: string, inline?: boolean }[])} fields */
  addFields(...fields) {
    this.data.fields = [...(this.data.fields ?? []), ...fields.flat()];
    return this;
  }
  /** @param {...({ name: string, value: string, inline?: boolean } | { name: string, value: string, inline?: boolean }[])} fields */
  setFields(...fields) {
    this.data.fields = fields.flat();
    return this;
  }
  /** @param {number} index @param {number} deleteCount @param {...{ name: string, value: string, inline?: boolean }} fields */
  spliceFields(index, deleteCount, ...fields) {
    (this.data.fields ??= []).splice(index, deleteCount, ...fields);
    return this;
  }
  toJSON() {
    return JSON.parse(JSON.stringify(this.data));
  }
  /** @param {any} other */
  static from(other) {
    return new EmbedBuilder(typeof other?.toJSON === "function" ? other.toJSON() : other);
  }
}

/* ── Slash commands ────────────────────────────────────────────────────────────────────────── */

class OptionBuilder {
  /** @param {string} type */
  constructor(type) {
    this.type = type;
    this.name = "";
    this.description = "";
    this.required = false;
    /** @type {{ name: string, value: string | number }[] | undefined} */
    this.choices = undefined;
  }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} d */ setDescription(d) { this.description = d; return this; }
  /** @param {boolean} [r] */ setRequired(r = true) { this.required = r; return this; }
  /** @param {...({ name: string, value: string | number } | { name: string, value: string | number }[])} choices */
  addChoices(...choices) { this.choices = [...(this.choices ?? []), ...choices.flat()]; return this; }
  /** @param {...({ name: string, value: string | number } | { name: string, value: string | number }[])} choices */
  setChoices(...choices) { this.choices = choices.flat(); return this; }
  toJSON() {
    return { type: this.type, name: this.name, description: this.description, required: this.required, choices: this.choices };
  }
}

/**
 * The `add…Option` methods, shared by a command and a subcommand.
 * @template {{ options: any[] }} T
 * @param {T} target
 */
function optionAdders(target) {
  /** @param {string} type @param {(o: OptionBuilder) => OptionBuilder} [fn] */
  const add = (type, fn) => {
    const option = new OptionBuilder(type);
    target.options.push(fn ? fn(option) : option);
    return target;
  };
  return {
    /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addStringOption: (fn) => add(OptionType.String, fn),
    /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addIntegerOption: (fn) => add(OptionType.Integer, fn),
    /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addBooleanOption: (fn) => add(OptionType.Boolean, fn),
    /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addUserOption: (fn) => add(OptionType.User, fn),
    /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addChannelOption: (fn) => add(OptionType.Channel, fn),
    /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addRoleOption: (fn) => add(OptionType.Role, fn),
  };
}

/** One subcommand: `/mod ban`. Takes ordinary options, like a command. */
export class SlashCommandSubcommandBuilder {
  constructor() {
    this.type = OptionType.Subcommand;
    this.name = "";
    this.description = "";
    /** @type {OptionBuilder[]} */
    this.options = [];
    Object.assign(this, optionAdders(this));
  }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} d */ setDescription(d) { this.description = d; return this; }
  toJSON() {
    return { type: this.type, name: this.name, description: this.description, options: this.options.map((o) => o.toJSON()) };
  }
}

/** A group of subcommands: the `role` in `/mod role add`. Holds subcommands only. */
export class SlashCommandSubcommandGroupBuilder {
  constructor() {
    this.type = OptionType.SubcommandGroup;
    this.name = "";
    this.description = "";
    /** @type {SlashCommandSubcommandBuilder[]} */
    this.options = [];
  }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} d */ setDescription(d) { this.description = d; return this; }
  /** @param {(s: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder} fn */
  addSubcommand(fn) { const sub = new SlashCommandSubcommandBuilder(); this.options.push(fn ? fn(sub) : sub); return this; }
  toJSON() {
    return { type: this.type, name: this.name, description: this.description, options: this.options.map((o) => o.toJSON()) };
  }
}

/**
 * A slash command. Give it options, or subcommands (and subcommand groups) — not both, as on
 * Discord. Each subcommand appears to members as its own entry: `/mod ban`, `/mod kick`.
 */
export class SlashCommandBuilder {
  constructor() {
    this.name = "";
    this.description = "";
    /** @type {any[]} */
    this.options = [];
    /** @type {string | null} */
    this.invoker_permission = null;
    Object.assign(this, optionAdders(this));
  }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} d */ setDescription(d) { this.description = d; return this; }
  /**
   * Who may run it: a permission key (`Permissions.BanMembers`, or `"mod_ban"`). The member must
   * hold it in the channel they run the command in.
   * @param {string | null} permission
   */
  setDefaultMemberPermissions(permission) { this.invoker_permission = permission; return this; }

  /** @param {(s: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder} fn */
  addSubcommand(fn) { const sub = new SlashCommandSubcommandBuilder(); this.options.push(fn ? fn(sub) : sub); return this; }
  /** @param {(g: SlashCommandSubcommandGroupBuilder) => SlashCommandSubcommandGroupBuilder} fn */
  addSubcommandGroup(fn) { const group = new SlashCommandSubcommandGroupBuilder(); this.options.push(fn ? fn(group) : group); return this; }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      options: this.options.map((o) => o.toJSON()),
      invoker_permission: this.invoker_permission,
    };
  }
}

/** One option (or subcommand, or group) → the API's shape, recursively. @param {any} o @returns {any} */
function optionJSON(o) {
  if (o.type === OptionType.Subcommand || o.type === OptionType.SubcommandGroup) {
    return { name: o.name, description: o.description, type: o.type, options: (o.options ?? []).map(optionJSON) };
  }
  return {
    name: o.name,
    description: o.description,
    type: o.type,
    required: Boolean(o.required),
    ...(o.choices ? { choices: o.choices.map((/** @type {any} */ c) => ({ name: c.name, value: c.value })) } : {}),
  };
}

/** A builder or a plain command object → the body PUT /hubs/applications/@me/commands takes. @param {any} command */
export function toCommandJSON(command) {
  const json = typeof command?.toJSON === "function" ? command.toJSON() : command;
  return {
    name: json.name,
    description: json.description,
    invoker_permission: json.invoker_permission ?? null,
    options: (json.options ?? []).map(optionJSON),
  };
}

/* ── Components: buttons, select menus, forms ──────────────────────────────────────────────────
 *
 * The same builders, method names and JSON as discord.js — Xive stores Discord's component shape —
 * so a ported bot's component code runs as written. Every builder takes an optional plain object,
 * and `toJSON()` is what is sent.
 */

/** @param {any} c */
const componentJSON = (c) => (typeof c?.toJSON === "function" ? c.toJSON() : c);

/** @param {string | { name?: string, id?: string } | undefined} emoji */
const emojiJSON = (emoji) => (typeof emoji === "string" ? { name: emoji } : emoji);

export class ButtonBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) { this.data = /** @type {Record<string, any>} */ ({ type: 2, ...data }); }
  /** @param {string} id */ setCustomId(id) { this.data.custom_id = id; return this; }
  /** @param {string} label */ setLabel(label) { this.data.label = label; return this; }
  /** @param {number} style one of ButtonStyle */ setStyle(style) { this.data.style = style; return this; }
  /** @param {string | { name?: string, id?: string }} emoji */ setEmoji(emoji) { this.data.emoji = emojiJSON(emoji); return this; }
  /** For ButtonStyle.Link. @param {string} url */ setURL(url) { this.data.url = url; return this; }
  /** @param {boolean} [disabled] */ setDisabled(disabled = true) { this.data.disabled = disabled; return this; }
  toJSON() { return { ...this.data }; }
}

export class StringSelectMenuOptionBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) { this.data = /** @type {Record<string, any>} */ ({ ...data }); }
  /** @param {string} label */ setLabel(label) { this.data.label = label; return this; }
  /** @param {string} value */ setValue(value) { this.data.value = value; return this; }
  /** @param {string} description */ setDescription(description) { this.data.description = description; return this; }
  /** @param {string | { name?: string, id?: string }} emoji */ setEmoji(emoji) { this.data.emoji = emojiJSON(emoji); return this; }
  /** @param {boolean} [isDefault] */ setDefault(isDefault = true) { this.data.default = isDefault; return this; }
  toJSON() { return { ...this.data }; }
}

export class StringSelectMenuBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) { this.data = /** @type {Record<string, any>} */ ({ type: 3, ...data, options: (data.options ?? []).map(componentJSON) }); }
  /** @param {string} id */ setCustomId(id) { this.data.custom_id = id; return this; }
  /** @param {string} text */ setPlaceholder(text) { this.data.placeholder = text; return this; }
  /** @param {number} n */ setMinValues(n) { this.data.min_values = n; return this; }
  /** @param {number} n */ setMaxValues(n) { this.data.max_values = n; return this; }
  /** @param {boolean} [disabled] */ setDisabled(disabled = true) { this.data.disabled = disabled; return this; }
  /** @param {...any} options builders or `{ label, value, description?, emoji?, default? }` */
  addOptions(...options) { this.data.options.push(...options.flat().map(componentJSON)); return this; }
  /** @param {...any} options */
  setOptions(...options) { this.data.options = options.flat().map(componentJSON); return this; }
  toJSON() { return { ...this.data, options: [...this.data.options] }; }
}

export class TextInputBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) { this.data = /** @type {Record<string, any>} */ ({ type: 4, ...data }); }
  /** @param {string} id */ setCustomId(id) { this.data.custom_id = id; return this; }
  /** @param {string} label */ setLabel(label) { this.data.label = label; return this; }
  /** @param {number} style one of TextInputStyle */ setStyle(style) { this.data.style = style; return this; }
  /** @param {number} n */ setMinLength(n) { this.data.min_length = n; return this; }
  /** @param {number} n */ setMaxLength(n) { this.data.max_length = n; return this; }
  /** @param {boolean} [required] */ setRequired(required = true) { this.data.required = required; return this; }
  /** @param {string} value */ setValue(value) { this.data.value = value; return this; }
  /** @param {string} text */ setPlaceholder(text) { this.data.placeholder = text; return this; }
  toJSON() { return { ...this.data }; }
}

/** A row of up to five buttons, or one select menu, or (in a form) one text input. */
export class ActionRowBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) { this.data = { type: 1, ...data }; this.components = (data.components ?? []).map(componentJSON); }
  /** @param {...any} components */
  addComponents(...components) { this.components.push(...components.flat().map(componentJSON)); return this; }
  /** @param {...any} components */
  setComponents(...components) { this.components = components.flat().map(componentJSON); return this; }
  toJSON() { return { type: 1, components: [...this.components] }; }
}

/** A form, opened with `interaction.showModal(modal)`. */
export class ModalBuilder {
  /** @param {Record<string, any>} [data] */
  constructor(data = {}) { this.data = /** @type {Record<string, any>} */ ({ ...data }); this.components = (data.components ?? []).map(componentJSON); }
  /** @param {string} id */ setCustomId(id) { this.data.custom_id = id; return this; }
  /** @param {string} title */ setTitle(title) { this.data.title = title; return this; }
  /** Rows, each holding one TextInputBuilder. @param {...any} rows */
  addComponents(...rows) { this.components.push(...rows.flat().map(componentJSON)); return this; }
  /** @param {...any} rows */
  setComponents(...rows) { this.components = rows.flat().map(componentJSON); return this; }
  toJSON() { return { ...this.data, components: [...this.components] }; }
}
