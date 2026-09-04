/**
 * File System Access API — `FileSystemDirectoryHandle` async iteration.
 *
 * Browsers implement `entries()`, `keys()` and `values()` at runtime
 * (the async-iterable directory handle proposal), but `lib.dom` in
 * TypeScript 5.9 does not declare them yet. This global augmentation
 * makes `for await (const [name, handle] of dir.entries())` typecheck.
 */
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<
    [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  >
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<
    FileSystemFileHandle | FileSystemDirectoryHandle
  >
}
