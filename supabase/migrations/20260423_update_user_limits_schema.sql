-- Migration to update user_limits schema to support all gifted premium features
CREATE TABLE IF NOT EXISTS public.user_limits (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_gifted BOOLEAN DEFAULT FALSE,
    dm_limit INTEGER,
    automation_limit INTEGER,
    lead_manager BOOLEAN DEFAULT FALSE,
    carousel_enabled BOOLEAN DEFAULT FALSE,
    carousel_count INTEGER DEFAULT 10,
    menu_flow_enabled BOOLEAN DEFAULT FALSE,
    menu_flow_count INTEGER DEFAULT 10,
    ask_to_follow_enabled BOOLEAN DEFAULT FALSE,
    account_limit INTEGER DEFAULT 1,
    expiry_date TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='lead_manager') THEN
        ALTER TABLE public.user_limits ADD COLUMN lead_manager BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='carousel_enabled') THEN
        ALTER TABLE public.user_limits ADD COLUMN carousel_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='carousel_count') THEN
        ALTER TABLE public.user_limits ADD COLUMN carousel_count INTEGER DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='menu_flow_enabled') THEN
        ALTER TABLE public.user_limits ADD COLUMN menu_flow_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='menu_flow_count') THEN
        ALTER TABLE public.user_limits ADD COLUMN menu_flow_count INTEGER DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='ask_to_follow_enabled') THEN
        ALTER TABLE public.user_limits ADD COLUMN ask_to_follow_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='account_limit') THEN
        ALTER TABLE public.user_limits ADD COLUMN account_limit INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_limits' AND column_name='expiry_date') THEN
        ALTER TABLE public.user_limits ADD COLUMN expiry_date TIMESTAMPTZ;
    END IF;
END $$;
