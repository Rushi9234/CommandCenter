import React from 'react';

interface SafeMarkdownProps {
  text: string;
  className?: string;
}

export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Clean raw escaped markdown like \*\* or \\*
  const cleanText = text.replace(/\\(\*|_|#|-)/g, '$1');
  const lines = cleanText.split('\n');
  const elements: React.ReactNode[] = [];

  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = (keyPrefix: number) => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`ul-${keyPrefix}`} className="list-disc list-inside space-y-1 my-1.5 pl-1">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="text-slate-800 leading-relaxed font-normal">{item}</li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${keyPrefix}`} className="list-decimal list-inside space-y-1 my-1.5 pl-1">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="text-slate-800 leading-relaxed font-normal">{item}</li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  const renderFormattedInline = (line: string): React.ReactNode => {
    // Matches **bold**, __bold__, or `code`
    const parts = line.split(/(\*\*.*?\*\*|__.*?__|`.*?`)/g);
    return parts.map((part, idx) => {
      if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
        return (
          <strong key={idx} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="bg-slate-100 px-1 py-0.5 rounded text-xs text-indigo-700 font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(index);
      return;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      flushList(index);
      elements.push(
        <h3 key={index} className="font-bold text-base text-slate-900 mt-2 mb-1 tracking-tight">
          {renderFormattedInline(trimmed.slice(2))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList(index);
      elements.push(
        <h4 key={index} className="font-bold text-sm text-slate-900 mt-2 mb-1 tracking-tight">
          {renderFormattedInline(trimmed.slice(3))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList(index);
      elements.push(
        <h5 key={index} className="font-bold text-xs text-slate-900 mt-1.5 mb-1 tracking-tight">
          {renderFormattedInline(trimmed.slice(4))}
        </h5>
      );
      return;
    }

    // Bullets (•, -, *)
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = renderFormattedInline(trimmed.slice(2));
      if (!currentList || currentList.type !== 'ul') {
        flushList(index);
        currentList = { type: 'ul', items: [content] };
      } else {
        currentList.items.push(content);
      }
      return;
    }

    // Numbered steps (1., 2.)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      const content = renderFormattedInline(numMatch[2]);
      if (!currentList || currentList.type !== 'ol') {
        flushList(index);
        currentList = { type: 'ol', items: [content] };
      } else {
        currentList.items.push(content);
      }
      return;
    }

    // Normal paragraph line
    flushList(index);
    elements.push(
      <p key={index} className="my-1 leading-relaxed">
        {renderFormattedInline(trimmed)}
      </p>
    );
  });

  flushList(lines.length);

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};

export default SafeMarkdown;
