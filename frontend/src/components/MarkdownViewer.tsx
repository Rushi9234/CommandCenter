import React from 'react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

/**
  * Formats inline Markdown styles: **bold**, *italic*, `code`, and [links](url).
  * Safely returns React JSX elements without using dangerouslySetInnerHTML.
  */
export function formatInlineMarkdown(text: string): React.ReactNode[] {
  // Regex splitting by code tokens, bold, italic, and links
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Inline Code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="bg-slate-100 text-slate-800 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-200">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold Text: **bold**
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic Text: *italic* or _italic_
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    ) {
      return (
        <em key={idx} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Markdown Link: [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      const isExternal = url.startsWith('http') || url.startsWith('https');
      return (
        <a
          key={idx}
          href={url}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors"
        >
          {label}
        </a>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

export default function MarkdownViewer({ content, className = '' }: MarkdownViewerProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Code block start / end (```)
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(
          <div key={`codeblock-${index}`} className="my-4 bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto shadow-inner">
            {codeBlockLang && <div className="text-slate-400 text-[10px] uppercase font-semibold mb-2 border-b border-slate-700 pb-1">{codeBlockLang}</div>}
            <pre className="whitespace-pre">{codeBlockLines.join('\n')}</pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        inCodeBlock = true;
        codeBlockLang = trimmed.replace(/^```/, '').trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${index}`} className="text-2xl font-extrabold text-slate-900 border-b border-slate-200 pb-2 mt-6 mb-3 tracking-tight">
          {formatInlineMarkdown(trimmed.replace(/^#\s*/, ''))}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${index}`} className="text-xl font-bold text-slate-900 mt-6 mb-3 tracking-tight border-b border-slate-100 pb-1">
          {formatInlineMarkdown(trimmed.replace(/^##\s*/, ''))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${index}`} className="text-base font-semibold text-slate-900 mt-4 mb-2">
          {formatInlineMarkdown(trimmed.replace(/^###\s*/, ''))}
        </h3>
      );
      return;
    }

    // Horizontal Separator
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      blocks.push(<hr key={`hr-${index}`} className="my-6 border-slate-200" />);
      return;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      blocks.push(
        <blockquote key={`quote-${index}`} className="border-l-4 border-blue-500 bg-blue-50/50 text-slate-700 pl-4 py-2 my-3 text-xs italic rounded-r-lg">
          {formatInlineMarkdown(trimmed.replace(/^>\s*/, ''))}
        </blockquote>
      );
      return;
    }

    // Unordered List (- item or * item)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(
        <li key={`ul-${index}`} className="ml-6 list-disc text-slate-700 my-1 text-sm leading-relaxed">
          {formatInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
        </li>
      );
      return;
    }

    // Ordered List (1. item)
    const listMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (listMatch) {
      const [, num, text] = listMatch;
      blocks.push(
        <li key={`ol-${index}`} value={parseInt(num, 10)} className="ml-6 list-decimal text-slate-700 my-1 text-sm leading-relaxed">
          {formatInlineMarkdown(text)}
        </li>
      );
      return;
    }

    // Empty Lines
    if (!trimmed) {
      blocks.push(<div key={`empty-${index}`} className="h-2"></div>);
      return;
    }

    // Regular Paragraph
    blocks.push(
      <p key={`p-${index}`} className="text-slate-700 my-2 text-sm leading-relaxed">
        {formatInlineMarkdown(trimmed)}
      </p>
    );
  });

  return <div className={`prose max-w-none space-y-1 ${className}`}>{blocks}</div>;
}
