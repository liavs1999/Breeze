import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remend from 'remend';

/**
 * Markdown for answers. While text streams in, `remend` closes half-written syntax (an open "**",
 * a link without its ")") so the text never flickers between raw and formatted. Finished paragraphs
 * are memoized blocks, so only the last block re-renders as tokens arrive.
 */
export function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = useMemo(() => splitBlocks(streaming ? remend(text) : text), [text, streaming]);
  return (
    <div className="answer">
      {blocks.map((b, i) => (
        <Block key={i} text={b} />
      ))}
    </div>
  );
}

const Block = memo(function Block({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}
    >
      {text}
    </ReactMarkdown>
  );
});

/** Splits on blank lines outside code fences; lists stay together because their items are not blank-separated. */
function splitBlocks(text: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (!inFence && line.trim() === '' && current.length) {
      out.push(current.join('\n'));
      current = [];
    } else current.push(line);
  }
  if (current.length) out.push(current.join('\n'));
  return out;
}
