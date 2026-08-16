import {
  EmlMessage,
  EmlAttachment,
  PlayerIntentPayload,
  RoleplayPayload,
  MasterStatePayload,
  ArtMetaPayload,
} from '../types/chronicle';

export function buildPlayerIntentEml(
  headers: {
    from: string;
    to: string;
    subject: string;
    inReplyTo?: string;
    messageId: string;
    round: number;
    actorId: string;
  },
  intent: PlayerIntentPayload,
  roleplay: RoleplayPayload,
  avatarBase64?: string,
  audioBase64?: string
): string {
  const boundary = `INTENT_BOUND_${Date.now().toString(36)}`;
  const dateStr = new Date().toUTCString();

  let eml = `From: ${headers.from}
To: ${headers.to}
Subject: ${headers.subject}
Date: ${dateStr}
In-Reply-To: ${headers.inReplyTo || `<round-${headers.round.toString().padStart(2, '0')}-master-init@vault.local>`}
Message-ID: ${headers.messageId}
X-Chronicle-Round: ${headers.round}
X-Chronicle-Actor-ID: "${headers.actorId}"
X-Chronicle-Phase: "Intent"
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: application/json; name="intent.json"
Content-ID: <intent_json>
Content-Disposition: attachment; filename="intent.json"

${JSON.stringify(intent, null, 2)}

--${boundary}
Content-Type: application/json; name="roleplay.json"
Content-ID: <roleplay_json>
Content-Disposition: attachment; filename="roleplay.json"

${JSON.stringify(roleplay, null, 2)}
`;

  if (avatarBase64) {
    const avatarCid = roleplay.avatar_emotion_cid.replace(/^cid:/, '');
    eml += `
--${boundary}
Content-Type: image/png; name="portrait_${roleplay.avatar_emotion_cid.replace(/^cid:avatar_/, '')}.png"
Content-ID: <${avatarCid}>
Content-Transfer-Encoding: base64
Content-Disposition: inline; filename="avatar.png"

${avatarBase64}
`;
  }

  if (audioBase64) {
    eml += `
--${boundary}
Content-Type: audio/opus; name="voice.opus"
Content-ID: <voice_line>
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="voice.opus"

${audioBase64}
`;
  }

  eml += `\n--${boundary}--\n`;
  return eml;
}

export function buildMasterResolutionEml(
  headers: {
    from: string;
    to: string;
    subject: string;
    inReplyTo?: string;
    messageId: string;
    round: number;
  },
  state: MasterStatePayload,
  prose: string,
  battlemapSvg?: string,
  masterAudioBase64?: string
): string {
  const boundary = `RESOLVE_BOUND_${Date.now().toString(36)}`;
  const dateStr = new Date().toUTCString();

  let eml = `From: ${headers.from}
To: ${headers.to}
Subject: ${headers.subject}
Date: ${dateStr}
In-Reply-To: ${headers.inReplyTo || `<round-${headers.round.toString().padStart(2, '0')}-master-init@vault.local>`}
Message-ID: ${headers.messageId}
X-Chronicle-Round: ${headers.round}
X-Chronicle-Phase: "Resolution"
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: application/json; name="state.json"
Content-ID: <game_state_json>
Content-Disposition: attachment; filename="state.json"

${JSON.stringify(state, null, 2)}

--${boundary}
Content-Type: text/markdown; name="canonical_prose.md"
Content-ID: <master_prose>
Content-Disposition: inline; filename="canonical_prose.md"

${prose}
`;

  if (battlemapSvg) {
    eml += `
--${boundary}
Content-Type: image/svg+xml; name="battlemap_result.svg"
Content-ID: <battlemap_svg>
Content-Disposition: inline; filename="battlemap_result.svg"

${battlemapSvg}
`;
  }

  if (masterAudioBase64) {
    eml += `
--${boundary}
Content-Type: audio/opus; name="master_narration.opus"
Content-ID: <master_voice>
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="master_narration.opus"

${masterAudioBase64}
`;
  }

  eml += `\n--${boundary}--\n`;
  return eml;
}

export function buildPartyArtEml(
  headers: {
    from: string;
    to: string;
    subject: string;
    messageId: string;
    targetRound: number;
    assetType?: string;
  },
  artMeta: ArtMetaPayload,
  artworkPngBase64?: string
): string {
  const boundary = `ART_BOUND_${Date.now().toString(36)}`;
  const dateStr = new Date().toUTCString();

  let eml = `From: ${headers.from}
To: ${headers.to}
Subject: ${headers.subject}
Date: ${dateStr}
Message-ID: ${headers.messageId}
X-Chronicle-Target-Round: ${headers.targetRound}
X-Chronicle-Asset-Type: "${headers.assetType || 'Illustration'}"
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: application/json; name="art_meta.json"
Content-ID: <art_meta_json>
Content-Disposition: attachment; filename="art_meta.json"

${JSON.stringify(artMeta, null, 2)}
`;

  if (artworkPngBase64) {
    eml += `
--${boundary}
Content-Type: image/png; name="artwork_300dpi.png"
Content-ID: <artwork_image>
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="artwork_300dpi.png"

${artworkPngBase64}
`;
  }

  eml += `\n--${boundary}--\n`;
  return eml;
}

/**
 * Fast RFC 5322 EML Parser (<5ms)
 */
export function parseEmlString(rawEml: string): EmlMessage {
  const normalized = rawEml.replace(/\r\n/g, '\n');
  const headerEndIndex = normalized.indexOf('\n\n');
  const rawHeaders = headerEndIndex !== -1 ? normalized.substring(0, headerEndIndex) : normalized;
  const rawBody = headerEndIndex !== -1 ? normalized.substring(headerEndIndex + 2) : '';

  const getHeader = (name: string): string => {
    const regex = new RegExp(`^${name}:[ \t]*(.*)$`, 'gim');
    const match = regex.exec(rawHeaders);
    return match ? match[1].trim().replace(/^"(.*)"$/, '$1') : '';
  };

  const from = getHeader('From') || 'unknown@chronicle.local';
  const to = getHeader('To') || 'vault@chronicle.local';
  const subject = getHeader('Subject') || 'Untitled EML Capsule';
  const inReplyTo = getHeader('In-Reply-To') || undefined;
  const messageId = getHeader('Message-ID') || `<msg-${Date.now()}@chronicle.local>`;
  const date = getHeader('Date') || new Date().toISOString();
  
  const roundStr = getHeader('X-Chronicle-Round') || getHeader('X-Chronicle-Target-Round') || '1';
  const round = parseInt(roundStr, 10) || 1;
  const actorId = getHeader('X-Chronicle-Actor-ID') || undefined;
  const phaseStr = (getHeader('X-Chronicle-Phase') as 'Intent' | 'Resolution' | 'Art' | 'General') || undefined;
  const assetType = getHeader('X-Chronicle-Asset-Type') as any || undefined;

  // Extract boundary from Content-Type
  const boundaryMatch = rawHeaders.match(/boundary="?([^";\n]+)"?/i);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  const attachments: EmlAttachment[] = [];
  let intentJson: PlayerIntentPayload | undefined;
  let roleplayJson: RoleplayPayload | undefined;
  let stateJson: MasterStatePayload | undefined;
  let masterProseMarkdown: string | undefined;
  let artMetaJson: ArtMetaPayload | undefined;

  if (boundary) {
    const rawParts = rawBody.split(`--${boundary}`);
    for (const part of rawParts) {
      if (!part.trim() || part.trim() === '--') continue;

      const partHeaderEnd = part.indexOf('\n\n');
      if (partHeaderEnd === -1) continue;

      const partHeaders = part.substring(0, partHeaderEnd);
      const partBody = part.substring(partHeaderEnd + 2).trim();

      const getPartHeader = (name: string): string => {
        const regex = new RegExp(`^${name}:[ \t]*(.*)$`, 'gim');
        const match = regex.exec(partHeaders);
        return match ? match[1].trim() : '';
      };

      const cTypeFull = getPartHeader('Content-Type') || 'text/plain';
      const cType = cTypeFull.split(';')[0].trim().toLowerCase();
      const contentId = (getPartHeader('Content-ID') || '').replace(/^<|>$/g, '');
      const filenameMatch = partHeaders.match(/filename="?([^";\n]+)"?/i) || partHeaders.match(/name="?([^";\n]+)"?/i);
      const filename = filenameMatch ? filenameMatch[1] : (contentId || 'attachment');
      const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(partHeaders);

      attachments.push({
        filename,
        contentType: cType,
        contentId,
        content: partBody,
        isBinary: isBase64,
      });

      // Special parsing for known capsules
      if (cType === 'application/json' || filename.endsWith('.json')) {
        try {
          const parsed = JSON.parse(partBody);
          if (contentId === 'intent_json' || filename === 'intent.json') {
            intentJson = parsed;
          } else if (contentId === 'roleplay_json' || filename === 'roleplay.json') {
            roleplayJson = parsed;
          } else if (contentId === 'game_state_json' || filename === 'state.json') {
            stateJson = parsed;
          } else if (contentId === 'art_meta_json' || filename === 'art_meta.json') {
            artMetaJson = parsed;
          }
        } catch {
          // ignore malformed internal json
        }
      } else if (cType === 'text/markdown' || filename === 'canonical_prose.md' || contentId === 'master_prose') {
        masterProseMarkdown = partBody;
      }
    }
  }

  // Determine phase if not explicitly specified
  let phase = phaseStr;
  if (!phase) {
    if (intentJson) phase = 'Intent';
    else if (stateJson || masterProseMarkdown) phase = 'Resolution';
    else if (artMetaJson || assetType) phase = 'Art';
    else phase = 'General';
  }

  return {
    id: messageId,
    from,
    to,
    subject,
    inReplyTo,
    date,
    round,
    actorId,
    phase,
    targetRound: round,
    assetType,
    rawEml,
    intentJson,
    roleplayJson,
    stateJson,
    masterProseMarkdown,
    artMetaJson,
    attachments,
  };
}

export function downloadEmlFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'message/rfc822;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.eml') ? filename : `${filename}.eml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
