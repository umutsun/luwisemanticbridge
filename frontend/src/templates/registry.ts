/**
 * Chat Template Registry
 *
 * Manages available chat templates and provides dynamic imports.
 * Add new templates here when creating custom themes for clients.
 */

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  ChatInterface: () => Promise<any>;
  Widget?: () => Promise<any>;
  config: () => Promise<any>;
}

export const chatTemplates: Record<string, TemplateConfig> = {
  // Default template (always available)
  'base': {
    id: 'base',
    name: 'Default Template',
    description: 'Default chat interface',
    version: '1.0.0',
    ChatInterface: () => import('./base/ChatInterface'),
    config: () => import('./base/config.json')
  },

  'modern': {
    id: 'modern',
    name: 'Modern',
    description: 'Sleek dark theme with glassmorphism effects',
    version: '1.0.0',
    ChatInterface: () => import('./modern/ChatInterface'),
    config: () => import('./modern/config.json')
  },

  'spark': {
    id: 'spark',
    name: 'Spark',
    description: 'AI-inspired design with blue/purple gradient and sparkle effects',
    version: '1.0.0',
    ChatInterface: () => import('./spark/ChatInterface'),
    config: () => import('./spark/config.json')
  },

  'zen01': {
    id: 'zen01',
    name: 'Zen 01',
    description: 'Navy blue glassmorphism with zen-like animations, particles background, and dark/light mode support',
    version: '1.0.0',
    ChatInterface: () => import('./zen01/ChatInterface'),
    config: () => import('./zen01/config.json')
  },

  // Example: Add custom templates here
  // 'custom1': {
  //   id: 'custom1',
  //   name: 'Acme Corp Template',
  //   description: 'Custom theme for Acme Corp',
  //   version: '1.0.0',
  //   ChatInterface: () => import('./custom-acme/ChatInterface'),
  //   Widget: () => import('./custom-acme/Widget'),
  //   config: () => import('./custom-acme/config.json')
  // },
};

/**
 * Get available templates
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(chatTemplates);
}

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): TemplateConfig | null {
  return chatTemplates[templateId] || null;
}

/**
 * Check if template exists
 */
export function templateExists(templateId: string): boolean {
  return templateId in chatTemplates;
}

/**
 * Get default template
 */
export function getDefaultTemplate(): TemplateConfig {
  return chatTemplates['base'];
}
