declare module '@tauri-apps/api/clipboard' {
  /** Write text to the clipboard. */
  export function writeText(text: string): Promise<void>;

  /** Read text from the clipboard. */
  export function readText(): Promise<string>;

  /** Clear clipboard by writing an empty string. */
  export function clear(): Promise<void>;
}

// Do not re-export '@tauri-apps/api/clipboard' here — that path may not exist
// in the installed '@tauri-apps/api' package. Keep only the clipboard typings.
