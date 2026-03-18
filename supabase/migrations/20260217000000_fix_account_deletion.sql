-- Migration to fix account deletion database error by adding missing CASCADE constraints

-- 1. Subscriptions Table
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
        AND contype = 'f'
        AND confrelid = 'auth.users'::regclass;

        IF constraint_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE public.subscriptions DROP CONSTRAINT ' || constraint_name;
        END IF;

        ALTER TABLE public.subscriptions
        ADD CONSTRAINT subscriptions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Promo Codes Table
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'promo_codes') THEN
        -- Safely check for foreign key referencing auth.users on ANY column
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'public.promo_codes'::regclass
        AND contype = 'f'
        AND confrelid = 'auth.users'::regclass
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = constraint_name 
                AND confdeltype = 'c'
            ) THEN
                EXECUTE 'ALTER TABLE public.promo_codes DROP CONSTRAINT ' || constraint_name;
                
                -- Detect if the column is 'user_id' or 'created_by'
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promo_codes' AND column_name = 'user_id') THEN
                    ALTER TABLE public.promo_codes
                    ADD CONSTRAINT promo_codes_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
                ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promo_codes' AND column_name = 'created_by') THEN
                    ALTER TABLE public.promo_codes
                    ADD CONSTRAINT promo_codes_created_by_fkey
                    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
                END IF;
            END IF;
        END IF;
    END IF;
END $$;
