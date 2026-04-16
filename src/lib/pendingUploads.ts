/**
 * Registry for images that have been selected locally but not yet uploaded to Supabase Storage.
 * This prevents unnecessary uploads (and storage bloat) during the drafting process.
 */

const pendingImages = new Map<string, File>();

/**
 * Registers a File object and returns a local blob URL for temporary preview.
 */
export function registerPendingUpload(file: File): string {
  const blobUrl = URL.createObjectURL(file);
  pendingImages.set(blobUrl, file);
  return blobUrl;
}

/**
 * Retrieves a File object associated with a blob URL.
 */
export function getPendingUpload(blobUrl: string): File | undefined {
  return pendingImages.get(blobUrl);
}

/**
 * Removes a pending upload once it's no longer needed or has been uploaded.
 */
export function clearPendingUpload(blobUrl: string) {
  if (pendingImages.has(blobUrl)) {
    URL.revokeObjectURL(blobUrl);
    pendingImages.delete(blobUrl);
  }
}

/**
 * Checks if a string is a temporary blob URL.
 */
export function isBlobUrl(url: string | undefined): boolean {
  return !!url && url.startsWith('blob:');
}
