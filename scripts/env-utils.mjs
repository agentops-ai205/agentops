import { readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvFile(envPath) {
  const absolute = path.resolve(envPath);
  const content = readFileSync(absolute, "utf8");
  return content.split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return env;
    const index = trimmed.indexOf("=");
    if (index === -1) return env;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    env[key] = value;
    return env;
  }, {});
}

export function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1] ?? fallback;
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  return fallback;
}

export function mask(value = "") {
  if (!value) return "missing";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
