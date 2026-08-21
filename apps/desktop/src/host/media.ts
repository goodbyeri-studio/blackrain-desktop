export function convertFileSrc(filePath: string): string {
  if (/^(?:data:|https?:|blackrain-file:)/iu.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, "/");
  return `blackrain-file://local/${encodeURIComponent(normalized).replace(/%2F/giu, "/")}`;
}
