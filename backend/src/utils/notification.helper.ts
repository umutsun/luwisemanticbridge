/**
 * Notification Helper
 *
 * Wrapper utilities for NotificationService
 * Makes it easy to send notifications from anywhere in the app
 */

import NotificationService from '../services/notification.service';
import { logger } from './logger';

/**
 * Send success notification
 */
export async function notifySuccess(
  title: string,
  message: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await NotificationService.success(title, message, userId, metadata);
  } catch (error) {
    logger.error('Failed to send success notification:', error);
  }
}

/**
 * Send error notification
 */
export async function notifyError(
  title: string,
  message: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await NotificationService.error(title, message, userId, metadata);
  } catch (error) {
    logger.error('Failed to send error notification:', error);
  }
}

/**
 * Send warning notification
 */
export async function notifyWarning(
  title: string,
  message: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await NotificationService.warning(title, message, userId, metadata);
  } catch (error) {
    logger.error('Failed to send warning notification:', error);
  }
}

/**
 * Send info notification
 */
export async function notifyInfo(
  title: string,
  message: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await NotificationService.info(title, message, userId, metadata);
  } catch (error) {
    logger.error('Failed to send info notification:', error);
  }
}

/**
 * Send crawler completion notification
 */
export async function notifyCrawlerComplete(
  crawlerName: string,
  itemCount: number,
  userId?: string
): Promise<void> {
  await notifySuccess(
    'Kazıma Tamamlandı',
    `${crawlerName} crawler başarıyla tamamlandı. ${itemCount} öğe işlendi.`,
    userId,
    { crawler: crawlerName, items: itemCount }
  );
}

/**
 * Send crawler error notification
 */
export async function notifyCrawlerError(
  crawlerName: string,
  error: string,
  userId?: string
): Promise<void> {
  await notifyError(
    'Kazıma Hatası',
    `${crawlerName} crawler hata ile karşılaştı: ${error}`,
    userId,
    { crawler: crawlerName, error }
  );
}

/**
 * Send embedding completion notification
 */
export async function notifyEmbeddingComplete(
  source: string,
  count: number,
  userId?: string
): Promise<void> {
  await notifySuccess(
    'Embedding Tamamlandı',
    `${source} için ${count} embedding başarıyla oluşturuldu.`,
    userId,
    { source, count }
  );
}

/**
 * Send migration completion notification
 */
export async function notifyMigrationComplete(
  tableName: string,
  rowCount: number,
  userId?: string
): Promise<void> {
  await notifySuccess(
    'Migration Tamamlandı',
    `${tableName} migration başarıyla tamamlandı. ${rowCount} satır işlendi.`,
    userId,
    { table: tableName, rows: rowCount }
  );
}

/**
 * Send system maintenance notification (global)
 */
export async function notifySystemMaintenance(
  title: string,
  message: string
): Promise<void> {
  await notifyWarning(title, message, undefined, { global: true });
}
