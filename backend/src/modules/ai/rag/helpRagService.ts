import fs from 'fs';
import path from 'path';

export interface HelpChunk {
  id: string;
  title: string;
  content: string;
  sourceFile: string;
}

let cachedHelpChunks: HelpChunk[] | null = null;

const loadAndChunkHelpDocs = (): HelpChunk[] => {
  if (cachedHelpChunks) {
    return cachedHelpChunks;
  }

  const helpDir = path.join(process.cwd(), 'data', 'help');
  const chunks: HelpChunk[] = [];

  if (!fs.existsSync(helpDir)) {
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

export const searchHelpCenterDocs = (queryStr: string, limit: number = 3): HelpChunk[] => {
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
