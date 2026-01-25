import React from 'react';
import { Link } from 'react-router-dom';

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

// Regex to match URLs and @mentions
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(?:www\.[^\s<]+[^<.,:;"')\]\s])/gi;
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

export function LinkifiedText({ text, className = "" }: LinkifiedTextProps) {
  if (!text) return null;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // Combined regex for both URLs and mentions
  const combinedRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(www\.[^\s<]+[^<.,:;"')\]\s])|(@[a-zA-Z0-9_]+)/gi;
  
  let match: RegExpExecArray | null;
  combinedRegex.lastIndex = 0;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      elements.push(
        <span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    const matchedText = match[0];
    
    // Check if it's a mention
    if (matchedText.startsWith('@')) {
      const username = matchedText.slice(1);
      elements.push(
        <Link
          key={`mention-${match.index}`}
          to={`/profiel/${username}`}
          className="text-primary font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {matchedText}
        </Link>
      );
    } else {
      // It's a URL
      const href = matchedText.startsWith('http') ? matchedText : `https://${matchedText}`;
      elements.push(
        <a
          key={`link-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:opacity-80 transition-opacity break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {matchedText}
        </a>
      );
    }

    lastIndex = match.index + matchedText.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <span className={className}>{elements.length > 0 ? elements : text}</span>;
}

// Helper function to extract @mentions from text
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  const regex = /@([a-zA-Z0-9_]+)/g;
  
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)]; // Remove duplicates
}
