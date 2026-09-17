/** Local IDs occupy a separate URL namespace and are never online room credentials. */
export const isBrowserRoom = (code: string) =>
  /^local-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(code);

export function roomPath(code: string) {
  return isBrowserRoom(code) ? `/local/${code.slice(6)}` : `/room/${code}`;
}

export function roomCodeFromPath(path: string) {
  const local = path.match(/^\/local\/([a-f0-9-]+)\/?$/)?.[1];
  if (local && isBrowserRoom(`local-${local}`)) return `local-${local}`;
  return path.match(/^\/room\/([A-Za-z2-9]{6})\/?$/)?.[1].toUpperCase() ?? '';
}
