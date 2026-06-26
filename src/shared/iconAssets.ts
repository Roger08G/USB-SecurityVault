import { convertFileSrc } from "@tauri-apps/api/core";

const ICON_PREFIX = "icon:";
const IMAGE_EXTENSIONS = new Set([
    "bmp",
    "cur",
    "gif",
    "ico",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "webp",
]);

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

export const resolveIconSrc = (
    icon: string | null | undefined,
    iconsDir: string | null | undefined,
): string | null => {
    if (!icon) return null;
    if (icon.startsWith("data:")) return icon;

    const iconName = extractIconName(icon);
    if (iconName && iconsDir) {
        return convertFileSrc(`${iconsDir}/${iconName}`);
    }

    return icon.includes("://") ? icon : null;
};
