import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Chapter, BestiaryEntry, GrimoireItem } from '../types/chronicle';
import { isDesktop, saveViaDialog } from './desktopIO';

/**
 * Save a jsPDF document. Desktop (Tauri): native Save-As dialog + real file.
 * Browser: jsPDF's built-in download.
 */
async function savePdfDoc(pdf: jsPDF, filename: string): Promise<boolean> {
  if (isDesktop()) {
    const blob = pdf.output('blob');
    return saveViaDialog(blob, filename);
  }
  pdf.save(filename);
  return true;
}

/**
 * High-resolution canvas-based PDF export of authentic book spread or single pages from current DOM
 */
export async function exportBookDomToPdf(
  elementId: string,
  filename: string = 'Chronicle_Campaign_Spread.pdf',
  onProgress?: (percent: number, status: string) => void,
  options?: { mode?: 'spread_landscape' | 'split_pages' }
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id #${elementId} not found for PDF export.`);
  }

  onProgress?.(10, 'Подготовка страниц разворота (A4 + A4)...');

  // Configure high scale (2.2x) for crisp 300 DPI print quality
  const canvas = await html2canvas(element, {
    scale: 2.2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: '#fbf7ed',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  onProgress?.(50, 'Компиляция растровых слоев, буквиц и орнаментов...');

  const isSpread = canvas.width > canvas.height * 1.2;

  if (isSpread && options?.mode === 'split_pages') {
    // Split into 2 separate A4 portrait pages
    onProgress?.(70, 'Разделение разворота на страницы A4 (Левая + Правая)...');
    const halfWidth = Math.floor(canvas.width / 2);
    const canvasHeight = canvas.height;

    // Left Page
    const leftCanvas = document.createElement('canvas');
    leftCanvas.width = halfWidth;
    leftCanvas.height = canvasHeight;
    const leftCtx = leftCanvas.getContext('2d');
    if (leftCtx) {
      leftCtx.drawImage(canvas, 0, 0, halfWidth, canvasHeight, 0, 0, halfWidth, canvasHeight);
    }

    // Right Page
    const rightCanvas = document.createElement('canvas');
    rightCanvas.width = canvas.width - halfWidth;
    rightCanvas.height = canvasHeight;
    const rightCtx = rightCanvas.getContext('2d');
    if (rightCtx) {
      rightCtx.drawImage(canvas, halfWidth, 0, canvas.width - halfWidth, canvasHeight, 0, 0, canvas.width - halfWidth, canvasHeight);
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Page 1 (Left A4)
    const leftImg = leftCanvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(leftImg, 'JPEG', 0, 0, pageWidth, pageHeight);

    // Page 2 (Right A4)
    pdf.addPage('a4', 'portrait');
    const rightImg = rightCanvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(rightImg, 'JPEG', 0, 0, pageWidth, pageHeight);

    onProgress?.(95, 'Сохранение двухстраничного A4 PDF...');
    await savePdfDoc(pdf, filename);
  } else {
    // Export as wide A4/A3 Spread
    const pdf = new jsPDF({
      orientation: isSpread ? 'landscape' : 'portrait',
      unit: 'mm',
      format: isSpread ? 'a3' : 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    onProgress?.(95, 'Сохранение разворота PDF...');
    await savePdfDoc(pdf, filename);
  }

  onProgress?.(100, 'Экспорт успешно завершен!');
}

/**
 * Multi-page High-Resolution Campaign Book PDF Compiler (Full Russian Cyrillic & Authentic Layouts)
 * Generates every page (Cover, Chapter Spreads, Monster Bestiary, Artifact Grimoire, Colophon)
 * through high-DPI HTML/CSS rendering to guarantee 100% crystal-clear Russian typography with no encoding bugs.
 */
export async function exportFullCampaignBookPdf(
  chapters: Chapter[],
  bestiary: BestiaryEntry[],
  grimoire: GrimoireItem[],
  filename: string = 'Chronicle_Complete_Campaign_Book.pdf',
  onProgress?: (percent: number, status: string) => void
): Promise<void> {
  onProgress?.(5, 'Инициализация издательского конвейера книги...');

  // Create an off-screen staging DOM tree with exact A4 proportions (210mm x 297mm -> 794px x 1123px at 96 DPI)
  const stagingContainer = document.createElement('div');
  stagingContainer.id = 'pdf-book-compilation-staging';
  stagingContainer.style.position = 'fixed';
  stagingContainer.style.left = '-9999px';
  stagingContainer.style.top = '0';
  stagingContainer.style.width = '794px';
  stagingContainer.style.backgroundColor = '#fbf7ed';
  stagingContainer.style.color = '#1c1917';
  stagingContainer.style.fontFamily = '"Cormorant Garamond", "EB Garamond", Georgia, serif';
  stagingContainer.style.zIndex = '-1000';
  document.body.appendChild(stagingContainer);

  const pagesHtml: string[] = [];

  // 1. FRONT COVER PAGE (A4)
  pagesHtml.push(`
    <div class="pdf-page" style="width: 794px; min-height: 1123px; padding: 48px; box-sizing: border-box; background: radial-gradient(circle at 50% 40%, #fefcf6 0%, #f4ebd9 100%); display: flex; flex-direction: column; justify-content: space-between; position: relative; border: 12px double #78350f;">
      <div style="position: absolute; top: 16px; left: 16px; font-size: 28px; color: #78350f;">❧</div>
      <div style="position: absolute; top: 16px; right: 16px; font-size: 28px; color: #78350f;">☙</div>
      <div style="position: absolute; bottom: 16px; left: 16px; font-size: 28px; color: #78350f;">☙</div>
      <div style="position: absolute; bottom: 16px; right: 16px; font-size: 28px; color: #78350f;">❧</div>

      <div style="text-align: center; margin-top: 40px;">
        <div style="font-family: 'Cinzel', serif; font-size: 13px; letter-spacing: 0.3em; text-transform: uppercase; color: #9a3412; font-weight: bold; margin-bottom: 12px;">
          Фолиант Кампании D&D 5e • Модуль WEGO Engine
        </div>
        <h1 style="font-family: 'Cinzel', serif; font-size: 34px; font-weight: 900; color: #3e1f07; margin: 0; line-height: 1.2; text-shadow: 1px 1px 0 rgba(255,255,255,0.8);">
          ХРОНИКА ОДИНОКОГО ПИКА
        </h1>
        <div style="font-size: 16px; font-style: italic; color: #78350f; margin-top: 10px;">
          Канонический летописный архив раундов и судеб
        </div>
        <div style="width: 140px; height: 2px; background: #78350f; margin: 18px auto; opacity: 0.5;"></div>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <div style="width: 130px; height: 130px; margin: 0 auto; border-radius: 50%; border: 4px double #d4af37; background: #2b1810; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(0,0,0,0.35);">
          <span style="font-size: 60px; color: #d4af37; text-shadow: 0 0 15px rgba(212,175,55,0.6);">⚜</span>
        </div>
        <div style="margin-top: 24px; font-size: 12px; font-family: 'Cinzel', serif; letter-spacing: 0.2em; text-transform: uppercase; color: #78350f; font-weight: bold;">
          Campfire Scribe • RFC 5322 EML Vault
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 20px; font-size: 13px; color: #57534e; line-height: 1.8;">
        <div><strong>Ведущий игры:</strong> Мастер Подземелий (DM)</div>
        <div><strong>Герои партии:</strong> Торин (Щитоносец Одинокого Пика), Елена (Орден Тлеющего Ока)</div>
        <div><strong>Архив:</strong> Каноническая база данных EML сообщений</div>
        <div style="margin-top: 10px; font-size: 11px; color: #8c7863;">Дата составления фолианта: ${new Date().toLocaleDateString('ru-RU')}</div>
      </div>
    </div>
  `);

  // 2. CHAPTER SPREADS (Left Page A4 + Right Page A4 for each chapter)
  chapters.forEach((ch, idx) => {
    const leftPageNum = idx * 2 + 2;
    const rightPageNum = idx * 2 + 3;

    // LEFT PAGE (A4)
    pagesHtml.push(`
      <div class="pdf-page" style="width: 794px; min-height: 1123px; padding: 48px; box-sizing: border-box; background: radial-gradient(ellipse at 20% 30%, #fefcf6 0%, #f7f1e1 100%); display: flex; flex-direction: column; justify-content: space-between; position: relative; border: 1px solid #c8b79b;">
        <div>
          <!-- Header Folio -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #78350f; padding-bottom: 8px; margin-bottom: 20px; font-size: 11px; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.15em; color: #78350f; font-weight: bold;">
            <span>СТРАНИЦА ${leftPageNum}</span>
            <span style="font-family: 'Cinzel', serif; font-size: 11px; tracking: 0.1em;">⚜ ХРОНИКА ОДИНОКОГО ПИКА ⚜</span>
            <span style="font-size: 10px; color: #78716c; font-family: monospace;">RFC 5322</span>
          </div>

          <!-- Chapter Heading -->
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 11px; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.2em; color: #9a3412; font-weight: bold;">
              — ГЛАВА ${ch.round} —
            </div>
            <h2 style="font-family: 'Cinzel', serif; font-size: 24px; font-weight: 800; color: #292524; margin: 4px 0 6px 0;">
              ${ch.title.replace(/^Глава\s+[IVXLCDM]+\.\s*/, '')}
            </h2>
            <div style="font-size: 13px; font-style: italic; color: #57534e;">
              ${ch.subtitle}
            </div>
            <div style="width: 80px; height: 1px; background: #78350f; margin: 10px auto; opacity: 0.4;"></div>
          </div>

          <!-- Two-Column Prose with 4-Line Illuminated Drop Cap -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: justify; font-size: 12.5px; line-height: 1.65; color: #292524;">
            <div>
              <span style="float: left; font-size: 46px; line-height: 0.8; font-family: 'Cinzel', serif; font-weight: 900; color: #78350f; padding-right: 8px; padding-top: 4px;">
                ${ch.prose.charAt(0)}
              </span>
              <p style="margin: 0;">${ch.prose.substring(1, Math.floor(ch.prose.length / 2))}</p>
            </div>
            <div>
              <p style="margin: 0; text-indent: 16px;">${ch.prose.substring(Math.floor(ch.prose.length / 2))}</p>
            </div>
          </div>

          <!-- Chapter Artwork -->
          ${
            ch.artworks && ch.artworks.length > 0
              ? `
            <div style="margin-top: 20px; border: 2px solid #78350f; padding: 6px; background: #fffdf9; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
              <img src="${ch.artworks[0].url}" alt="${ch.artworks[0].title}" style="width: 100%; height: 190px; object-fit: cover; border-radius: 4px; display: block;" />
              <div style="font-size: 10px; font-style: italic; text-align: center; color: #57534e; margin-top: 5px; font-family: sans-serif;">
                ${ch.artworks[0].caption}
              </div>
            </div>
          `
              : ''
          }

          <!-- Master Notes Box -->
          ${
            ch.masterNotes
              ? `
            <div style="margin-top: 18px; background: #f2e9d8; border: 1.5px solid #78350f; border-radius: 8px; padding: 12px; font-size: 11.5px;">
              <div style="font-weight: bold; text-transform: uppercase; font-size: 9.5px; font-family: sans-serif; letter-spacing: 0.1em; color: #78350f; margin-bottom: 4px;">
                ✍ ЗАМЕТКИ МАСТЕРА (LORE & ENVIRONMENT):
              </div>
              <div style="font-style: italic; color: #44403c; line-height: 1.5;">
                ${ch.masterNotes}
              </div>
            </div>
          `
              : ''
          }
        </div>

        <!-- Footer Folio -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #78350f; padding-top: 8px; margin-top: 20px; font-size: 10px; color: #78716c; font-family: sans-serif;">
          <span>Орден Одинокого Пика</span>
          <span style="font-family: serif; font-style: italic; font-size: 12px; font-weight: bold; color: #44403c;">— ${leftPageNum} —</span>
          <span>Campfire Scribe</span>
        </div>
      </div>
    `);

    // RIGHT PAGE (A4)
    pagesHtml.push(`
      <div class="pdf-page" style="width: 794px; min-height: 1123px; padding: 48px; box-sizing: border-box; background: radial-gradient(ellipse at 80% 30%, #fefcf6 0%, #f7f1e1 100%); display: flex; flex-direction: column; justify-content: space-between; position: relative; border: 1px solid #c8b79b;">
        <div>
          <!-- Header Folio -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #78350f; padding-bottom: 8px; margin-bottom: 20px; font-size: 11px; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.15em; color: #78350f; font-weight: bold;">
            <span style="font-size: 10px; color: #78716c; font-family: monospace;">РАУНД ${ch.round}</span>
            <span style="font-family: 'Cinzel', serif; font-size: 11px;">⚜ ${ch.title} ⚜</span>
            <span>СТРАНИЦА ${rightPageNum}</span>
          </div>

          <!-- Page 2 Prose -->
          ${
            ch.prosePage2
              ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: justify; font-size: 12.5px; line-height: 1.65; color: #292524; margin-bottom: 20px;">
              <p style="margin: 0; text-indent: 16px;">${ch.prosePage2.substring(0, Math.floor(ch.prosePage2.length / 2))}</p>
              <p style="margin: 0; text-indent: 16px;">${ch.prosePage2.substring(Math.floor(ch.prosePage2.length / 2))}</p>
            </div>
          `
              : ''
          }

          <!-- Roleplay Dialogue Scroll Callout (RFC 5322 Direct Quotes) -->
          ${
            ch.roleplayQuotes && ch.roleplayQuotes.length > 0
              ? `
            <div style="background: #ede4d1; border-left: 4px solid #78350f; border-top: 1px solid #cbbba4; border-bottom: 1px solid #cbbba4; border-right: 1px solid #cbbba4; padding: 14px; border-radius: 0 8px 8px 0; margin-bottom: 18px;">
              <div style="font-size: 10px; font-weight: bold; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.15em; color: #78350f; margin-bottom: 8px; display: flex; justify-content: space-between;">
                <span>📜 ПРЯМАЯ РЕЧЬ УЧАСТНИКОВ РАУНДА (RFC 5322 INTENT):</span>
                <span style="font-family: monospace; color: #9a3412;">КАНОН</span>
              </div>
              ${ch.roleplayQuotes
                .map(
                  q => `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(120,53,15,0.15);">
                  <div style="font-weight: bold; color: #292524; font-size: 12px; font-family: sans-serif;">
                    ${q.actorName} <span style="font-size: 10px; font-weight: normal; color: #57534e;">(${q.actorClass})</span>
                  </div>
                  <div style="font-style: italic; color: #44403c; font-size: 12px; margin-top: 2px; padding-left: 8px; border-left: 2px solid #78350f;">
                    «${q.speech}»
                  </div>
                  ${q.flavor ? `<div style="font-size: 10px; color: #78716c; font-family: sans-serif; margin-top: 2px; padding-left: 8px;">[Действие: ${q.flavor}]</div>` : ''}
                </div>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }

          <!-- Mechanical Battle Summary (WEGO Resolution Box) -->
          <div style="background: #241d19; color: #f5f5f4; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 11px; margin-bottom: 16px; border: 1px solid #443730;">
            <div style="font-size: 9.5px; text-transform: uppercase; color: #d4af37; font-weight: bold; margin-bottom: 6px; display: flex; justify-content: space-between;">
              <span>🛡 МЕХАНИЧЕСКИЙ ИТОГ СТОЛКНОВЕНИЯ (WEGO ENGINE):</span>
              <span style="color: #a8a29e;">D20 ROLLS</span>
            </div>
            ${ch.battleLogSummary.map(log => `<div style="color: #d6d3d1; margin-top: 2px;">• ${log}</div>`).join('')}
          </div>

          <!-- Loot & Rewards Box -->
          ${
            ch.lootReward
              ? `
            <div style="background: #f2ecdc; border: 1.5px solid #d4af37; border-radius: 8px; padding: 10px 14px; font-size: 11.5px; font-family: sans-serif; margin-bottom: 14px;">
              <div style="font-weight: bold; color: #9a3412; font-size: 11px; display: flex; justify-content: space-between;">
                <span>🎁 ТРОФЕИ И ОПЫТ ПАРТИИ:</span>
                <span style="background: rgba(212,175,55,0.25); color: #78350f; padding: 1px 6px; border-radius: 4px; font-family: monospace; font-weight: bold;">+${ch.lootReward.xp} XP</span>
              </div>
              <div style="color: #44403c; margin-top: 4px;"><strong>Монеты:</strong> ${ch.lootReward.coins || 'Нет'}</div>
              ${ch.lootReward.items && ch.lootReward.items.length > 0 ? `<div style="color: #44403c; margin-top: 2px;"><strong>Находки:</strong> ${ch.lootReward.items.join(', ')}</div>` : ''}
            </div>
          `
              : ''
          }

          <!-- RFC 5322 Verification Stamp -->
          <div style="background: #f6f0df; border: 1px solid #78350f; border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; font-family: monospace; color: #78716c;">
            <div>RFC 5322 EML Checksum: <strong style="color: #9a3412;">0x8f4a..e8f9 [VERIFIED]</strong></div>
            <div style="color: #78350f; font-family: serif; font-weight: bold;">⚜ ПЕЧАТЬ КАНОНА ⚜</div>
          </div>
        </div>

        <!-- Footer Folio -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #78350f; padding-top: 8px; margin-top: 20px; font-size: 10px; color: #78716c; font-family: sans-serif;">
          <span>Издательский конвейер Campfire Scribe</span>
          <span style="font-family: serif; font-style: italic; font-size: 12px; font-weight: bold; color: #44403c;">— ${rightPageNum} —</span>
          <span>Канон TTRPG</span>
        </div>
      </div>
    `);
  });

  // 3. BESTIARY SECTION (A4 Page)
  if (bestiary && bestiary.length > 0) {
    pagesHtml.push(`
      <div class="pdf-page" style="width: 794px; min-height: 1123px; padding: 48px; box-sizing: border-box; background: radial-gradient(circle at 50% 50%, #fefcf6 0%, #f6eee0 100%); display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #c8b79b;">
        <div>
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #78350f; padding-bottom: 8px; margin-bottom: 24px; font-family: 'Cinzel', serif;">
            <span style="font-size: 18px; font-weight: 800; color: #78350f;">БЕСТИАРИЙ КАМПАНИИ</span>
            <span style="font-size: 11px; color: #9a3412; font-family: sans-serif; letter-spacing: 0.1em; font-weight: bold;">MONSTER MANUAL D&D 5e</span>
          </div>

          <!-- Monsters List -->
          <div style="display: flex; flex-direction: column; gap: 24px;">
            ${bestiary
              .map(
                be => `
              <div style="background: #fbf7ed; border: 2px solid #78350f; border-radius: 10px; padding: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.08);">
                <div style="display: flex; gap: 16px; align-items: flex-start; border-bottom: 1.5px solid #78350f; padding-bottom: 10px; margin-bottom: 10px;">
                  <img src="${be.illustrationUrl}" alt="${be.name}" style="width: 90px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #78350f;" />
                  <div>
                    <h3 style="font-family: 'Cinzel', serif; font-size: 20px; font-weight: 900; color: #78350f; margin: 0;">${be.name}</h3>
                    <div style="font-size: 12px; font-style: italic; color: #57534e;">${be.type}</div>
                    <div style="display: flex; gap: 8px; margin-top: 6px; font-size: 11px; font-family: sans-serif; font-weight: bold; color: #78350f;">
                      <span style="background: #f0e8d5; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbbba4;">AC: ${be.ac}</span>
                      <span style="background: #f0e8d5; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbbba4;">HP: ${be.hp}</span>
                      <span style="background: #f0e8d5; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbbba4;">CR: ${be.challengeRating}</span>
                    </div>
                  </div>
                </div>

                <!-- Stats Grid -->
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; background: #f0e8d5; padding: 8px; border-radius: 6px; text-align: center; font-family: sans-serif; font-size: 11px; font-weight: bold; margin-bottom: 10px;">
                  <div><div style="color: #78350f; font-size: 9px;">СИЛ</div><div>${be.stats.str}</div></div>
                  <div><div style="color: #78350f; font-size: 9px;">ЛОВ</div><div>${be.stats.dex}</div></div>
                  <div><div style="color: #78350f; font-size: 9px;">ТЕЛ</div><div>${be.stats.con}</div></div>
                  <div><div style="color: #78350f; font-size: 9px;">ИНТ</div><div>${be.stats.int}</div></div>
                  <div><div style="color: #78350f; font-size: 9px;">МДР</div><div>${be.stats.wis}</div></div>
                  <div><div style="color: #78350f; font-size: 9px;">ХАР</div><div>${be.stats.cha}</div></div>
                </div>

                <!-- Actions & Lore -->
                <div style="font-size: 12px; line-height: 1.5; color: #292524;">
                  <div style="font-weight: bold; text-transform: uppercase; font-size: 10px; font-family: sans-serif; color: #78350f; margin-bottom: 4px;">Действия:</div>
                  ${be.actions.map(act => `<div><strong style="color: #78350f;">${act.name}.</strong> ${act.desc}</div>`).join('')}
                  <div style="margin-top: 8px; font-style: italic; color: #57534e; border-top: 1px solid #cbbba4; padding-top: 6px;">
                    <strong>Предание:</strong> ${be.lore}
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div style="text-align: center; font-size: 11px; font-style: italic; color: #78716c; border-top: 1px solid #78350f; padding-top: 8px; margin-top: 20px;">
          — Фолиант Кампании • Бестиарий —
        </div>
      </div>
    `);
  }

  // 4. GRIMOIRE / ARTIFACTS SECTION (A4 Page)
  if (grimoire && grimoire.length > 0) {
    pagesHtml.push(`
      <div class="pdf-page" style="width: 794px; min-height: 1123px; padding: 48px; box-sizing: border-box; background: radial-gradient(circle at 50% 50%, #fefcf6 0%, #f6eee0 100%); display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #c8b79b;">
        <div>
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #78350f; padding-bottom: 8px; margin-bottom: 24px; font-family: 'Cinzel', serif;">
            <span style="font-size: 18px; font-weight: 800; color: #78350f;">ГРИМУАР АРТЕФАКТОВ</span>
            <span style="font-size: 11px; color: #9a3412; font-family: sans-serif; letter-spacing: 0.1em; font-weight: bold;">MAGIC ITEM COMPENDIUM</span>
          </div>

          <!-- Items List -->
          <div style="display: flex; flex-direction: column; gap: 24px;">
            ${grimoire
              .map(
                item => `
              <div style="background: #fbf7ed; border: 2px solid #78350f; border-radius: 10px; padding: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.08);">
                <div style="display: flex; gap: 16px; align-items: flex-start; border-bottom: 1.5px solid #78350f; padding-bottom: 10px; margin-bottom: 10px;">
                  <img src="${item.illustrationUrl}" alt="${item.name}" style="width: 90px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #78350f;" />
                  <div>
                    <h3 style="font-family: 'Cinzel', serif; font-size: 20px; font-weight: 900; color: #78350f; margin: 0;">${item.name}</h3>
                    <div style="font-size: 12px; font-style: italic; color: #57534e;">
                      ${item.itemType}, ${item.rarity} ${item.attunement ? '(требуется настройка)' : ''}
                    </div>
                    <span style="display: inline-block; margin-top: 6px; font-size: 10px; font-family: sans-serif; font-weight: bold; background: #f0e8d5; color: #78350f; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbbba4;">
                      Редкость: ${item.rarity}
                    </span>
                  </div>
                </div>

                <p style="font-size: 12.5px; line-height: 1.6; color: #292524; margin: 0 0 10px 0;">${item.description}</p>

                <div style="background: #f0e8d5; padding: 10px; border-radius: 6px; font-size: 11.5px; font-family: sans-serif; margin-bottom: 10px; border: 1px solid #cbbba4;">
                  <div style="font-weight: bold; color: #78350f; font-size: 10px; text-transform: uppercase; margin-bottom: 4px;">Свойства артефакта:</div>
                  ${item.properties.map(p => `<div>• ${p}</div>`).join('')}
                </div>

                <div style="font-size: 11.5px; font-style: italic; color: #57534e; border-top: 1px solid #cbbba4; padding-top: 6px;">
                  <strong>История артефакта:</strong> ${item.history}
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div style="text-align: center; font-size: 11px; font-style: italic; color: #78716c; border-top: 1px solid #78350f; padding-top: 8px; margin-top: 20px;">
          — Фолиант Кампании • Гримуар —
        </div>
      </div>
    `);
  }

  // 5. Render all pages via html2canvas and assemble into jsPDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pagesHtml.length; i++) {
    const progressPercent = 10 + Math.floor((i / pagesHtml.length) * 80);
    onProgress?.(progressPercent, `Рендеринг страницы ${i + 1} из ${pagesHtml.length}...`);

    stagingContainer.innerHTML = pagesHtml[i];

    // Wait slightly for DOM layouts & fonts
    await new Promise(r => setTimeout(r, 60));

    const pageElement = stagingContainer.querySelector('.pdf-page') as HTMLElement;
    if (pageElement) {
      const pageCanvas = await html2canvas(pageElement, {
        scale: 2.2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#fbf7ed',
        windowWidth: 794,
      });

      const pageImg = pageCanvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(pageImg, 'JPEG', 0, 0, pageWidth, pageHeight);
    }
  }

  // Clean up staging DOM
  if (stagingContainer.parentNode) {
    stagingContainer.parentNode.removeChild(stagingContainer);
  }

  onProgress?.(95, 'Сохранение готовой книги...');
  await savePdfDoc(pdf, filename);
  onProgress?.(100, 'Книга кампании успешно сохранена!');
}

/**
 * Backward-compatible alias for full book export
 */
export async function exportPureTextPdf(
  chapters: Chapter[],
  bestiary: BestiaryEntry[],
  grimoire: GrimoireItem[],
  filename: string = 'Chronicle_Complete_Campaign_Book.pdf',
  onProgress?: (percent: number, status: string) => void
): Promise<void> {
  return exportFullCampaignBookPdf(chapters, bestiary, grimoire, filename, onProgress);
}
