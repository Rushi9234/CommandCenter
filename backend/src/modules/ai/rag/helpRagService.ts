import fs from 'fs';
import path from 'path';

export interface HelpChunk {
  id: string;
  title: string;
  content: string;
  sourceFile: string;
}

export interface HelpDoc {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  sourceFile: string;
  summary: string;
}

let cachedHelpChunks: HelpChunk[] | null = null;
let cachedHelpDocs: HelpDoc[] | null = null;

const getHelpDir = (): string | null => {
  const candidates = [
    path.join(process.cwd(), 'backend', 'data', 'help'),
    path.join(process.cwd(), 'data', 'help'),
    path.join(__dirname, '..', '..', '..', '..', 'data', 'help'),
    path.join(__dirname, '..', '..', '..', '..', 'backend', 'data', 'help'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }
  return null;
};

const loadAndChunkHelpDocs = (): HelpChunk[] => {
  if (cachedHelpChunks) {
    return cachedHelpChunks;
  }

  const helpDir = getHelpDir();
  const chunks: HelpChunk[] = [];

  if (!helpDir) {
    return [];
  }

  const files = fs.readdirSync(helpDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(helpDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const sections = content.split(/\n(?=##\s)/);
    const docTitle = content.split('\n')[0].replace(/^#\s*/, '').trim();

    sections.forEach((sec, idx) => {
      const trimmed = sec.trim();
      if (trimmed.length > 0) {
        chunks.push({
          id: `${file}-${idx}`,
          title: docTitle,
          content: trimmed,
          sourceFile: file,
        });
      }
    });
  }

  cachedHelpChunks = chunks;
  return chunks;
};

export const getHelpDocsList = (): HelpDoc[] => {
  if (cachedHelpDocs) {
    return cachedHelpDocs;
  }

  const helpDir = getHelpDir();
  if (!helpDir) return [];

  const files = fs.readdirSync(helpDir).filter((f) => f.endsWith('.md'));
  const docs: HelpDoc[] = [];

  for (const file of files) {
    const filePath = path.join(helpDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const docTitle = lines[0]?.replace(/^#\s*/, '').trim() || file;
    const slug = file.replace(/\.md$/, '');

    const summaryLine = lines.find((l) => l.trim().length > 0 && !l.startsWith('#')) || '';

    let category = 'General';
    if (file.includes('task')) category = 'Work & Tasks';
    if (file.includes('team')) category = 'Teams & Roles';

    docs.push({
      id: slug,
      slug,
      title: docTitle,
      category,
      content,
      sourceFile: file,
      summary: summaryLine.trim(),
    });
  }

  cachedHelpDocs = docs;
  return docs;
};

export const searchHelpCenterDocs = (queryStr: string, limit: number = 5): HelpChunk[] => {
  const chunks = loadAndChunkHelpDocs();
  if (!queryStr || queryStr.trim().length === 0) {
    return chunks.slice(0, limit);
  }

  const terms = queryStr.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const scored = chunks.map((chunk) => {
    const text = (chunk.title + ' ' + chunk.content).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) {
        score += 1;
      }
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).map((s) => s.chunk).slice(0, limit);
};
