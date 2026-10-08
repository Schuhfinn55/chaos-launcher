/* „Mitspielen“: Server, auf den der nächste Spielstart direkt verbinden soll (einmalig). */
let pending = "";
export function setPendingJoin(server: string) {
  pending = server.trim();
}
export function consumePendingJoin(): string {
  const s = pending;
  pending = "";
  return s;
}
export function peekPendingJoin(): string {
  return pending;
}
