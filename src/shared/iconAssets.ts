import type { IconBytes } from "./api";

const ICON_PREFIX = "icon:";
const IMAGE_EXTENSIONS = new Set(["bmp", "cur", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);

export const toIconRef = (name: string) => `${ICON_PREFIX}${name}`;

export const extractIconName = (icon: string | null | undefined): string | null => {
    if (!icon) return null;
    if (icon.startsWith(ICON_PREFIX)) return icon.slice(ICON_PREFIX.length);
    if (icon.startsWith("data:")) return null;

    let decoded = icon;
    try {
        decoded = decodeURIComponent(icon);
    } catch {
        decoded = icon;
    }

    const normalized = decoded.replace(/\\/g, "/").split(/[?#]/)[0];
    const parts = normalized.split("/").filter(Boolean);
    const candidate = parts[parts.length - 1];
    if (!candidate || !candidate.includes(".")) return null;

    const ext = candidate.split(".").pop()?.toLowerCase();
    return ext && IMAGE_EXTENSIONS.has(ext) ? candidate : null;
};

export const isStoredImageIcon = (icon: string | null | undefined) =>
    Boolean(icon && (icon.startsWith("data:") || icon.includes("://") || extractIconName(icon)));

export const normalizeIconForStorage = (icon: string | null | undefined): string | null => {
    if (!icon) return null;
    const iconName = extractIconName(icon);
    return iconName ? toIconRef(iconName) : icon;
};

export type IconSources = Record<string, string>;

export const iconBytesToDataUrl = (icon: IconBytes): string => {
    const bytes = new Uint8Array(icon.data);
    const chunks: string[] = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return `data:${icon.mime};base64,${btoa(chunks.join(""))}`;
};

export const iconListToSources = (icons: IconBytes[]): IconSources =>
    Object.fromEntries(icons.map((icon) => [icon.name, iconBytesToDataUrl(icon)]));

export const resolveIconSrc = (
    icon: string | null | undefined,
    iconSources: IconSources | null | undefined,
): string | null => {
    if (!icon) return null;
    if (icon.startsWith("data:")) return icon;

    const iconName = extractIconName(icon);
    if (iconName && iconSources) {
        return iconSources[iconName] ?? null;
    }

    return icon.includes("://") ? icon : null;
};
