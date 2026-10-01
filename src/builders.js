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

export class SlashCommandBuilder {
  constructor() {
    this.name = "";
    this.description = "";
    /** @type {OptionBuilder[]} */
    this.options = [];
    /** @type {string | null} */
    this.invoker_permission = null;
  }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} d */ setDescription(d) { this.description = d; return this; }
  /**
   * Who may run it: a permission key (`Permissions.BanMembers`, or `"mod_ban"`). The member must
   * hold it in the channel they run the command in.
   * @param {string | null} permission
   */
  setDefaultMemberPermissions(permission) { this.invoker_permission = permission; return this; }

  /** @param {string} type @param {(o: OptionBuilder) => OptionBuilder} [fn] */
  #add(type, fn) {
    const option = new OptionBuilder(type);
    this.options.push(fn ? fn(option) : option);
    return this;
  }
  /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addStringOption(fn) { return this.#add(OptionType.String, fn); }
  /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addIntegerOption(fn) { return this.#add(OptionType.Integer, fn); }
  /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addBooleanOption(fn) { return this.#add(OptionType.Boolean, fn); }
  /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addUserOption(fn) { return this.#add(OptionType.User, fn); }
  /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addChannelOption(fn) { return this.#add(OptionType.Channel, fn); }
  /** @param {(o: OptionBuilder) => OptionBuilder} fn */ addRoleOption(fn) { return this.#add(OptionType.Role, fn); }
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      options: this.options.map((o) => o.toJSON()),
      invoker_permission: this.invoker_permission,
    };
  }
}

/** A builder or a plain command object → the body PUT /hubs/applications/@me/commands takes. @param {any} command */
export function toCommandJSON(command) {
  const json = typeof command?.toJSON === "function" ? command.toJSON() : command;
  return {
    name: json.name,
    description: json.description,
    invoker_permission: json.invoker_permission ?? null,
    options: (json.options ?? []).map((/** @type {any} */ o) => ({
      name: o.name,
      description: o.description,
      type: o.type,
      required: Boolean(o.required),
      ...(o.choices ? { choices: o.choices.map((/** @type {any} */ c) => ({ name: c.name, value: c.value })) } : {}),
    })),
  };
}
