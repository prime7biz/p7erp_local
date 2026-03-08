/**
 * Formats a date for PostgreSQL.
 * Handles both date strings and JavaScript Date objects.
 * 
 * @param dateValue - Date string, Date object, or null/undefined
 * @returns Formatted date string or null
 */
export function formatDateForPostgres(dateValue: string | Date | null | undefined): string | null {
  if (!dateValue) {
    return null;
  }

  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Format as YYYY-MM-DD for PostgreSQL
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error formatting date for PostgreSQL:', error);
    return null;
  }
}

/**
 * Formats a datetime for PostgreSQL with time component.
 * 
 * @param dateValue - Date string, Date object, or null/undefined
 * @returns Formatted datetime string or null
 */
export function formatDateTimeForPostgres(dateValue: string | Date | null | undefined): string | null {
  if (!dateValue) {
    return null;
  }

  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Format as ISO string for PostgreSQL timestamp
    return date.toISOString();
  } catch (error) {
    console.error('Error formatting datetime for PostgreSQL:', error);
    return null;
  }
}

/**
 * Parses a PostgreSQL date string into a JavaScript Date object.
 * 
 * @param pgDate - PostgreSQL date string
 * @returns JavaScript Date object or null
 */
export function parsePgDate(pgDate: string | null | undefined): Date | null {
  if (!pgDate) {
    return null;
  }

  try {
    const date = new Date(pgDate);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date;
  } catch (error) {
    console.error('Error parsing PostgreSQL date:', error);
    return null;
  }
}