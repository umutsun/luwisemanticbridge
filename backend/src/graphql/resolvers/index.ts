/**
 * GraphQL Resolvers Index
 * Tüm resolver'ları export eder
 */

export { baseResolvers } from './base.resolvers';
export { searchResolvers } from './search.resolvers';
export { chatResolvers } from './chat.resolvers';
export { settingsResolvers } from './settings.resolvers';

// Placeholder resolver'lar - sonra implement edilecek
export const documentResolvers = {
  Query: {},
  Mutation: {},
  Subscription: {},
};

export const scraperResolvers = {
  Query: {},
  Mutation: {},
  Subscription: {},
};