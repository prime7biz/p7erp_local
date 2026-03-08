import { db } from "../../db";
import {
  journals, 
  journalLines, 
  journalTypes,
  accountingPeriods,
  fiscalYears,
  chartOfAccounts,
  users,
  type Journal,
  type InsertJournal,
  type JournalLine,
  type InsertJournalLine,
  type JournalType
} from "@shared/schema";
import { eq, and, desc, gte, lte, like, or, inArray } from "drizzle-orm";
import { executeQuery } from "../../db";

export interface JournalWithDetails extends Journal {
  lines: JournalLine[];
  journalType?: JournalType;
  createdByUser?: { username: string };
  postedByUser?: { username: string } | null;
}

export interface JournalSearchParams {
  startDate?: string;
  endDate?: string;
  reference?: string;
  status?: string;
  type?: string;
  tenantId: number;
}

export class JournalStorage {
  /**
   * Get all journals for a tenant with pagination
   */
  async getAllJournals(tenantId: number, page: number = 1, limit: number = 20): Promise<JournalWithDetails[]> {
    return executeQuery(async () => {
      // Get journals with pagination
      const offset = (page - 1) * limit;
      const journalResults = await db.select()
        .from(journals)
        .where(eq(journals.tenantId, tenantId))
        .orderBy(desc(journals.journalDate))
        .limit(limit)
        .offset(offset);

      return this.populateJournalDetails(journalResults);
    });
  }

  /**
   * Get recent journals for a tenant
   */
  async getRecentJournals(tenantId: number, limit: number = 10): Promise<JournalWithDetails[]> {
    return executeQuery(async () => {
      const journalResults = await db.select()
        .from(journals)
        .where(eq(journals.tenantId, tenantId))
        .orderBy(desc(journals.journalDate))
        .limit(limit);

      return this.populateJournalDetails(journalResults);
    });
  }

  /**
   * Get a journal by ID with all its details
   */
  async getJournalById(id: number, tenantId: number): Promise<JournalWithDetails | null> {
    return executeQuery(async () => {
      const [journalResult] = await db.select()
        .from(journals)
        .where(and(
          eq(journals.id, id),
          eq(journals.tenantId, tenantId)
        ));

      if (!journalResult) {
        return null;
      }

      const journalDetails = await this.populateJournalDetails([journalResult]);
      return journalDetails[0] || null;
    });
  }

  /**
   * Get a journal by journal number
   */
  async getJournalByNumber(journalNumber: string, tenantId: number): Promise<JournalWithDetails | null> {
    return executeQuery(async () => {
      const [journalResult] = await db.select()
        .from(journals)
        .where(and(
          eq(journals.journalNumber, journalNumber),
          eq(journals.tenantId, tenantId)
        ));

      if (!journalResult) {
        return null;
      }

      const journalDetails = await this.populateJournalDetails([journalResult]);
      return journalDetails[0] || null;
    });
  }

  /**
   * Search journals by various parameters
   */
  async searchJournals(params: JournalSearchParams): Promise<JournalWithDetails[]> {
    return executeQuery(async () => {
      const { tenantId, startDate, endDate, reference, status, type } = params;
      
      let query = db.select()
        .from(journals)
        .where(eq(journals.tenantId, tenantId));
      
      // Apply filters
      if (startDate) {
        query = query.where(gte(journals.journalDate, startDate));
      }
      
      if (endDate) {
        query = query.where(lte(journals.journalDate, endDate));
      }
      
      if (reference) {
        query = query.where(or(
          like(journals.journalNumber, `%${reference}%`),
          like(journals.reference, `%${reference}%`)
        ));
      }
      
      if (status) {
        query = query.where(eq(journals.status, status));
      }
      
      if (type) {
        // First, find the journal type ID
        const [journalType] = await db.select({
          id: journalTypes.id
        })
        .from(journalTypes)
        .where(and(
          eq(journalTypes.code, type),
          eq(journalTypes.tenantId, tenantId)
        ));
        
        if (journalType) {
          query = query.where(eq(journals.journalTypeId, journalType.id));
        }
      }
      
      const journalResults = await query.orderBy(desc(journals.journalDate));
      return this.populateJournalDetails(journalResults);
    });
  }

  /**
   * Create a new journal with its detail lines
   */
  async createJournal(journal: InsertJournal, journalLines: InsertJournalLine[]): Promise<JournalWithDetails> {
    return executeQuery(async () => {
      // Calculate the total amount from journal lines
      const totalAmount = journalLines.reduce((total, line) => {
        return total + parseFloat(line.debitAmount.toString());
      }, 0);
      
      // Insert journal with calculated amount
      const [createdJournal] = await db.insert(journals)
        .values({
          ...journal,
          amount: totalAmount.toString()
        })
        .returning();
      
      // Insert journal lines
      if (journalLines.length > 0) {
        await db.insert(journalLines)
          .values(
            journalLines.map(line => ({
              ...line,
              journalId: createdJournal.id,
              tenantId: journal.tenantId
            }))
          );
      }
      
      return this.getJournalById(createdJournal.id, journal.tenantId) as Promise<JournalWithDetails>;
    });
  }

  /**
   * Update journal status to posted
   */
  async postJournal(id: number, tenantId: number, userId: number): Promise<JournalWithDetails | null> {
    return executeQuery(async () => {
      // First check if journal exists and is in draft status
      const [journal] = await db.select()
        .from(journals)
        .where(and(
          eq(journals.id, id),
          eq(journals.tenantId, tenantId),
          eq(journals.status, 'draft')
        ));
      
      if (!journal) {
        return null;
      }
      
      // Get journal lines
      const lines = await db.select()
        .from(journalLines)
        .where(and(
          eq(journalLines.journalId, id),
          eq(journalLines.tenantId, tenantId)
        ));
      
      // Check debits and credits are balanced
      const totalDebits = lines.reduce((sum, line) => sum + parseFloat(line.debitAmount.toString()), 0);
      const totalCredits = lines.reduce((sum, line) => sum + parseFloat(line.creditAmount.toString()), 0);
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error("Journal debits and credits are not balanced");
      }
      
      // Update journal status
      const [updatedJournal] = await db.update(journals)
        .set({
          status: 'posted',
          postDate: new Date().toISOString().split('T')[0], // Current date
          postedBy: userId,
          postedAt: new Date()
        })
        .where(and(
          eq(journals.id, id),
          eq(journals.tenantId, tenantId)
        ))
        .returning();
      
      // Update account balances
      await this.updateAccountBalances(lines, tenantId);
      
      return this.getJournalById(updatedJournal.id, tenantId);
    });
  }

  /**
   * Update journal status to reversed
   */
  async reverseJournal(id: number, tenantId: number, userId: number): Promise<JournalWithDetails | null> {
    return executeQuery(async () => {
      // First check if journal exists and is in posted status
      const [journal] = await db.select()
        .from(journals)
        .where(and(
          eq(journals.id, id),
          eq(journals.tenantId, tenantId),
          eq(journals.status, 'posted')
        ));
      
      if (!journal) {
        return null;
      }
      
      // Create a reversal journal
      const [reversalJournal] = await db.insert(journals)
        .values({
          tenantId: journal.tenantId,
          journalTypeId: journal.journalTypeId,
          fiscalYearId: journal.fiscalYearId,
          periodId: journal.periodId,
          reversalOfJournalId: journal.id,
          journalNumber: await this.generateJournalNumber(journal.journalTypeId, tenantId),
          journalDate: new Date().toISOString().split('T')[0], // Current date
          postDate: new Date().toISOString().split('T')[0], // Current date
          reference: `Reversal of ${journal.journalNumber}`,
          description: `Reversal of journal: ${journal.description}`,
          status: 'posted',
          amount: journal.amount,
          createdBy: userId,
          postedBy: userId,
          postedAt: new Date()
        })
        .returning();
      
      // Get the original journal lines
      const originalLines = await db.select()
        .from(journalLines)
        .where(and(
          eq(journalLines.journalId, id),
          eq(journalLines.tenantId, tenantId)
        ));
      
      // Create reversal lines with debits and credits swapped
      const reversalLines = originalLines.map(line => ({
        tenantId: line.tenantId,
        journalId: reversalJournal.id,
        accountId: line.accountId,
        description: `Reversal of: ${line.description || ''}`,
        debitAmount: line.creditAmount,
        creditAmount: line.debitAmount,
        sortOrder: line.sortOrder
      }));
      
      await db.insert(journalLines)
        .values(reversalLines);
      
      // Update the original journal status
      const [updatedJournal] = await db.update(journals)
        .set({
          status: 'reversed'
        })
        .where(and(
          eq(journals.id, id),
          eq(journals.tenantId, tenantId)
        ))
        .returning();
      
      // Update account balances for the reversal
      await this.updateAccountBalances(reversalLines as JournalLine[], tenantId);
      
      return this.getJournalById(reversalJournal.id, tenantId);
    });
  }

  /**
   * Generate a unique journal number based on journal type prefix and next number
   */
  private async generateJournalNumber(journalTypeId: number, tenantId: number): Promise<string> {
    return executeQuery(async () => {
      // Get the journal type
      const [journalType] = await db.select()
        .from(journalTypes)
        .where(and(
          eq(journalTypes.id, journalTypeId),
          eq(journalTypes.tenantId, tenantId)
        ));
      
      if (!journalType) {
        throw new Error("Journal type not found");
      }
      
      // Generate journal number
      const prefix = journalType.prefix || 'JRN';
      const number = journalType.nextNumber;
      const journalNumber = `${prefix}-${number.toString().padStart(6, '0')}`;
      
      // Update the next number
      await db.update(journalTypes)
        .set({
          nextNumber: journalType.nextNumber + 1
        })
        .where(and(
          eq(journalTypes.id, journalTypeId),
          eq(journalTypes.tenantId, tenantId)
        ));
      
      return journalNumber;
    });
  }

  /**
   * Update account balances based on journal lines
   */
  private async updateAccountBalances(lines: JournalLine[], tenantId: number): Promise<void> {
    return executeQuery(async () => {
      // Group by account ID to handle multiple lines with the same account
      const accountUpdates = new Map<number, { debit: number, credit: number }>();
      
      for (const line of lines) {
        const accountId = line.accountId;
        const debit = parseFloat(line.debitAmount.toString());
        const credit = parseFloat(line.creditAmount.toString());
        
        const current = accountUpdates.get(accountId) || { debit: 0, credit: 0 };
        accountUpdates.set(accountId, {
          debit: current.debit + debit,
          credit: current.credit + credit
        });
      }
      
      // For each account, get the account details to determine how to adjust the balance
      for (const [accountId, amounts] of accountUpdates.entries()) {
        const [account] = await db.select()
          .from(chartOfAccounts)
          .where(and(
            eq(chartOfAccounts.id, accountId),
            eq(chartOfAccounts.tenantId, tenantId)
          ));
        
        if (!account) continue;
        
        // Calculate the net change based on normal balance
        let netChange = 0;
        
        if (account.isActive) {
          // For asset and expense accounts with debit normal balance
          // Debit increases, Credit decreases
          if (account.path.startsWith('1') || account.path.startsWith('5')) {
            netChange = amounts.debit - amounts.credit;
          }
          // For liability, equity, and revenue accounts with credit normal balance
          // Credit increases, Debit decreases
          else {
            netChange = amounts.credit - amounts.debit;
          }
          
          // Update the account balance
          const newBalance = parseFloat(account.balance.toString()) + netChange;
          
          await db.update(chartOfAccounts)
            .set({
              balance: newBalance.toString()
            })
            .where(and(
              eq(chartOfAccounts.id, accountId),
              eq(chartOfAccounts.tenantId, tenantId)
            ));
        }
      }
    });
  }

  /**
   * Helper to populate journal details (lines, related entities)
   */
  private async populateJournalDetails(journalResults: Journal[]): Promise<JournalWithDetails[]> {
    if (journalResults.length === 0) {
      return [];
    }
    
    const journalIds = journalResults.map(j => j.id);
    const tenantId = journalResults[0].tenantId;
    
    // Get all journal lines for these journals
    const allLines = await db.select()
      .from(journalLines)
      .where(and(
        inArray(journalLines.journalId, journalIds),
        eq(journalLines.tenantId, tenantId)
      ))
      .orderBy(journalLines.sortOrder);
    
    // Get all journal types
    const journalTypeIds = [...new Set(journalResults.map(j => j.journalTypeId))];
    const journalTypeResults = await db.select()
      .from(journalTypes)
      .where(and(
        inArray(journalTypes.id, journalTypeIds),
        eq(journalTypes.tenantId, tenantId)
      ));
    
    // Get user information for created by and posted by
    const userIds = [...new Set([
      ...journalResults.map(j => j.createdBy),
      ...journalResults.filter(j => j.postedBy).map(j => j.postedBy!)
    ])];
    
    const userResults = await db.select({
      id: users.id,
      username: users.username
    })
    .from(users)
    .where(inArray(users.id, userIds));
    
    // Map journal types and users by ID for quick lookup
    const journalTypesMap = new Map(journalTypeResults.map(jt => [jt.id, jt]));
    const usersMap = new Map(userResults.map(u => [u.id, u]));
    
    // Group lines by journal ID
    const linesByJournalId = new Map<number, JournalLine[]>();
    for (const line of allLines) {
      const lines = linesByJournalId.get(line.journalId) || [];
      lines.push(line);
      linesByJournalId.set(line.journalId, lines);
    }
    
    // Build the result with all details
    return journalResults.map(journal => {
      return {
        ...journal,
        lines: linesByJournalId.get(journal.id) || [],
        journalType: journalTypesMap.get(journal.journalTypeId),
        createdByUser: usersMap.get(journal.createdBy),
        postedByUser: journal.postedBy ? usersMap.get(journal.postedBy) || null : null
      };
    });
  }
}

export const journalStorage = new JournalStorage();