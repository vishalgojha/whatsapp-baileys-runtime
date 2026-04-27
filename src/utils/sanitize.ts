export function sanitizeForWhatsApp(text: string) {
  return String(text || '')
    .replace(/^\s*#\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_')
    .replace(/~~(.+?)~~/g, '~$1~')
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
