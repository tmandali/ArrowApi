declare module "@tauri-apps/plugin-updater" {
  export interface UpdateDownloadProgress {
    event: "Started" | "Progress" | "Finished";
    data: {
      chunkLength: number;
      contentLength?: number;
    };
  }

  export interface Update {
    available: boolean;
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
    downloadAndInstall: (
      onProgress?: (progress: UpdateDownloadProgress) => void
    ) => Promise<void>;
  }

  export function check(options?: any): Promise<Update | null>;
}

declare module "@tauri-apps/plugin-process" {
  export function relaunch(): Promise<void>;
  export function exit(code?: number): Promise<void>;
}
