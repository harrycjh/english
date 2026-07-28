import { readFileSync } from 'node:fs';
import OSS from 'ali-oss';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

function loadPhotoManifest() {
  const manifest = JSON.parse(
    readFileSync(new URL('./photo-manifest.json', import.meta.url), 'utf8'),
  );
  return new Map(
    (manifest.entries ?? []).map((entry) => [entry.wordId, {
      wordId: entry.wordId,
      objectKey: String(entry.relatedMedia.lifePhoto.imagePath).replace(/^\/+/, ''),
      caption: entry.relatedMedia.lifePhoto.caption,
      photoId: entry.relatedMedia.lifePhoto.photoId,
      match: entry.relatedMedia.lifePhoto.match,
      confidence: entry.relatedMedia.lifePhoto.confidence,
    }]),
  );
}

function contextCredentials(context = {}) {
  const credentials = context.credentials ?? context.Credentials ?? {};
  return {
    accessKeyId: credentials.accessKeyId ?? credentials.AccessKeyId
      ?? process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: credentials.accessKeySecret ?? credentials.AccessKeySecret
      ?? process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? process.env.OSS_ACCESS_KEY_SECRET,
    stsToken: credentials.securityToken ?? credentials.SecurityToken
      ?? process.env.ALIBABA_CLOUD_SECURITY_TOKEN ?? process.env.OSS_SESSION_TOKEN,
  };
}

export function createOssPhotoService(client, options = {}) {
  const manifest = options.manifest ?? loadPhotoManifest();
  const ttlSeconds = Math.min(
    MAX_SIGNED_URL_TTL_SECONDS,
    Math.max(60, Number(options.ttlSeconds) || DEFAULT_SIGNED_URL_TTL_SECONDS),
  );

  return {
    async sign(wordIds) {
      const uniqueWordIds = [...new Set(wordIds)];
      const photos = [];
      for (const wordId of uniqueWordIds) {
        const entry = manifest.get(wordId);
        if (!entry) continue;
        const url = await client.signatureUrlV4('GET', ttlSeconds, { headers: {} }, entry.objectKey);
        photos.push({ ...entry, url });
      }
      return {
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        photos,
      };
    },
  };
}

export function createOssPhotoServiceFromEnv(env, context = {}) {
  const { accessKeyId, accessKeySecret, stsToken } = contextCredentials(context);
  if (!accessKeyId || !accessKeySecret || !env.OSS_BUCKET) {
    throw new Error('OSS photo signing is not configured.');
  }
  const client = new OSS({
    accessKeyId,
    accessKeySecret,
    stsToken,
    bucket: env.OSS_BUCKET,
    region: env.OSS_REGION ?? 'oss-cn-shanghai',
    endpoint: env.OSS_PUBLIC_ENDPOINT || undefined,
    secure: true,
    authorizationV4: true,
  });
  return createOssPhotoService(client, {
    ttlSeconds: env.OSS_SIGNED_URL_TTL_SECONDS,
  });
}
