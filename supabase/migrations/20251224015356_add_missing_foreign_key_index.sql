/*
  # Add Missing Foreign Key Index

  ## Performance Optimization
  
  1. **Automation Activities Table**
     - Add index on `instagram_account_id` foreign key column
     - Foreign keys without indexes can cause significant performance issues
     - This index improves JOIN performance and prevents table locks during cascading operations
  
  ## Technical Details
  
  When a foreign key column lacks an index, PostgreSQL must perform full table scans
  when checking referential integrity, especially during DELETE operations on the
  referenced table. This can lead to:
  - Slow query performance
  - Table-level locks
  - Degraded overall database performance
  
  Adding an index on foreign key columns is a database best practice.
*/

-- Add index on instagram_account_id foreign key
CREATE INDEX IF NOT EXISTS idx_automation_activities_instagram_account_id 
  ON automation_activities(instagram_account_id);
