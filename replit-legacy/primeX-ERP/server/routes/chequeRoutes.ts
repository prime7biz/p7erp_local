import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { chequeTemplates, bankAccounts } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'server', 'uploads', 'cheque-templates');

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const tenantId = (req as any).tenantId || 'unknown';
    const dest = path.join(UPLOAD_DIR, String(tenantId));
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `cheque_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const bankAccountId = req.query.bankAccountId ? parseInt(req.query.bankAccountId as string) : undefined;

    let templates;
    if (bankAccountId) {
      templates = await db.select().from(chequeTemplates)
        .where(and(eq(chequeTemplates.tenantId, tenantId), eq(chequeTemplates.bankAccountId, bankAccountId)));
    } else {
      templates = await db.select().from(chequeTemplates)
        .where(eq(chequeTemplates.tenantId, tenantId));
    }

    return res.json({ templates });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to list templates' });
  }
});

router.get('/by-bank/:bankAccountId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const bankAccountId = parseInt(req.params.bankAccountId);

    if (!tenantId || isNaN(bankAccountId)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const [template] = await db.select().from(chequeTemplates)
      .where(and(
        eq(chequeTemplates.tenantId, tenantId),
        eq(chequeTemplates.bankAccountId, bankAccountId),
        eq(chequeTemplates.isActive, true)
      ))
      .limit(1);

    if (!template) {
      return res.status(404).json({ message: 'No cheque template configured for this bank account' });
    }

    return res.json(template);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to get template' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const { bankAccountId, templateName, fieldPositions, chequeWidthMm, chequeHeightMm } = req.body;

    if (!bankAccountId || !templateName || !fieldPositions) {
      return res.status(400).json({ message: 'bankAccountId, templateName, and fieldPositions are required' });
    }

    const [bank] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, tenantId)))
      .limit(1);

    if (!bank) {
      return res.status(400).json({ message: 'Bank account not found' });
    }

    const [template] = await db.insert(chequeTemplates).values({
      tenantId,
      bankAccountId,
      templateName,
      fieldPositions,
      chequeWidthMm: chequeWidthMm || 186,
      chequeHeightMm: chequeHeightMm || 86,
    }).returning();

    return res.status(201).json(template);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create template' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const templateId = parseInt(req.params.id);
    if (!tenantId || isNaN(templateId)) return res.status(400).json({ message: 'Invalid request' });

    const [existing] = await db.select().from(chequeTemplates)
      .where(and(eq(chequeTemplates.id, templateId), eq(chequeTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) return res.status(404).json({ message: 'Template not found' });

    const updates: any = {};
    if (req.body.templateName) updates.templateName = req.body.templateName;
    if (req.body.fieldPositions) updates.fieldPositions = req.body.fieldPositions;
    if (req.body.chequeWidthMm) updates.chequeWidthMm = req.body.chequeWidthMm;
    if (req.body.chequeHeightMm) updates.chequeHeightMm = req.body.chequeHeightMm;
    if (typeof req.body.isActive === 'boolean') updates.isActive = req.body.isActive;

    const [updated] = await db.update(chequeTemplates)
      .set(updates)
      .where(eq(chequeTemplates.id, templateId))
      .returning();

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update template' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const templateId = parseInt(req.params.id);
    if (!tenantId || isNaN(templateId)) return res.status(400).json({ message: 'Invalid request' });

    const [existing] = await db.select().from(chequeTemplates)
      .where(and(eq(chequeTemplates.id, templateId), eq(chequeTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) return res.status(404).json({ message: 'Template not found' });

    if (existing.templateImageUrl && fs.existsSync(existing.templateImageUrl)) {
      try { fs.unlinkSync(existing.templateImageUrl); } catch {}
    }

    await db.delete(chequeTemplates).where(eq(chequeTemplates.id, templateId));
    return res.json({ message: 'Template deleted' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to delete template' });
  }
});

router.post('/:id/upload-image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const templateId = parseInt(req.params.id);
    if (!tenantId || isNaN(templateId)) return res.status(400).json({ message: 'Invalid request' });

    if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });

    const [existing] = await db.select().from(chequeTemplates)
      .where(and(eq(chequeTemplates.id, templateId), eq(chequeTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) return res.status(404).json({ message: 'Template not found' });

    if (existing.templateImageUrl && fs.existsSync(existing.templateImageUrl)) {
      try { fs.unlinkSync(existing.templateImageUrl); } catch {}
    }

    const imageUrl = `/uploads/cheque-templates/${tenantId}/${req.file.filename}`;

    const [updated] = await db.update(chequeTemplates)
      .set({ templateImageUrl: imageUrl })
      .where(eq(chequeTemplates.id, templateId))
      .returning();

    return res.json({ imageUrl, template: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to upload image' });
  }
});

export default router;
