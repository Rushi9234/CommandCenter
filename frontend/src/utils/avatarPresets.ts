export interface AvatarPreset {
  id: string;
  name: string;
  category: 'people' | 'animals' | 'simple';
  svgDataUri: string;
}

const createSvgDataUri = (content: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(content.trim())}`;

export const AVATAR_PRESETS: AvatarPreset[] = [
  // PEOPLE
  {
    id: 'people-alex',
    name: 'Alex (Tech)',
    category: 'people',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-alex" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2563EB" />
            <stop offset="100%" stop-color="#1E40AF" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-alex)" />
        <circle cx="50" cy="38" r="20" fill="#FCE7F3" />
        <path d="M50 18 C38 18 32 26 32 34 C35 34 38 31 42 31 C46 31 46 26 50 26 C54 26 54 31 58 31 C62 31 65 34 68 34 C68 26 62 18 50 18 Z" fill="#1F2937" />
        <rect x="36" y="34" width="10" height="7" rx="2" fill="none" stroke="#1E293B" stroke-width="2" />
        <rect x="54" y="34" width="10" height="7" rx="2" fill="none" stroke="#1E293B" stroke-width="2" />
        <line x1="46" y1="37.5" x2="54" y2="37.5" stroke="#1E293B" stroke-width="2" />
        <path d="M43 48 Q50 54 57 48" fill="none" stroke="#9D174D" stroke-width="2" stroke-linecap="round" />
        <path d="M22 88 C22 68 32 60 50 60 C68 60 78 68 78 88 Z" fill="#3B82F6" />
        <path d="M42 60 L50 72 L58 60 Z" fill="#FFFFFF" opacity="0.8" />
      </svg>
    `),
  },
  {
    id: 'people-maya',
    name: 'Maya (Design)',
    category: 'people',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-maya" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7C3AED" />
            <stop offset="100%" stop-color="#4C1D95" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-maya)" />
        <path d="M26 40 C26 22 36 14 50 14 C64 14 74 22 74 40 C74 54 70 60 70 60 L30 60 C30 60 26 54 26 40 Z" fill="#312E81" />
        <circle cx="50" cy="40" r="19" fill="#FEF3C7" />
        <path d="M32 30 C40 22 60 22 68 30 C60 26 40 26 32 30 Z" fill="#1E1B4B" />
        <circle cx="43" cy="38" r="2.5" fill="#1E1B4B" />
        <circle cx="57" cy="38" r="2.5" fill="#1E1B4B" />
        <path d="M44 48 Q50 53 56 48" fill="none" stroke="#B45309" stroke-width="2" stroke-linecap="round" />
        <path d="M20 90 C20 70 32 62 50 62 C68 62 80 70 80 90 Z" fill="#A855F7" />
        <circle cx="50" cy="74" r="4" fill="#F43F5E" />
      </svg>
    `),
  },
  {
    id: 'people-sam',
    name: 'Sam (Lead)',
    category: 'people',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-sam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#059669" />
            <stop offset="100%" stop-color="#064E3B" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-sam)" />
        <circle cx="50" cy="40" r="19" fill="#FFEDD5" />
        <path d="M30 22 C35 14 65 14 70 22 C72 26 72 32 72 32 L28 32 C28 32 28 26 30 22 Z" fill="#047857" />
        <path d="M34 45 C34 54 40 58 50 58 C60 58 66 54 66 45 C66 48 60 54 50 54 C40 54 34 48 34 45 Z" fill="#7C2D12" />
        <circle cx="43" cy="39" r="2" fill="#1C1917" />
        <circle cx="57" cy="39" r="2" fill="#1C1917" />
        <path d="M22 90 C22 72 32 64 50 64 C68 64 78 72 78 90 Z" fill="#10B981" />
      </svg>
    `),
  },
  {
    id: 'people-chloe',
    name: 'Chloe (Product)',
    category: 'people',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-chloe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#E11D48" />
            <stop offset="100%" stop-color="#881337" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-chloe)" />
        <circle cx="50" cy="39" r="19" fill="#FED7AA" />
        <path d="M30 32 C30 20 40 16 50 16 C60 16 70 20 70 32 C65 24 35 24 30 32 Z" fill="#451A03" />
        <circle cx="43" cy="37" r="2.5" fill="#451A03" />
        <circle cx="57" cy="37" r="2.5" fill="#451A03" />
        <path d="M44 46 Q50 51 56 46" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round" />
        <path d="M22 90 C22 70 32 62 50 62 C68 62 78 70 78 90 Z" fill="#FB7185" />
      </svg>
    `),
  },

  // ANIMALS
  {
    id: 'animal-cat',
    name: 'Cool Cat',
    category: 'animals',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-cat" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0D9488" />
            <stop offset="100%" stop-color="#115E59" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-cat)" />
        <!-- Ears -->
        <polygon points="26,45 34,18 48,36" fill="#F97316" />
        <polygon points="30,42 36,24 45,36" fill="#FDE047" />
        <polygon points="74,45 66,18 52,36" fill="#F97316" />
        <polygon points="70,42 64,24 55,36" fill="#FDE047" />
        <!-- Head -->
        <circle cx="50" cy="52" r="26" fill="#FB923C" />
        <!-- Glasses -->
        <rect x="30" y="44" width="16" height="12" rx="4" fill="#1E293B" />
        <rect x="54" y="44" width="16" height="12" rx="4" fill="#1E293B" />
        <line x1="46" y1="50" x2="54" y2="50" stroke="#1E293B" stroke-width="3" />
        <!-- Nose & Mouth -->
        <polygon points="47,62 53,62 50,66" fill="#78350F" />
        <path d="M44 69 Q50 73 56 69" fill="none" stroke="#78350F" stroke-width="2" stroke-linecap="round" />
        <!-- Whiskers -->
        <line x1="22" y1="58" x2="34" y2="60" stroke="#FFFFFF" stroke-width="2" opacity="0.8" />
        <line x1="20" y1="65" x2="34" y2="64" stroke="#FFFFFF" stroke-width="2" opacity="0.8" />
        <line x1="78" y1="58" x2="66" y2="60" stroke="#FFFFFF" stroke-width="2" opacity="0.8" />
        <line x1="80" y1="65" x2="66" y2="64" stroke="#FFFFFF" stroke-width="2" opacity="0.8" />
      </svg>
    `),
  },
  {
    id: 'animal-dog',
    name: 'Happy Dog',
    category: 'animals',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-dog" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#EA580C" />
            <stop offset="100%" stop-color="#9A3412" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-dog)" />
        <!-- Ears -->
        <ellipse cx="25" cy="48" rx="10" ry="22" fill="#78350F" transform="rotate(15 25 48)" />
        <ellipse cx="75" cy="48" rx="10" ry="22" fill="#78350F" transform="rotate(-15 75 48)" />
        <!-- Head -->
        <circle cx="50" cy="50" r="26" fill="#FDBA74" />
        <ellipse cx="50" cy="62" rx="16" ry="12" fill="#FED7AA" />
        <!-- Eyes -->
        <circle cx="40" cy="44" r="3.5" fill="#1C1917" />
        <circle cx="60" cy="44" r="3.5" fill="#1C1917" />
        <!-- Nose & Tongue -->
        <ellipse cx="50" cy="56" rx="6" ry="4.5" fill="#1C1917" />
        <path d="M47 64 Q50 76 53 64" fill="#F43F5E" />
      </svg>
    `),
  },
  {
    id: 'animal-fox',
    name: 'Swift Fox',
    category: 'animals',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-fox" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#D97706" />
            <stop offset="100%" stop-color="#78350F" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-fox)" />
        <polygon points="24,42 36,15 50,38" fill="#C2410C" />
        <polygon points="76,42 64,15 50,38" fill="#C2410C" />
        <polygon points="30,40 37,22 46,38" fill="#FEF3C7" />
        <polygon points="70,40 63,22 54,38" fill="#FEF3C7" />
        <path d="M22 45 L78 45 L50 82 Z" fill="#F97316" />
        <path d="M34 45 L66 45 L50 82 Z" fill="#FFFFFF" />
        <circle cx="38" cy="48" r="3" fill="#1C1917" />
        <circle cx="62" cy="48" r="3" fill="#1C1917" />
        <circle cx="50" cy="78" r="4" fill="#1C1917" />
      </svg>
    `),
  },
  {
    id: 'animal-panda',
    name: 'Chill Panda',
    category: 'animals',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-panda" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10B981" />
            <stop offset="100%" stop-color="#064E3B" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-panda)" />
        <circle cx="28" cy="28" r="11" fill="#18181B" />
        <circle cx="72" cy="28" r="11" fill="#18181B" />
        <circle cx="50" cy="52" r="27" fill="#FFFFFF" />
        <ellipse cx="38" cy="48" rx="8" ry="10" fill="#18181B" transform="rotate(-15 38 48)" />
        <ellipse cx="62" cy="48" rx="8" ry="10" fill="#18181B" transform="rotate(15 62 48)" />
        <circle cx="39" cy="47" r="2.5" fill="#FFFFFF" />
        <circle cx="61" cy="47" r="2.5" fill="#FFFFFF" />
        <ellipse cx="50" cy="58" rx="5" ry="3.5" fill="#18181B" />
        <path d="M45 64 Q50 68 55 64" fill="none" stroke="#18181B" stroke-width="2" stroke-linecap="round" />
      </svg>
    `),
  },

  // SIMPLE / ICONS
  {
    id: 'simple-rocket',
    name: 'Command Rocket',
    category: 'simple',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-rocket" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0F172A" />
            <stop offset="100%" stop-color="#1E293B" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-rocket)" />
        <circle cx="30" cy="25" r="1" fill="#FFFFFF" opacity="0.8" />
        <circle cx="75" cy="35" r="1.5" fill="#FFFFFF" opacity="0.9" />
        <circle cx="20" cy="70" r="1.2" fill="#FFFFFF" opacity="0.7" />
        <!-- Rocket Body -->
        <path d="M50 18 C65 35 65 62 65 65 L35 65 C35 62 35 35 50 18 Z" fill="#38BDF8" />
        <!-- Window -->
        <circle cx="50" cy="42" r="7" fill="#0284C7" stroke="#E0F2FE" stroke-width="2" />
        <!-- Fins -->
        <path d="M35 52 L22 68 L35 65 Z" fill="#0284C7" />
        <path d="M65 52 L78 68 L65 65 Z" fill="#0284C7" />
        <!-- Flame -->
        <polygon points="42,65 50,84 58,65" fill="#F97316" />
        <polygon points="45,65 50,76 55,65" fill="#FDE047" />
      </svg>
    `),
  },
  {
    id: 'simple-diamond',
    name: 'Gemstone',
    category: 'simple',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4C1D95" />
            <stop offset="100%" stop-color="#2E1065" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-diamond)" />
        <polygon points="30,32 70,32 85,50 50,82 15,50" fill="#06B6D4" opacity="0.9" />
        <polygon points="30,32 50,32 42,50 15,50" fill="#22D3EE" />
        <polygon points="50,32 70,32 85,50 58,50" fill="#67E8F9" />
        <polygon points="50,32 42,50 58,50" fill="#CFFAFE" />
        <polygon points="42,50 58,50 50,82" fill="#0891B2" />
        <polygon points="15,50 42,50 50,82" fill="#155E75" />
        <polygon points="85,50 58,50 50,82" fill="#0E7490" />
      </svg>
    `),
  },
  {
    id: 'simple-bolt',
    name: 'Power Bolt',
    category: 'simple',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-bolt" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#18181B" />
            <stop offset="100%" stop-color="#09090B" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-bolt)" />
        <polygon points="54,14 26,52 48,52 42,86 74,44 52,44" fill="#FACC15" />
        <polygon points="54,14 44,52 48,52 42,86 74,44 52,44" fill="#FEF08A" opacity="0.8" />
      </svg>
    `),
  },
  {
    id: 'simple-robot',
    name: 'AI Agent',
    category: 'simple',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg-robot" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284C7" />
            <stop offset="100%" stop-color="#075985" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-robot)" />
        <!-- Antenna -->
        <line x1="50" y1="16" x2="50" y2="28" stroke="#38BDF8" stroke-width="4" />
        <circle cx="50" cy="14" r="5" fill="#F43F5E" />
        <!-- Head -->
        <rect x="22" y="28" width="56" height="42" rx="10" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2" />
        <!-- Visor -->
        <rect x="30" y="36" width="40" height="16" rx="6" fill="#0F172A" />
        <circle cx="40" cy="44" r="4" fill="#38BDF8" />
        <circle cx="60" cy="44" r="4" fill="#38BDF8" />
        <!-- Mouth -->
        <line x1="38" y1="60" x2="62" y2="60" stroke="#64748B" stroke-width="3" stroke-linecap="round" />
        <line x1="44" y1="57" x2="44" y2="63" stroke="#64748B" stroke-width="2" />
        <line x1="50" y1="57" x2="50" y2="63" stroke="#64748B" stroke-width="2" />
        <line x1="56" y1="57" x2="56" y2="63" stroke="#64748B" stroke-width="2" />
      </svg>
    `),
  },
];
