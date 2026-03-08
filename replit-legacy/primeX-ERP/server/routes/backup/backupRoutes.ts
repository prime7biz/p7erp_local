import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { generateBackup, listBackups, downloadBackup, deleteBackup, validateBackupFile, restoreFromData, getBackup } from '../../services/backupService';
import { db } from '../../db';
import { tenantSettings, tenantBackups } from '../../../shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { logAudit } from '../../services/auditService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  },
});

router.get('/health', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const backups = await db.select({
      id: tenantBackups.id,
      name: tenantBackups.name,
      status: tenantBackups.status,
      sizeBytes: tenantBackups.sizeBytes,
      isAutoBackup: tenantBackups.isAutoBackup,
      createdAt: tenantBackups.createdAt,
    })
      .from(tenantBackups)
      .where(eq(tenantBackups.tenantId, tenantId))
      .orderBy(desc(tenantBackups.createdAt))
      .limit(10);

    const lastBackup = backups[0] || null;
    const totalBackups = backups.length;
    const totalSize = backups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0);

    const [settings] = await db.select({
      autoBackupEnabled: tenantSettings.autoBackupEnabled,
      autoBackupFrequency: tenantSettings.autoBackupFrequency,
    }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);

    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (!lastBackup) {
      healthStatus = 'critical';
    } else if (lastBackup.status !== 'completed') {
      healthStatus = 'warning';
    } else {
      const daysSinceBackup = (Date.now() - new Date(lastBackup.createdAt!).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceBackup > 7) healthStatus = 'critical';
      else if (daysSinceBackup > 3) healthStatus = 'warning';
    }

    return res.json({
      healthStatus,
      lastBackupDate: lastBackup?.createdAt || null,
      lastBackupStatus: lastBackup?.status || null,
      lastBackupSize: lastBackup?.sizeBytes || null,
      totalBackups,
      totalSize,
      recentBackups: backups,
      settings: settings || { autoBackupEnabled: true, autoBackupFrequency: 'daily' },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to get backup health' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || null;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context required' });
    }

    const result = await generateBackup(tenantId, userId, false);
    logAudit({
      tenantId,
      entityType: 'backup',
      entityId: result.backupId,
      action: 'BACKUP_SUCCESS',
      performedBy: userId || 0,
      newValues: { sizeBytes: result.sizeBytes, recordCounts: result.recordCounts, isAuto: false },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.json({
      message: 'Backup created successfully',
      backupId: result.backupId,
      sizeBytes: result.sizeBytes,
      recordCounts: result.recordCounts,
    });
  } catch (error: any) {
    console.error('Backup generation failed:', error);
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || 0;
    if (tenantId) {
      logAudit({
        tenantId,
        entityType: 'backup',
        entityId: 0,
        action: 'BACKUP_FAILED',
        performedBy: userId,
        newValues: { error: error.message, isAuto: false },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
    return res.status(500).json({ message: error.message || 'Backup generation failed' });
  }
});

router.get('/list', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const backups = await listBackups(tenantId);
    return res.json({ backups });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to list backups' });
  }
});

router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const backupId = parseInt(req.params.id);

    if (!tenantId || isNaN(backupId)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const filePath = await downloadBackup(backupId, tenantId);
    if (!filePath) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    const backup = await getBackup(backupId, tenantId);
    const fileName = backup?.name?.replace(/[^a-zA-Z0-9\-_ ]/g, '') || 'backup';
    
    return res.download(filePath, `${fileName}.json`);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Download failed' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const backupId = parseInt(req.params.id);

    if (!tenantId || isNaN(backupId)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const success = await deleteBackup(backupId, tenantId);
    if (!success) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    return res.json({ message: 'Backup deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Delete failed' });
  }
});

router.post('/restore/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const backupId = parseInt(req.params.id);

    if (!tenantId || !userId || isNaN(backupId)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const filePath = await downloadBackup(backupId, tenantId);
    if (!filePath) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    const fs = await import('fs');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const backupData = JSON.parse(fileContent);

    const result = await restoreFromData(tenantId, userId, backupData);
    logAudit({
      tenantId,
      entityType: 'backup',
      entityId: backupId,
      action: 'RESTORE',
      performedBy: userId,
      newValues: { backupId, ...result },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.json({ message: 'Restore completed', ...result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Restore failed' });
  }
});

router.post('/upload-restore', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId || !userId) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let backupData: any;
    try {
      backupData = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch {
      return res.status(400).json({ message: 'Invalid JSON file' });
    }

    const validation = validateBackupFile(backupData);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const result = await restoreFromData(tenantId, userId, backupData);
    return res.json({ message: 'Restore completed', ...result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Restore failed' });
  }
});

router.post('/upload-validate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let backupData: any;
    try {
      backupData = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch {
      return res.status(400).json({ valid: false, message: 'Invalid JSON file' });
    }

    const validation = validateBackupFile(backupData);
    if (!validation.valid) {
      return res.status(400).json({ valid: false, message: validation.error });
    }

    return res.json({
      valid: true,
      meta: backupData.meta,
    });
  } catch (error: any) {
    return res.status(500).json({ valid: false, message: error.message || 'Validation failed' });
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const { autoBackupEnabled, autoBackupFrequency } = req.body;

    const updates: any = {};
    if (typeof autoBackupEnabled === 'boolean') updates.autoBackupEnabled = autoBackupEnabled;
    if (autoBackupFrequency && ['daily', 'weekly', 'off'].includes(autoBackupFrequency)) {
      updates.autoBackupFrequency = autoBackupFrequency;
    }

    await db.update(tenantSettings)
      .set(updates)
      .where(eq(tenantSettings.tenantId, tenantId));

    return res.json({ message: 'Backup settings updated' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update settings' });
  }
});

router.get('/settings', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const [settings] = await db.select({
      autoBackupEnabled: tenantSettings.autoBackupEnabled,
      autoBackupFrequency: tenantSettings.autoBackupFrequency,
    }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);

    return res.json(settings || { autoBackupEnabled: true, autoBackupFrequency: 'daily' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to get settings' });
  }
});

export default router;
