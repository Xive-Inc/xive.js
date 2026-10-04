import { Colors, OptionType } from "./constants.js";

/**
 * A colour as discord.js's `resolveColor` takes it: a number, `"#rrggbb"` or `"rrggbb"`, `[r, g, b]`,
 * a name from `Colors` (`"Red"`, `"Blurple"`), or `"Random"`. `null`/`undefined` clear it. Anything
 * else is a TypeError rather than a NaN that would reach the API; a number outside 0–0xffffff is a
 * RangeError, as in discord.js.
 *
 * @param {unknown} color
 * @returns {number | undefined}
 */
export function resolveColor(color) {
  if (color === null || color === undefined) return undefined;
  /** @type {number} */
  let value;
  if (typeof color === "number") {
    value = color;
  } else if (Array.isArray(color) && color.length === 3 && color.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) {
    value = (color[0] << 16) + (color[1] << 8) + color[2];
  } else if (typeof color === "string") {
    if (color === "Random") return Math.floor(Math.random() * 0x1000000);
    if (Object.prototype.hasOwnProperty.call(Colors, color)) return Colors[/** @type {keyof typeof Colors} */ (color)];
    if (!/^#?[0-9a-f]{6}$/i.test(color)) throw new TypeError(`Unable to convert "${color}" to a colour: use a number, "#rrggbb", [r, g, b], a Colors name or "Random"`);
    value = parseInt(color.replace(/^#/, ""), 16);
  } else {
    throw new TypeError(`Unable to convert ${JSON.stringify(color) ?? String(color)} to a colour: use a number, "#rrggbb", [r, g, b], a Colors name or "Random"`);
  }
  if (!Number.isInteger(value)) throw new TypeError(`Unable to convert ${String(color)} to a colour`);
  if (value < 0 || value > 0xffffff) throw new RangeError("A colour must be between 0 and 0xffffff");
  return value;
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
    this.autocomplete = false;
  }
  /**
   * Suggest values as the member types — you receive an autocomplete interaction and `respond()`.
   * String and integer options only, and not with `addChoices`.
   * @param {boolean} [autocomplete]
   */
  setAutocomplete(autocomplete = true) { this.autocomplete = autocomplete; return this; }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} d */ setDescription(d) { this.description = d; return this; }
  /** @param {boolean} [r] */ setRequired(r = true) { this.required = r; return this; }
  /** @param {...({ name: string, value: string | number } | { name: string, value: string | number }[])} choices */
  addChoices(...choices) { this.choices = [...(this.choices ?? []), ...choices.flat()]; return this; }
  /** @param {...({ name: string, value: string | number } | { name: string, value: string | number }[])} choices */
  setChoices(...choices) { this.choices = choices.flat(); return this; }
  toJSON() {
    return { type: this.type, name: this.name, description: this.description, required: this.required, choices: this.choices, autocomplete: this.autocomplete };
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
    ...(o.autocomplete ? { autocomplete: true } : {}),
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

/**
 * The selects Xive fills itself — members, roles, both, or channels. No options to add; the
 * member picks from the hub. discord.js's builders, the same methods and JSON.
 */
class AutoSelectMenuBuilder {
  /** @param {number} type @param {Record<string, any>} [data] */
  constructor(type, data = {}) { this.data = /** @type {Record<string, any>} */ ({ type, ...data }); }
  /** @param {string} id */ setCustomId(id) { this.data.custom_id = id; return this; }
  /** @param {string} text */ setPlaceholder(text) { this.data.placeholder = text; return this; }
  /** @param {number} n */ setMinValues(n) { this.data.min_values = n; return this; }
  /** @param {number} n */ setMaxValues(n) { this.data.max_values = n; return this; }
  /** @param {boolean} [disabled] */ setDisabled(disabled = true) { this.data.disabled = disabled; return this; }
  /**
   * Pre-select. `{ id, type }` where type is "user", "role" or "channel", as discord.js takes.
   * @param {...({ id: string, type: string } | { id: string, type: string }[])} values
   */
  setDefaultValues(...values) { this.data.default_values = values.flat(); return this; }
  toJSON() { return { ...this.data }; }
}

export class UserSelectMenuBuilder extends AutoSelectMenuBuilder {
  /** @param {Record<string, any>} [data] */ constructor(data) { super(5, data); }
  /** @param {...string} ids */ setDefaultUsers(...ids) { return this.setDefaultValues(ids.flat().map((id) => ({ id, type: "user" }))); }
}
export class RoleSelectMenuBuilder extends AutoSelectMenuBuilder {
  /** @param {Record<string, any>} [data] */ constructor(data) { super(6, data); }
  /** @param {...string} ids */ setDefaultRoles(...ids) { return this.setDefaultValues(ids.flat().map((id) => ({ id, type: "role" }))); }
}
export class MentionableSelectMenuBuilder extends AutoSelectMenuBuilder {
  /** @param {Record<string, any>} [data] */ constructor(data) { super(7, data); }
}
export class ChannelSelectMenuBuilder extends AutoSelectMenuBuilder {
  /** @param {Record<string, any>} [data] */ constructor(data) { super(8, data); }
  /** @param {...string} ids channel ids (uuids) */ setDefaultChannels(...ids) { return this.setDefaultValues(ids.flat().map((id) => ({ id, type: "channel" }))); }
  /** Discord's numbers: 0 text, 2 voice, 13 stage (live rooms). @param {...number} types */
  setChannelTypes(...types) { this.data.channel_types = types.flat(); return this; }
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
