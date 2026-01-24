import React from 'react';

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

// Regex to match URLs
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(?:www\.[^\s<]+[^<.,:;"')\]\s])/gi;

export function LinkifiedText({ text, className = "" }: LinkifiedTextProps) {
  if (!text) return null;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      elements.push(
        <span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    // Add the link
    const url = match[0];
    const href = url.startsWith('http') ? url : `https://${url}`;
    elements.push(
      <a
        key={`link-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:opacity-80 transition-opacity break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );

    lastIndex = match.index + url.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <span className={className}>{elements.length > 0 ? elements : text}</span>;
}
