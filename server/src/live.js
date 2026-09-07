// Aula ao vivo de verdade: LiveKit (SFU) no lugar da malha WebRTC.
// Ligado quando LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET existem; sem eles, o cliente usa a malha.
// Salas: "open" (proximidade em área aberta; o cliente assina só quem está no grupo), "zone-<id>" (reunião e palco),
// "ch-<id>" (canais de voz). No palco só quem está em cima publica (permissão vem do token e é atualizada ao vivo).
// Gravação (opcional): RoomComposite Egress pra um bucket S3; quando termina, vira aula na biblioteca.
import { AccessToken, RoomServiceClient, EgressClient, EncodedFileOutput, EncodedFileType, S3Upload, WebhookReceiver } from "livekit-server-sdk";

const cfg = {
  url: process.env.LIVEKIT_URL || "",                 // wss://live.seudominio.com (o navegador conecta aqui)
  apiUrl: process.env.LIVEKIT_API_URL || "",          // https://... pro servidor falar com o LiveKit (padrão: derivado da URL)
  key: process.env.LIVEKIT_API_KEY || "",
  secret: process.env.LIVEKIT_API_SECRET || "",
  s3: process.env.S3_BUCKET ? { bucket: process.env.S3_BUCKET, endpoint: process.env.S3_ENDPOINT || "", region: process.env.S3_REGION || "auto", accessKey: process.env.S3_KEY || "", secret: process.env.S3_SECRET || "", forcePathStyle: process.env.S3_PATH_STYLE === "1", publicUrl: (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "") } : null,
};
export const liveEnabled = () => !!(cfg.url && cfg.key && cfg.secret);
export const recordingEnabled = () => liveEnabled() && !!cfg.s3;
const apiUrl = () => cfg.apiUrl || cfg.url.replace(/^ws/, "http");

// grupo de voz (world.voiceGroups) -> nome da sala no LiveKit
export function roomFor(groupId) {
  if (!groupId) return null;
  if (groupId.startsWith("prox:")) return "open";
  if (groupId.startsWith("zone:")) return "zone-" + groupId.slice(5);
  if (groupId.startsWith("ch:")) return "ch-" + groupId.slice(3);
  return null;
}

export async function tokenFor(user, room, { canPublish = true } = {}) {
  const at = new AccessToken(cfg.key, cfg.secret, { identity: user.id, name: user.name, ttl: "6h", metadata: JSON.stringify({ role: user.role }) });
  at.addGrant({ room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
  return at.toJwt();
}

let rooms = null, egress = null;
const svc = () => (rooms ??= new RoomServiceClient(apiUrl(), cfg.key, cfg.secret));
const eg = () => (egress ??= new EgressClient(apiUrl(), cfg.key, cfg.secret));

// subiu/desceu do palco sem trocar de sala: muda a permissão sem reconectar
export async function setCanPublish(room, identity, canPublish) {
  try { await svc().updateParticipant(room, identity, undefined, { canPublish, canSubscribe: true, canPublishData: false }); }
  catch (e) { /* participante ainda não entrou na sala: o token novo já vai com a permissão certa */ }
}
export async function kick(room, identity) { try { await svc().removeParticipant(room, identity); } catch {} }

// ---------- gravação ----------
export async function startRecording(room, { title }) {
  if (!recordingEnabled()) throw new Error("gravação não configurada (LiveKit + S3)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filepath = `aulas/${room}/${stamp}.mp4`;
  const out = new EncodedFileOutput({
    fileType: EncodedFileType.MP4, filepath,
    output: { case: "s3", value: new S3Upload({ accessKey: cfg.s3.accessKey, secret: cfg.s3.secret, bucket: cfg.s3.bucket, endpoint: cfg.s3.endpoint, region: cfg.s3.region, forcePathStyle: cfg.s3.forcePathStyle }) },
  });
  const info = await eg().startRoomCompositeEgress(room, { file: out }, { layout: "speaker", audioOnly: false });
  return { egressId: info.egressId, filepath, url: cfg.s3.publicUrl ? `${cfg.s3.publicUrl}/${filepath}` : null, title };
}
export async function stopRecording(egressId) { return eg().stopEgress(egressId); }

// webhook do LiveKit (egress_ended etc.): valida a assinatura e devolve o evento
const receiver = () => new WebhookReceiver(cfg.key, cfg.secret);
export async function parseWebhook(rawBody, authHeader) { return receiver().receive(rawBody, authHeader); }

export function liveInfo() { return liveEnabled() ? { url: cfg.url, recording: recordingEnabled() } : null; }
