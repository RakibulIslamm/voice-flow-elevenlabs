import 'server-only';
import { dentalTemplate } from './dental';
import { restaurantTemplate } from './restaurant';
import { leadQualifierTemplate } from './lead-qualifier';
import { customTemplate } from './custom';
import type { Template } from './types';

export type { BusinessInfo, Template } from './types';

/**
 * Registry of all built-in templates. Order is meaningful — the wizard
 * renders the picker in this order, with dental first as the canonical
 * appointment-flow example.
 */
export const TEMPLATES = {
  dental: dentalTemplate,
  restaurant: restaurantTemplate,
  'lead-qualifier': leadQualifierTemplate,
  custom: customTemplate,
} as const satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;

export function getTemplate(key: TemplateKey): Template {
  return TEMPLATES[key];
}
