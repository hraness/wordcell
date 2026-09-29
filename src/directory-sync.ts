/**
 * Whether this platform can fsync a directory handle to persist a rename or
 * link. POSIX filesystems need it. Windows refuses (fsync on a directory
 * handle fails with EPERM), and NTFS journals the directory metadata itself,
 * so callers skip the directory sync there and keep every file fsync.
 */
export function syncsDirectories(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32";
}
