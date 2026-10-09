import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { combineLessonSource, extractSourceText } from "../lib/source-text";

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return crc ^ -1;
}

function zipStored(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const compressed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralStart = offset;
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

function tinyPdf(text: string) {
  const stream = `BT /F1 18 Tf 36 100 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++)
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body);
}

const docx = zipStored({
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body>
</w:document>`,
});

describe("lesson source files", () => {
  it("combines files in order and then additional text", () => {
    expect(combineLessonSource(["From the file", "Second file"], "Typed alongside")).toBe(
      "From the file\n\nSecond file\n\nTyped alongside",
    );
    expect(combineLessonSource(["Only file"], "")).toBe("Only file");
    expect(combineLessonSource([], "Only typed")).toBe("Only typed");
  });

  it("reads text, pdf, and docx, and names a file that cannot be read", async () => {
    expect(await extractSourceText("notes.txt", Buffer.from("From the file"))).toBe(
      "From the file",
    );
    expect(await extractSourceText("notes.docx", docx)).toContain("Hello DOCX");
    expect(await extractSourceText("notes.pdf", tinyPdf("Hello PDF"))).toContain(
      "Hello PDF",
    );
    await expect(
      extractSourceText("broken.pdf", Buffer.from("not a pdf")),
    ).rejects.toThrow("Could not read broken.pdf.");
    await expect(extractSourceText("scan.pdf", tinyPdf(""))).rejects.toThrow(
      "scan.pdf looks like a scan with no selectable text and cannot be used.",
    );
    await expect(extractSourceText("spaces.pdf", tinyPdf("   "))).rejects.toThrow(
      "spaces.pdf looks like a scan with no selectable text and cannot be used.",
    );
    await expect(
      extractSourceText("notes.txt", Buffer.from(" \n\t ")),
    ).rejects.toThrow("Could not read notes.txt.");
    await expect(
      extractSourceText("notes.md", Buffer.from("   ")),
    ).rejects.toThrow("Could not read notes.md.");
    await expect(
      extractSourceText("notes.docx", Buffer.from("   ")),
    ).rejects.toThrow("Could not read notes.docx.");
  });
});
