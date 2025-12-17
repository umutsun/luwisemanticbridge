/**
 * Theme Configuration for Chat Interface
 *
 * Zen-style, glassmorphism, readable in both light/dark modes
 * All themes use Tailwind CSS classes for consistency
 */

export interface ThemeConfig {
  name: string;
  displayName: string;
  description: string;
  colors: {
    primary: string;
    primaryHover: string;
    accent: string;
    gradient: string;
    glass: string;
    border: string;
    text: string;
    textMuted: string;
  };
  components: {
    header: {
      bg: string;
      border: string;
    };
    message: {
      user: string;
      assistant: string;
      border: string;
    };
    input: {
      bg: string;
      border: string;
      focus: string;
    };
    source: {
      bg: string;
      border: string;
      hover: string;
    };
    suggestion: {
      bg: string;
      border: string;
      hover: string;
    };
  };
}

export const themes: Record<string, ThemeConfig> = {
  base: {
    name: 'base',
    displayName: 'Classic',
    description: 'Traditional clean design with primary blue theme',
    colors: {
      primary: 'blue-600',
      primaryHover: 'blue-700',
      accent: 'indigo-600',
      gradient: 'from-blue-600 to-indigo-600',
      glass: 'bg-white/80 dark:bg-slate-900/80',
      border: 'border-slate-200 dark:border-slate-700',
      text: 'text-slate-900 dark:text-slate-100',
      textMuted: 'text-slate-600 dark:text-slate-400'
    },
    components: {
      header: {
        bg: 'bg-background/80',
        border: 'border-b'
      },
      message: {
        user: 'bg-black text-white dark:bg-gray-900 dark:text-gray-100',
        assistant: 'bg-card',
        border: 'border'
      },
      input: {
        bg: 'bg-background/80',
        border: 'border-t',
        focus: 'focus:border-blue-500'
      },
      source: {
        bg: 'bg-card',
        border: 'border',
        hover: 'hover:shadow-md'
      },
      suggestion: {
        bg: 'bg-card',
        border: 'border',
        hover: 'hover:bg-accent/50'
      }
    }
  },

  modern: {
    name: 'modern',
    displayName: 'Modern',
    description: 'Minimalist zen-style with glassmorphism and violet gradient',
    colors: {
      primary: 'violet-600',
      primaryHover: 'violet-700',
      accent: 'indigo-600',
      gradient: 'from-violet-600 to-indigo-600',
      glass: 'bg-white/60 dark:bg-white/5 backdrop-blur-xl backdrop-saturate-150',
      border: 'border-white/50 dark:border-white/10',
      text: 'text-slate-900 dark:text-white',
      textMuted: 'text-slate-600 dark:text-slate-400'
    },
    components: {
      header: {
        bg: 'bg-white dark:bg-slate-800',
        border: 'border-b border-slate-200 dark:border-slate-700'
      },
      message: {
        user: 'bg-violet-600 text-white rounded-3xl rounded-tr-sm shadow-violet-500/20',
        assistant: 'bg-transparent',
        border: 'border border-slate-200 dark:border-slate-700'
      },
      input: {
        bg: 'bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl',
        border: 'border-2',
        focus: 'focus:border-violet-400 dark:focus:border-violet-500'
      },
      source: {
        bg: 'bg-white dark:bg-slate-800/90',
        border: 'border-2 border-slate-200 dark:border-slate-600',
        hover: 'hover:border-violet-400 dark:hover:border-violet-500 hover:shadow-md'
      },
      suggestion: {
        bg: 'bg-white/80 dark:bg-white/10 backdrop-blur-xl backdrop-saturate-150',
        border: 'border border-white/50 dark:border-white/10',
        hover: 'hover:bg-white/90 dark:hover:bg-white/15 hover:border-violet-400/50 dark:hover:border-violet-500/30 hover:shadow-xl'
      }
    }
  },

  spark: {
    name: 'spark',
    displayName: 'Spark',
    description: 'AI-inspired design with blue/purple gradient and sparkle effects',
    colors: {
      primary: 'blue-600',
      primaryHover: 'blue-700',
      accent: 'purple-600',
      gradient: 'from-blue-600 via-purple-600 to-blue-600',
      glass: 'bg-white/60 dark:bg-white/5 backdrop-blur-xl',
      border: 'border-gray-200/50 dark:border-gray-700/50',
      text: 'text-gray-900 dark:text-gray-100',
      textMuted: 'text-gray-600 dark:text-gray-300'
    },
    components: {
      header: {
        bg: 'bg-white/80 dark:bg-[#0a0a0b]/80 backdrop-blur-2xl',
        border: 'border-b border-gray-100 dark:border-gray-800/50'
      },
      message: {
        user: 'bg-gray-100 dark:bg-[#2d2e30] rounded-3xl',
        assistant: 'bg-transparent',
        border: 'border-gray-100 dark:border-gray-700/50'
      },
      input: {
        bg: 'bg-white dark:bg-gray-800/80 rounded-2xl shadow-lg',
        border: 'border border-gray-200/50 dark:border-gray-700/50',
        focus: 'focus:border-blue-300 dark:focus:border-blue-700'
      },
      source: {
        bg: 'bg-white dark:bg-gray-800/50',
        border: 'border border-gray-100 dark:border-gray-700/50',
        hover: 'hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-md'
      },
      suggestion: {
        bg: 'bg-white/60 dark:bg-white/5 backdrop-blur-xl backdrop-saturate-150',
        border: 'border border-white/50 dark:border-white/10',
        hover: 'hover:bg-white/80 dark:hover:bg-white/10 hover:border-blue-200/50 dark:hover:border-blue-500/30 hover:shadow-xl'
      }
    }
  }
};

/**
 * Get theme by name with fallback to 'modern'
 */
export const getTheme = (themeName?: string): ThemeConfig => {
  return themes[themeName || 'modern'] || themes.modern;
};

/**
 * Get all available themes
 */
export const getThemes = (): ThemeConfig[] => {
  return Object.values(themes);
};
