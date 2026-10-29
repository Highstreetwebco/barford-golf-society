import { MENU } from './meal-menu.mjs';

// A small, dependency-free Open XML workbook writer. Strings are inline strings,
// never formulas; names beginning with =, +, - or @ remain harmless text.
const encoder = new TextEncoder();
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function sheet(rows, widths) {
  return declaration + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
    widths.map((width, i) => `<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('') + '</cols><sheetData>' +
    rows.map((row, i) => `<row r="${i+1}" ht="${i === 0 ? 28 : 34}" customHeight="1">` + row.map((value, j) => {
      const attr = `r="${String.fromCharCode(65+j)}${i+1}" s="${i === 0 ? 1 : 0}"`;
      return typeof value === 'number' ? `<c ${attr}><v>${value}</v></c>` : `<c ${attr} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('') + '</row>').join('') + `</sheetData><autoFilter ref="A1:${String.fromCharCode(64+widths.length)}${rows.length}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
function zip(files) {
  const chunks = [], entries = []; let size = 0;
  const add = bytes => { chunks.push(bytes); size += bytes.length; };
  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(content), crc = crc32(data), offset = size;
    const header = new Uint8Array(30), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, filename.length, true);
    add(header); add(filename); add(data); entries.push({ filename, data, crc, offset });
  }
  const start = size;
  for (const { filename, data, crc, offset } of entries) {
    const header = new Uint8Array(46), view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x800, true);
    view.setUint16(14, 33, true); view.setUint32(16, crc, true); view.setUint32(20, data.length, true); view.setUint32(24, data.length, true); view.setUint16(28, filename.length, true); view.setUint32(42, offset, true);
    add(header); add(filename);
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true); view.setUint32(12, size - start, true); view.setUint32(16, start, true); add(end);
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export function createMealWorkbook(people, exportedAt) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' });
  const formattedTime = value => value && !Number.isNaN(Date.parse(value)) ? time.format(new Date(value)) : '';
  const rows = [...people].sort((a,b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }));
  const orders = [['Name', 'Food choice', 'Side / accompaniment', 'Status', 'Last saved (UK time)'], ...rows.map(row => [row.name, row.meal, row.side, row.status, formattedTime(row.updated_at)])];
  const totals = [['Food choice', 'Side / accompaniment', 'Quantity']];
  for (const item of MENU) {
    for (const side of item.sides ? Object.values(item.sides) : [item.side])
      totals.push([item.name, side, rows.filter(row => row.status === 'Selected' && row.meal === item.name && row.side === side).length]);
  }
  totals.push(['Not yet selected', '', rows.filter(row => row.status !== 'Selected').length]);
  totals.push(['Total attendees', '', rows.length]);
  totals.push(['Exported (UK time)', formattedTime(exportedAt), '']);
  return zip({
    '[Content_Types].xml': declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': declaration + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Food choices" sheetId="1" r:id="rId1"/><sheet name="Kitchen totals" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': declaration + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF184C3A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': sheet(orders, [30, 34, 28, 22, 25]),
    'xl/worksheets/sheet2.xml': sheet(totals, [34, 28, 14])
  });
}
