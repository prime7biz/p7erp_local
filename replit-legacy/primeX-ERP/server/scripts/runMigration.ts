/**
 * Migration Runner Script
 * 
 * This script executes the sequential ID migration
 * for all existing data in the system
 */
import { migrateAllSequentialIds } from './migrateSequentialIds';

// Execute the migration
console.log("Starting Sequential ID Migration...");
migrateAllSequentialIds()
  .then(() => {
    console.log("Migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });