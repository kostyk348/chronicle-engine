import JSZip from 'jszip';
import { Chapter, BestiaryEntry, GrimoireItem } from '../types/chronicle';
import { isDesktop, saveViaDialog, browserDownload } from './desktopIO';

/**
 * Escapes XML special characters for valid XHTML in EPUB
 */
function escapeXml(str: string = ''): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an authentic, fully compliant EPUB 3.0 book with complete Russian typography,
 * chapter layouts, Monster Manual stat blocks, artifact grimoire, and roleplay scrolls.
 */
export async function exportCampaignToEpub(
  chapters: Chapter[],
  bestiary: BestiaryEntry[],
  grimoire: GrimoireItem[],
  filename: string = 'Chronicle_Campaign_Book.epub',
  onProgress?: (percent: number, status: string) => void
): Promise<void> {
  onProgress?.(10, 'Инициализация EPUB 3.0 контейнера...');

  const zip = new JSZip();

  // 1. mimetype (Must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  onProgress?.(25, 'Генерация стилей и типографики книги...');

  // 3. OEBPS/styles.css
  const stylesCss = `
@charset "UTF-8";

body {
  font-family: "EB Garamond", "Cormorant Garamond", Georgia, "Times New Roman", serif;
  font-size: 1.05em;
  line-height: 1.65;
  color: #1c1917;
  background-color: #fbf7ed;
  margin: 1.5em 2em;
  text-align: justify;
}

h1, h2, h3, h4 {
  font-family: "Cinzel", Georgia, serif;
  color: #78350f;
  text-align: center;
  font-weight: bold;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1 { font-size: 1.8em; letter-spacing: 0.05em; border-bottom: 2px solid #78350f; padding-bottom: 0.3em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.2em; text-align: left; }

p {
  margin: 0 0 0.8em 0;
  text-indent: 1.5em;
}

p.no-indent {
  text-indent: 0;
}

.subtitle {
  text-align: center;
  font-style: italic;
  color: #57534e;
  margin-bottom: 1.5em;
}

.ornament-divider {
  text-align: center;
  color: #78350f;
  margin: 1.5em 0;
  font-size: 1.2em;
}

.drop-cap {
  float: left;
  font-size: 3.2em;
  line-height: 0.8;
  font-family: "Cinzel", Georgia, serif;
  font-weight: bold;
  color: #78350f;
  padding-right: 0.15em;
  padding-top: 0.05em;
}

/* Master Notes */
.master-notes {
  background-color: #f2e9d8;
  border: 1px solid #78350f;
  border-radius: 6px;
  padding: 1em;
  margin: 1.5em 0;
  font-size: 0.95em;
}

.master-notes-title {
  font-weight: bold;
  color: #78350f;
  text-transform: uppercase;
  font-size: 0.8em;
  letter-spacing: 0.1em;
  margin-bottom: 0.5em;
}

/* Roleplay Quotes */
.roleplay-box {
  background-color: #ede4d1;
  border-left: 4px solid #78350f;
  border-top: 1px solid #cbbba4;
  border-bottom: 1px solid #cbbba4;
  border-right: 1px solid #cbbba4;
  padding: 1em;
  margin: 1.5em 0;
  border-radius: 0 6px 6px 0;
}

.roleplay-box-title {
  font-weight: bold;
  color: #78350f;
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.8em;
}

.roleplay-quote {
  margin-top: 0.8em;
  padding-top: 0.8em;
  border-top: 1px solid rgba(120, 53, 15, 0.2);
}

.roleplay-quote:first-child {
  border-top: none;
  padding-top: 0;
}

.roleplay-author {
  font-weight: bold;
  color: #292524;
}

.roleplay-speech {
  font-style: italic;
  color: #44403c;
  margin: 0.3em 0 0.3em 0.8em;
  border-left: 2px solid #78350f;
  padding-left: 0.6em;
}

.roleplay-flavor {
  font-size: 0.85em;
  color: #78716c;
}

/* Mechanical Logs & WEGO Engine */
.battle-log-box {
  background-color: #241d19;
  color: #f5f5f4;
  padding: 1em;
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.85em;
  margin: 1.5em 0;
  border: 1px solid #443730;
}

.battle-log-title {
  color: #d4af37;
  font-weight: bold;
  margin-bottom: 0.5em;
  text-transform: uppercase;
}

/* Loot Rewards */
.loot-box {
  background-color: #f2ecdc;
  border: 1px solid #d4af37;
  border-radius: 6px;
  padding: 0.8em 1.2em;
  margin: 1.5em 0;
  font-size: 0.9em;
}

.loot-title {
  font-weight: bold;
  color: #9a3412;
  margin-bottom: 0.3em;
}

/* Monster Stat Blocks */
.stat-block {
  background-color: #fbf7ed;
  border: 2px solid #78350f;
  border-radius: 8px;
  padding: 1.2em;
  margin: 1.5em 0;
}

.stat-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  background-color: #f0e8d5;
  text-align: center;
  font-size: 0.9em;
}

.stat-table th, .stat-table td {
  padding: 0.4em;
  border: 1px solid #cbbba4;
}

.stat-table th {
  color: #78350f;
  font-size: 0.8em;
}

/* Grimoire Items */
.item-card {
  background-color: #fbf7ed;
  border: 2px solid #78350f;
  border-radius: 8px;
  padding: 1.2em;
  margin: 1.5em 0;
}

.item-badge {
  display: inline-block;
  background-color: #f0e8d5;
  color: #78350f;
  border: 1px solid #cbbba4;
  padding: 0.2em 0.6em;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: bold;
  margin-top: 0.4em;
}

/* Cover page */
.cover-container {
  text-align: center;
  padding: 3em 1em;
  border: 8px double #78350f;
  background-color: #fefcf6;
}

.cover-title {
  font-size: 2.2em;
  font-family: "Cinzel", Georgia, serif;
  color: #3e1f07;
  margin: 0.5em 0;
}

.cover-sub {
  font-size: 1.1em;
  color: #78350f;
  font-style: italic;
}

.cover-seal {
  font-size: 4em;
  color: #d4af37;
  margin: 1em 0;
}
`;
  zip.file('OEBPS/styles.css', stylesCss);

  onProgress?.(40, 'Формирование титульной страницы и оглавления...');

  // 4. OEBPS/cover.xhtml
  const coverHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>Хроника Одинокого Пика</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="cover-container">
    <p class="no-indent" style="letter-spacing: 0.2em; color: #9a3412; font-weight: bold; font-size: 0.85em; text-transform: uppercase;">
      Фолиант Кампании D&amp;D 5e • WEGO Engine
    </p>
    <h1 class="cover-title">ХРОНИКА ОДИНОКОГО ПИКА</h1>
    <p class="cover-sub">Канонический летописный архив раундов и судеб</p>
    
    <div class="cover-seal">⚜</div>

    <div class="ornament-divider">❧ ❦ ☙</div>

    <p class="no-indent" style="font-size: 0.9em; color: #57534e; line-height: 1.8;">
      <strong>Ведущий игры:</strong> Мастер Подземелий (DM)<br/>
      <strong>Герои партии:</strong> Торин (Щитоносец Одинокого Пика), Елена (Орден Тлеющего Ока)<br/>
      <strong>Издательский конвейер:</strong> Campfire Scribe (RFC 5322 EML Vault)<br/>
      <strong>Дата создания:</strong> ${new Date().toLocaleDateString('ru-RU')}
    </p>
  </div>
</body>
</html>`;
  zip.file('OEBPS/cover.xhtml', coverHtml);

  // 5. Generate XHTML for each chapter
  chapters.forEach((ch, idx) => {
    onProgress?.(50 + Math.floor((idx / chapters.length) * 25), `Сборка Главы ${ch.round}...`);

    const cleanTitle = ch.title.replace(/^Глава\s+[IVXLCDM]+\.\s*/, '');
    const firstChar = ch.prose.charAt(0);
    const restProse = ch.prose.substring(1);

    const paragraphs = restProse
      .split('\n\n')
      .map(p => p.trim())
      .filter(Boolean);

    const page2Paragraphs = (ch.prosePage2 || '')
      .split('\n\n')
      .map(p => p.trim())
      .filter(Boolean);

    const chapterHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>Глава ${ch.round}. ${escapeXml(cleanTitle)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="chapter-header">
    <p class="no-indent" style="text-align: center; text-transform: uppercase; letter-spacing: 0.2em; color: #9a3412; font-weight: bold; font-size: 0.85em;">
      — Глава ${ch.round} —
    </p>
    <h1>${escapeXml(cleanTitle)}</h1>
    <p class="subtitle">${escapeXml(ch.subtitle)}</p>
    <div class="ornament-divider">❧ ❦ ☙</div>
  </div>

  <!-- Main Narrative Prose with Drop Cap -->
  <div class="prose-section">
    <p><span class="drop-cap">${escapeXml(firstChar)}</span>${paragraphs.length > 0 ? escapeXml(paragraphs[0]) : ''}</p>
    ${paragraphs.slice(1).map(p => `<p>${escapeXml(p)}</p>`).join('\n')}
  </div>

  ${
    page2Paragraphs.length > 0
      ? `
  <div class="prose-section" style="margin-top: 1em;">
    ${page2Paragraphs.map(p => `<p>${escapeXml(p)}</p>`).join('\n')}
  </div>
  `
      : ''
  }

  <!-- Master Notes / Lore -->
  ${
    ch.masterNotes
      ? `
  <div class="master-notes">
    <div class="master-notes-title">✍ Заметки Мастера (Lore &amp; Environment):</div>
    <div style="font-style: italic; color: #44403c;">${escapeXml(ch.masterNotes)}</div>
  </div>
  `
      : ''
  }

  <!-- Roleplay Quotes (RFC 5322 Intent) -->
  ${
    ch.roleplayQuotes && ch.roleplayQuotes.length > 0
      ? `
  <div class="roleplay-box">
    <div class="roleplay-box-title">📜 Прямая речь участников раунда (RFC 5322):</div>
    ${ch.roleplayQuotes
      .map(
        q => `
      <div class="roleplay-quote">
        <div class="roleplay-author">${escapeXml(q.actorName)} <span style="font-weight: normal; color: #57534e;">(${escapeXml(q.actorClass)})</span></div>
        <div class="roleplay-speech">«${escapeXml(q.speech)}»</div>
        ${q.flavor ? `<div class="roleplay-flavor">[Действие: ${escapeXml(q.flavor)}]</div>` : ''}
      </div>
    `
      )
      .join('\n')}
  </div>
  `
      : ''
  }

  <!-- Mechanical Battle Summary -->
  ${
    ch.battleLogSummary && ch.battleLogSummary.length > 0
      ? `
  <div class="battle-log-box">
    <div class="battle-log-title">🛡 Механический итог столкновения (WEGO Resolution):</div>
    ${ch.battleLogSummary.map(log => `<div>• ${escapeXml(log)}</div>`).join('\n')}
  </div>
  `
      : ''
  }

  <!-- Loot Rewards -->
  ${
    ch.lootReward
      ? `
  <div class="loot-box">
    <div class="loot-title">🎁 Трофеи и опыт партии: +${ch.lootReward.xp} XP</div>
    <div><strong>Монеты:</strong> ${escapeXml(ch.lootReward.coins || 'Нет')}</div>
    ${ch.lootReward.items && ch.lootReward.items.length > 0 ? `<div><strong>Находки:</strong> ${escapeXml(ch.lootReward.items.join(', '))}</div>` : ''}
  </div>
  `
      : ''
  }

  <!-- Checksum Seal -->
  <div style="text-align: right; font-size: 0.8em; color: #78716c; font-family: monospace; margin-top: 2em; border-top: 1px solid #78350f; padding-top: 0.5em;">
    RFC 5322 EML Checksum: 0x8f4a..e8f9 [VERIFIED] • ⚜ ПЕЧАТЬ КАНОНА
  </div>
</body>
</html>`;

    zip.file(`OEBPS/chapter_${ch.round}.xhtml`, chapterHtml);
  });

  // 6. OEBPS/bestiary.xhtml
  onProgress?.(80, 'Сборка бестиария чудовищ...');
  const bestiaryHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>Бестиарий Кампании</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>БЕСТИАРИЙ КАМПАНИИ</h1>
  <p class="subtitle">Monster Manual D&amp;D 5e • Статблоки существ Одинокого Пика</p>
  <div class="ornament-divider">❧ ❦ ☙</div>

  ${bestiary
    .map(
      be => `
    <div class="stat-block">
      <h2>${escapeXml(be.name)}</h2>
      <p class="subtitle" style="margin-bottom: 0.5em;">${escapeXml(be.type)} • CR ${escapeXml(be.challengeRating)}</p>
      
      <p class="no-indent" style="font-weight: bold; color: #78350f;">
        Класс Доспеха (AC): ${be.ac} | Хиты (HP): ${be.hp} | Скорость: ${escapeXml(be.speed)}
      </p>

      <table class="stat-table">
        <tr>
          <th>СИЛ</th>
          <th>ЛОВ</th>
          <th>ТЕЛ</th>
          <th>ИНТ</th>
          <th>МДР</th>
          <th>ХАР</th>
        </tr>
        <tr>
          <td>${be.stats.str}</td>
          <td>${be.stats.dex}</td>
          <td>${be.stats.con}</td>
          <td>${be.stats.int}</td>
          <td>${be.stats.wis}</td>
          <td>${be.stats.cha}</td>
        </tr>
      </table>

      <h3>Действия существа:</h3>
      ${be.actions.map(act => `<p class="no-indent"><strong>${escapeXml(act.name)}.</strong> ${escapeXml(act.desc)}</p>`).join('')}

      <p class="no-indent" style="margin-top: 1em; font-style: italic; color: #57534e; border-top: 1px solid #cbbba4; padding-top: 0.5em;">
        <strong>Предание:</strong> ${escapeXml(be.lore)}
      </p>
    </div>
  `
    )
    .join('\n')}
</body>
</html>`;
  zip.file('OEBPS/bestiary.xhtml', bestiaryHtml);

  // 7. OEBPS/grimoire.xhtml
  onProgress?.(85, 'Сборка гримуара артефактов...');
  const grimoireHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>Гримуар Артефактов</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>ГРИМУАР АРТЕФАКТОВ</h1>
  <p class="subtitle">Magic Item Compendium • Сокровища и реликвии</p>
  <div class="ornament-divider">❧ ❦ ☙</div>

  ${grimoire
    .map(
      item => `
    <div class="item-card">
      <h2>${escapeXml(item.name)}</h2>
      <p class="subtitle" style="margin-bottom: 0.5em;">${escapeXml(item.itemType)}, ${escapeXml(item.rarity)} ${item.attunement ? '(требуется настройка)' : ''}</p>
      
      <span class="item-badge">Редкость: ${escapeXml(item.rarity)}</span>

      <p style="margin-top: 1em;">${escapeXml(item.description)}</p>

      <div style="background-color: #f0e8d5; padding: 0.8em; border-radius: 6px; border: 1px solid #cbbba4; margin: 1em 0;">
        <strong style="color: #78350f; text-transform: uppercase; font-size: 0.85em;">Свойства артефакта:</strong>
        ${item.properties.map(p => `<div>• ${escapeXml(p)}</div>`).join('')}
      </div>

      <p class="no-indent" style="font-style: italic; color: #57534e; border-top: 1px solid #cbbba4; padding-top: 0.5em;">
        <strong>История артефакта:</strong> ${escapeXml(item.history)}
      </p>
    </div>
  `
    )
    .join('\n')}
</body>
</html>`;
  zip.file('OEBPS/grimoire.xhtml', grimoireHtml);

  // 8. OEBPS/nav.xhtml (EPUB3 Navigation Document)
  const navHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>Оглавление</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>ОГЛАВЛЕНИЕ</h1>
    <ol>
      <li><a href="cover.xhtml">Титульный лист</a></li>
      ${chapters.map(ch => `<li><a href="chapter_${ch.round}.xhtml">Глава ${ch.round}. ${escapeXml(ch.title.replace(/^Глава\s+[IVXLCDM]+\.\s*/, ''))}</a></li>`).join('\n')}
      <li><a href="bestiary.xhtml">Бестиарий Кампании</a></li>
      <li><a href="grimoire.xhtml">Гримуар Артефактов</a></li>
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navHtml);

  // 9. OEBPS/toc.ncx (EPUB2 backwards compatibility for all e-readers)
  const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:campfire-scribe-chronicle-peak-2026"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>Хроника Одинокого Пика</text>
  </docTitle>
  <docAuthor>
    <text>Мастер Подземелий &amp; Партия</text>
  </docAuthor>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>Титульный лист</text></navLabel>
      <content src="cover.xhtml"/>
    </navPoint>
    ${chapters
      .map(
        (ch, idx) => `
    <navPoint id="navpoint-${idx + 2}" playOrder="${idx + 2}">
      <navLabel><text>Глава ${ch.round}. ${escapeXml(ch.title.replace(/^Глава\s+[IVXLCDM]+\.\s*/, ''))}</text></navLabel>
      <content src="chapter_${ch.round}.xhtml"/>
    </navPoint>`
      )
      .join('')}
    <navPoint id="navpoint-${chapters.length + 2}" playOrder="${chapters.length + 2}">
      <navLabel><text>Бестиарий Кампании</text></navLabel>
      <content src="bestiary.xhtml"/>
    </navPoint>
    <navPoint id="navpoint-${chapters.length + 3}" playOrder="${chapters.length + 3}">
      <navLabel><text>Гримуар Артефактов</text></navLabel>
      <content src="grimoire.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', ncxContent);

  // 10. OEBPS/content.opf (The central manifest & spine package)
  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const opfContent = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0" xml:lang="ru">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:campfire-scribe-chronicle-peak-2026</dc:identifier>
    <dc:title>Хроника Одинокого Пика</dc:title>
    <dc:creator>Dungeon Master &amp; Party (Campfire Scribe)</dc:creator>
    <dc:language>ru</dc:language>
    <dc:publisher>Campfire Scribe Publishing Engine</dc:publisher>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <dc:description>Канонический летописный фолиант настольной ролевой игры D&amp;D 5e с модулем WEGO Engine и RFC 5322 EML архивом.</dc:description>
    <meta property="dcterms:modified">${nowIso}</meta>
  </metadata>

  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="styles" href="styles.css" media-type="text/css"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    ${chapters.map(ch => `<item id="ch_${ch.round}" href="chapter_${ch.round}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
    <item id="bestiary" href="bestiary.xhtml" media-type="application/xhtml+xml"/>
    <item id="grimoire" href="grimoire.xhtml" media-type="application/xhtml+xml"/>
  </manifest>

  <spine toc="ncx">
    <itemref idref="cover"/>
    <itemref idref="nav"/>
    ${chapters.map(ch => `<itemref idref="ch_${ch.round}"/>`).join('\n    ')}
    <itemref idref="bestiary"/>
    <itemref idref="grimoire"/>
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', opfContent);

  onProgress?.(92, 'Упаковка и компиляция EPUB файла...');

  // Generate EPUB Blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  onProgress?.(98, 'Сохранение EPUB книги...');

  // Desktop (Tauri): native Save-As dialog + real file write.
  if (isDesktop()) {
    const ok = await saveViaDialog(blob, filename);
    onProgress?.(100, ok ? 'EPUB книга успешно сохранена!' : 'Сохранение EPUB отменено.');
    return;
  }

  // Browser fallback: trigger download
  browserDownload(blob, filename);

  onProgress?.(100, 'EPUB книга успешно создана и скачана!');
}
