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

    if (!response.ok) {
      console.warn('Failed to fetch active template, using default');
      return 'base';
    }

    const data: ActiveTemplateResponse = await response.json();
    return data.active || 'base';
  } catch (error) {
    console.error('Error loading active template:', error);
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
  try {
    const template = getTemplate(templateId);

    if (!template) {
      console.warn(`Template "${templateId}" not found, using default`);
      return loadDefaultTemplate();
    }

    // Load template modules
    const [ChatInterfaceModule, configModule] = await Promise.all([
      template.ChatInterface(),
      template.config()
    ]);

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
    console.error(`Error loading template "${templateId}":`, error);
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
