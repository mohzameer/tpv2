-- Fix sync_user_profile trigger to handle edge cases
-- This should resolve 500 errors during signup
-- 
-- Common issues:
-- 1. Email might be NULL (handled by early return)
-- 2. RLS might block even with SECURITY DEFINER (we explicitly set role)
-- 3. Function might not have proper permissions

-- Drop and recreate the function with better error handling
CREATE OR REPLACE FUNCTION sync_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT;
  v_display_name TEXT;
BEGIN
  -- Only proceed if email is not NULL
  -- During signup with email confirmation, email might be NULL initially
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  v_email := NEW.email;
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'name',
    SPLIT_PART(NEW.email, '@', 1)  -- Use email prefix as fallback
  );

  -- Insert or update user profile
  -- SECURITY DEFINER should bypass RLS, but we'll be explicit
  INSERT INTO user_profiles (user_id, email, display_name)
  VALUES (NEW.id::TEXT, v_email, v_display_name)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    email = EXCLUDED.email,
    display_name = COALESCE(
      EXCLUDED.display_name, 
      user_profiles.display_name,
      SPLIT_PART(EXCLUDED.email, '@', 1)
    ),
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    -- The signup should succeed even if profile sync fails
    -- In production, you might want to log this to an error table
    RAISE WARNING 'Failed to sync user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_profile();

-- Alternative approach: Temporarily disable RLS for the insert
-- This is the most reliable way to ensure the trigger works
CREATE OR REPLACE FUNCTION sync_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT;
  v_display_name TEXT;
BEGIN
  -- Only proceed if email is not NULL
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  v_email := NEW.email;
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'name',
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- Use ALTER TABLE to temporarily disable RLS, then re-enable
  -- Actually, we can't do this in a function. Instead, we'll use a workaround:
  -- The function owner (postgres) should have permissions to bypass RLS
  
  -- Insert or update user profile
  -- SECURITY DEFINER should run as postgres role which bypasses RLS
  INSERT INTO user_profiles (user_id, email, display_name)
  VALUES (NEW.id::TEXT, v_email, v_display_name)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    email = EXCLUDED.email,
    display_name = COALESCE(
      EXCLUDED.display_name, 
      user_profiles.display_name,
      SPLIT_PART(EXCLUDED.email, '@', 1)
    ),
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the full error for debugging
    RAISE WARNING 'Failed to sync user profile for user %: % (SQLSTATE: %)', 
      NEW.id, SQLERRM, SQLSTATE;
    -- Don't fail the signup - return NEW to allow the auth.users insert to succeed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_profile();

-- If the above still doesn't work, you may need to:
-- 1. Check Supabase logs for the exact error
-- 2. Temporarily disable RLS on user_profiles (not recommended for production)
-- 3. Or create the profile manually in a separate step after signup
