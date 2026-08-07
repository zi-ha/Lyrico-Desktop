export function isTrackUnderFolder(trackPath: string, folderPath: string) {
  return normalizePath(trackPath).startsWith(normalizeFolderPath(folderPath));
}

export function samePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

export function normalizeFolderPath(path: string) {
  const normalized = normalizePath(path);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLocaleLowerCase();
}
