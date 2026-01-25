import React from 'react';
import { Link } from 'react-router-dom';

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

// Regex to match URLs (including without protocol), @mentions, and #hashtags
const COMBINED_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(www\.[^\s<]+[^<.,:;"')\]\s])|([a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|edu|gov|io|co|nl|de|uk|info|biz|app|dev|ai|tech|me|tv|cc|us|ca|fr|es|it|au|jp|kr|cn|ru|in|br|mx|za|ng|ke|gh|eg|sa)[^\s<]*[^<.,:;"')\]\s])|(@[a-zA-Z0-9_]+)|(#[a-zA-Z0-9_]+)/gi;

export function LinkifiedText({ text, className = "" }: LinkifiedTextProps) {
  if (!text) return null;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  
  let match: RegExpExecArray | null;
  COMBINED_REGEX.lastIndex = 0;

  while ((match = COMBINED_REGEX.exec(text)) !== null) {
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
    } 
    // Check if it's a hashtag
    else if (matchedText.startsWith('#')) {
      const hashtag = matchedText.slice(1);
      elements.push(
        <Link
          key={`hashtag-${match.index}`}
          to={`/zoeken?q=%23${hashtag}`}
          className="text-primary font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {matchedText}
        </Link>
      );
    } 
    // It's a URL
    else {
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

// Helper function to extract #hashtags from text
export function extractHashtags(text: string): string[] {
  const hashtags: string[] = [];
  let match: RegExpExecArray | null;
  const regex = /#([a-zA-Z0-9_]+)/g;
  
  while ((match = regex.exec(text)) !== null) {
    hashtags.push(match[1]);
  }
  
  return [...new Set(hashtags)]; // Remove duplicates
}
