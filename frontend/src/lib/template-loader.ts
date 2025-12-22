/**
 * Template Loader
 *
 * Dynamically loads active chat template from backend configuration.
 * Falls back to base template if active template is not found.
 */

import {
  chatTemplates,
  getTemplate,
  getDefaultTemplate,
  type TemplateConfig
} from '@/templates/registry';

interface ActiveTemplateResponse {
  active: string;
  available: string[];
}

/**
 * Fetch active template ID from backend
 */
export async function getActiveTemplateId(): Promise<string> {
  try {
    const response = await fetch('/api/v2/settings/active-template', {
      cache: 'no-store' // Always fetch fresh
    });

    console.log('🔍 [TEMPLATE] API response status:', response.status);

    if (!response.ok) {
      console.warn('🔍 [TEMPLATE] Failed to fetch active template, using default');
      return 'base';
    }

    const data: ActiveTemplateResponse = await response.json();
    console.log('🔍 [TEMPLATE] API returned template ID:', data.active);
    return data.active || 'base';
  } catch (error) {
    console.error('🔍 [TEMPLATE] Error loading active template:', error);
    return 'base';
  }
}

/**
 * Load template by ID
 */
export async function loadTemplate(templateId: string): Promise<{
  Component: any;
  Widget?: any;
  config: any;
}> {
  console.log('🔍 [TEMPLATE] loadTemplate called with ID:', templateId);
  console.log('🔍 [TEMPLATE] Available templates:', Object.keys(chatTemplates));

  try {
    const template = getTemplate(templateId);
    console.log('🔍 [TEMPLATE] getTemplate result:', template ? template.name : 'null');

    if (!template) {
      console.warn(`🔍 [TEMPLATE] Template "${templateId}" not found, using default`);
      return loadDefaultTemplate();
    }

    console.log('🔍 [TEMPLATE] Loading ChatInterface for:', template.id);

    // Load template modules
    const [ChatInterfaceModule, configModule] = await Promise.all([
      template.ChatInterface(),
      template.config()
    ]);

    console.log('🔍 [TEMPLATE] ChatInterface module loaded:', !!ChatInterfaceModule.default);
    console.log('🔍 [TEMPLATE] Config loaded:', configModule.default?.name || configModule?.name || 'unknown');

    // Load widget if available
    let WidgetModule;
    if (template.Widget) {
      WidgetModule = await template.Widget();
    }

    return {
      Component: ChatInterfaceModule.default,
      Widget: WidgetModule?.default,
      config: configModule.default || configModule
    };
  } catch (error) {
    console.error(`🔍 [TEMPLATE] Error loading template "${templateId}":`, error);
    return loadDefaultTemplate();
  }
}

/**
 * Load default template
 */
async function loadDefaultTemplate() {
  const defaultTemplate = getDefaultTemplate();
  const [ChatInterfaceModule, configModule] = await Promise.all([
    defaultTemplate.ChatInterface(),
    defaultTemplate.config()
  ]);

  return {
    Component: ChatInterfaceModule.default,
    config: configModule.default || configModule
  };
}

/**
 * Load active template (shorthand)
 */
export async function loadActiveTemplate() {
  const templateId = await getActiveTemplateId();
  return loadTemplate(templateId);
}
