import React from 'react';

interface MessageFormatterProps {
  content: string;
  className?: string;
}

export function MessageFormatter({ content, className = '' }: MessageFormatterProps) {
  // Function to parse and format the message content
  const formatContent = (text: string) => {
    // Split content into lines
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // Skip empty lines but add spacing
      if (!trimmedLine) {
        elements.push(<div key={`empty-${index}`} className="h-2" />);
        return;
      }

      // Handle bullet points (- **Item** format)
      if (trimmedLine.match(/^[\-\•]\s*\*\*(.+?)\*\*(.*)$/)) {
        const match = trimmedLine.match(/^[\-\•]\s*\*\*(.+?)\*\*(.*)$/);
        if (match) {
          const [, boldText, restText] = match;
          elements.push(
            <div key={index} className="flex items-start gap-2 mb-1">
              <span className="text-green-600 font-bold mt-1">•</span>
              <div className="flex-1">
                <span className="font-bold text-green-800">{boldText}</span>
                {restText && <span className="text-green-700">{restText}</span>}
              </div>
            </div>
          );
        }
        return;
      }

      // Handle simple bullet points (- Item format)
      if (trimmedLine.match(/^[\-\•]\s*(.+)$/)) {
        const match = trimmedLine.match(/^[\-\•]\s*(.+)$/);
        if (match) {
          const [, itemText] = match;
          // Check if the item has bold formatting
          const formattedText = formatInlineMarkdown(itemText);
          elements.push(
            <div key={index} className="flex items-start gap-2 mb-1">
              <span className="text-green-600 font-bold mt-1">•</span>
              <div className="flex-1 text-green-700">{formattedText}</div>
            </div>
          );
        }
        return;
      }

      // Handle headers (** text ** at start of line)
      if (trimmedLine.match(/^\*\*(.+?)\*\*:?\s*$/)) {
        const match = trimmedLine.match(/^\*\*(.+?)\*\*:?\s*$/);
        if (match) {
          const [, headerText] = match;
          elements.push(
            <div key={index} className="font-bold text-green-800 text-lg mb-2 mt-3">
              {headerText}
            </div>
          );
        }
        return;
      }

      // Handle emoji headers (🌍 **text**)
      if (trimmedLine.match(/^(🌍|🐾|❌|✅|📍|🦋|🔍)\s*\*\*(.+?)\*\*/)) {
        const match = trimmedLine.match(/^(🌍|🐾|❌|✅|📍|🦋|🔍)\s*\*\*(.+?)\*\*/);
        if (match) {
          const [, emoji, headerText] = match;
          const restOfLine = trimmedLine.replace(/^(🌍|🐾|❌|✅|📍|🦋|🔍)\s*\*\*(.+?)\*\*/, '').trim();
          elements.push(
            <div key={index} className="font-bold text-green-800 text-lg mb-2 mt-3">
              <span className="mr-2">{emoji}</span>
              {headerText}
              {restOfLine && <span className="font-normal text-green-700 ml-2">{restOfLine}</span>}
            </div>
          );
        }
        return;
      }

      // Handle regular lines with potential inline formatting
      const formattedText = formatInlineMarkdown(trimmedLine);
      elements.push(
        <div key={index} className="mb-1 text-green-700">
          {formattedText}
        </div>
      );
    });

    return elements;
  };

  // Function to handle inline markdown formatting within text
  const formatInlineMarkdown = (text: string): React.ReactNode => {
    // First handle **bold** text, then links
    const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/);

    return parts.map((part, index) => {
      // Handle bold text
      if (part.match(/^\*\*(.+)\*\*$/)) {
        const match = part.match(/^\*\*(.+)\*\*$/);
        if (match) {
          return <span key={index} className="font-bold text-green-800">{match[1]}</span>;
        }
      }

      // Handle URLs
      if (part.match(/^https?:\/\/[^\s]+$/)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline hover:no-underline transition-colors duration-200"
          >
            {part}
          </a>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={`${className}`}>
      {formatContent(content)}
    </div>
  );
}