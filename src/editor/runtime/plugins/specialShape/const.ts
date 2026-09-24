export const NAME = 'special-shape'
export const STYLE_CONTROL_KEYS = ['stroke', 'fill', 'strokeWidth', 'dashPattern', 'opacity']

export type SpecialShapeType = 'heart' | 'rose' | 'flower' | 'sun' | 'cloud' | 'lightning' | 'moon' | 'speech' | 'crown' | 'drop' | 'cross' | 'burst' | 'shield' | 'ribbon' | 'sparkle' | 'smile' | 'leaf' | 'flame' | 'tag' | 'bookmark' | 'map-pin'

export const SPECIAL_SHAPES: Array<{ type: SpecialShapeType; label: string; path: string }> = [
  { type: 'heart', label: '心形', path: 'M50 91 C43 84 11 63 11 35 C11 16 34 10 50 29 C66 10 89 16 89 35 C89 63 57 84 50 91 Z' },
  { type: 'flower', label: '花朵', path: 'M50 28 C54 7 73 5 75 25 C91 14 101 31 85 43 C105 49 99 68 79 67 C88 86 69 96 57 78 C48 98 29 90 34 70 C13 76 4 58 23 47 C5 36 17 19 34 30 C33 9 53 7 50 28 Z' },
  { type: 'rose', label: '玫瑰', path: 'M50 15 C61 3 78 13 75 29 C92 30 97 48 83 58 C92 75 74 89 59 80 C50 97 31 88 32 71 C13 70 8 50 23 40 C14 23 32 8 50 15 Z M50 31 C39 24 28 36 35 47 C25 55 35 68 47 62 C54 74 69 66 66 54 C78 47 69 33 57 38 C56 34 53 32 50 31 Z' },
  { type: 'sun', label: '太阳', path: 'M50 5 L58 22 L72 10 L73 29 L92 23 L81 39 L99 47 L80 54 L92 70 L72 66 L70 87 L56 74 L47 95 L40 75 L23 88 L27 67 L7 72 L19 55 L1 47 L20 40 L8 24 L28 29 L30 9 L44 23 Z' },
  { type: 'cloud', label: '云朵', path: 'M25 80 C11 80 5 72 7 62 C9 52 18 47 29 49 C30 31 42 21 57 23 C69 24 77 34 78 47 C90 46 97 54 96 65 C95 75 88 80 76 80 Z' },
  { type: 'lightning', label: '闪电', path: 'M57 4 L19 55 L43 55 L34 96 L82 42 L57 42 Z' },
  { type: 'moon', label: '月亮', path: 'M68 8 C43 18 35 48 48 69 C57 84 73 89 89 86 C76 98 55 101 37 91 C13 78 6 48 20 25 C30 9 50 2 68 8 Z' },
  { type: 'speech', label: '对话气泡', path: 'M12 14 C12 8 18 5 25 5 L75 5 C85 5 91 11 91 20 L91 61 C91 70 84 76 75 76 L45 76 L24 94 L29 76 L24 76 C16 76 9 70 9 61 L9 20 Z' },
  { type: 'crown', label: '皇冠', path: 'M8 25 L31 43 L50 12 L69 43 L92 25 L82 81 L18 81 Z' },
  { type: 'drop', label: '水滴', path: 'M50 5 C50 5 84 46 84 67 C84 86 69 97 50 97 C31 97 16 86 16 67 C16 46 50 5 50 5 Z' },
  { type: 'cross', label: '十字', path: 'M36 6 L64 6 L64 36 L94 36 L94 64 L64 64 L64 94 L36 94 L36 64 L6 64 L6 36 L36 36 Z' },
  { type: 'burst', label: '爆炸框', path: 'M50 4 L59 25 L76 11 L74 33 L96 29 L79 46 L98 57 L75 60 L83 83 L62 72 L52 96 L44 73 L22 88 L28 63 L4 59 L24 45 L7 27 L32 31 L34 8 Z' },
  { type: 'shield', label: '盾牌', path: 'M50 6 L88 20 L85 55 C82 75 68 89 50 96 C32 89 18 75 15 55 L12 20 Z' },
  { type: 'ribbon', label: '丝带', path: 'M14 18 L86 18 L76 49 L91 81 L62 72 L50 94 L38 72 L9 81 L24 49 Z' },
  { type: 'sparkle', label: '闪光', path: 'M50 3 C55 30 67 43 96 50 C67 57 55 70 50 97 C45 70 33 57 4 50 C33 43 45 30 50 3 Z' },
  { type: 'smile', label: '笑脸', path: 'M50 5 C75 5 95 25 95 50 C95 75 75 95 50 95 C25 95 5 75 5 50 C5 25 25 5 50 5 Z M27 39 C27 34 31 30 36 30 C41 30 45 34 45 39 C45 44 41 48 36 48 C31 48 27 44 27 39 Z M55 39 C55 34 59 30 64 30 C69 30 73 34 73 39 C73 44 69 48 64 48 C59 48 55 44 55 39 Z M25 60 C33 80 67 80 75 60 C64 69 36 69 25 60 Z' },
  { type: 'leaf', label: '叶子', path: 'M9 88 C14 37 40 10 91 8 C88 58 62 86 9 88 Z M15 83 C37 61 58 41 84 17 C56 35 35 55 15 83 Z' },
  { type: 'flame', label: '火焰', path: 'M51 4 C59 25 80 31 78 55 C76 47 69 42 62 39 C66 58 55 60 50 75 C46 65 36 58 39 43 C25 54 20 67 26 79 C34 97 64 99 77 84 C93 65 83 37 65 25 C66 36 62 40 58 43 C60 25 55 13 51 4 Z' },
  { type: 'tag', label: '标签', path: 'M8 14 C8 9 12 6 17 6 L56 6 L94 44 L48 90 L8 50 Z M27 20 C21 20 17 24 17 30 C17 36 21 40 27 40 C33 40 37 36 37 30 C37 24 33 20 27 20 Z' },
  { type: 'bookmark', label: '书签', path: 'M23 7 C23 4 26 3 30 3 L70 3 C74 3 77 6 77 10 L77 96 L50 78 L23 96 Z' },
  { type: 'map-pin', label: '定位', path: 'M50 4 C72 4 88 20 88 42 C88 67 62 88 50 98 C38 88 12 67 12 42 C12 20 28 4 50 4 Z M50 24 C40 24 32 32 32 42 C32 52 40 60 50 60 C60 60 68 52 68 42 C68 32 60 24 50 24 Z' },
]
