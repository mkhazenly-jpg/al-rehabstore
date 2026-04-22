// Server-side helper to upload (and replace) a backup file in Google Drive
// via the Lovable connector gateway.
const GATEWAY_BASE = 'https://connector-gateway.lovable.dev/google_drive';
const FOLDER_NAME = 'مخزن الرحاب - نسخ احتياطية';
const FILE_PREFIX = 'al-rehab-backup';

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
  if (!GOOGLE_DRIVE_API_KEY) throw new Error('GOOGLE_DRIVE_API_KEY is not configured');
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': GOOGLE_DRIVE_API_KEY,
  };
}

async function findOrCreateFolder(): Promise<string> {
  const headers = authHeaders();
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(`${GATEWAY_BASE}/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers,
  });
  if (!searchRes.ok) {
    throw new Error(`Drive folder search failed [${searchRes.status}]: ${await searchRes.text()}`);
  }
  const searchData = (await searchRes.json()) as { files?: Array<{ id: string }> };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch(`${GATEWAY_BASE}/drive/v3/files`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Drive folder create failed [${createRes.status}]: ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function deleteOldBackups(folderId: string): Promise<number> {
  const headers = authHeaders();
  const q = encodeURIComponent(
    `name contains '${FILE_PREFIX}' and '${folderId}' in parents and trashed=false`
  );
  const res = await fetch(`${GATEWAY_BASE}/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`Drive list-old failed [${res.status}]: ${await res.text()}`);
  }
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  const files = data.files || [];
  let deleted = 0;
  for (const f of files) {
    const del = await fetch(`${GATEWAY_BASE}/drive/v3/files/${f.id}`, {
      method: 'DELETE',
      headers,
    });
    if (del.ok || del.status === 204) deleted++;
  }
  return deleted;
}

async function uploadFile(
  folderId: string,
  fileName: string,
  buffer: Uint8Array
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const headers = authHeaders();
  const boundary = '----lovable_drive_boundary_' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Build multipart body
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
  );
  const post = enc.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(pre.length + buffer.length + post.length);
  body.set(pre, 0);
  body.set(buffer, pre.length);
  body.set(post, pre.length + buffer.length);

  const res = await fetch(
    `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    throw new Error(`Drive upload failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()) as { id: string; name: string; webViewLink?: string };
}

export async function uploadBackupToDrive(
  buffer: Uint8Array
): Promise<{ folderId: string; fileId: string; fileName: string; deletedOld: number; webViewLink?: string }> {
  const folderId = await findOrCreateFolder();
  const deletedOld = await deleteOldBackups(folderId);
  const stamp = new Date().toISOString().split('T')[0];
  const fileName = `${FILE_PREFIX}-${stamp}.xlsx`;
  const uploaded = await uploadFile(folderId, fileName, buffer);
  return { folderId, fileId: uploaded.id, fileName: uploaded.name, deletedOld, webViewLink: uploaded.webViewLink };
}
