# Fresh Supabase Setup Guide

This guide will help you set up a new Supabase project for your Instagram automation dashboard.

## Step 1: Create a New Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in to your account
2. Click "New Project"
3. Choose a name for your project
4. Select your preferred region
5. Set a secure database password
6. Click "Create Project"

## Step 2: Get Your Project Credentials

After your project is created, you'll need these values:
- **Project URL**: Found on your project dashboard under "Project Settings" > "API"
- **Anonymous/Service Role Key**: Found on your project dashboard under "Project Settings" > "API"

## Step 3: Update Environment Variables

Replace the values in your `.env` file with your new project credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 4: Set Up Database Schema

1. Go to your Supabase dashboard
2. Navigate to the "SQL Editor" tab
3. Copy and paste the contents of `schema.sql` file into the editor
4. Click "Run" to execute the SQL commands

## Step 5: Configure Authentication

1. In your Supabase dashboard, go to "Authentication" > "Settings"
2. Under "Redirect URLs", add your frontend URL (e.g., `http://localhost:5173`)
3. Under "Site URL", add your frontend URL
4. Under "Additional Redirect URLs", add your Instagram OAuth callback URL

## Step 6: Set Up Environment Variables for Instagram OAuth

You'll also need to set up these additional environment variables in your Supabase project:
- Go to "Project Settings" > "Environment Variables"
- Add these variables:
  - `INSTAGRAM_CLIENT_ID`: Your Instagram App Client ID
  - `INSTAGRAM_CLIENT_SECRET`: Your Instagram App Client Secret
  - `INSTAGRAM_REDIRECT_URI`: `https://your-project.supabase.co/functions/v1/instagram-oauth-callback`
  - `FRONTEND_URL`: Your frontend application URL

## Step 7: Deploy Edge Functions

1. Update the environment variables in your edge functions to match your new project
2. Deploy your functions using the Supabase CLI:
   ```bash
   supabase functions deploy --project-ref your-project-ref
   ```

## Step 8: Enable Required Authentication Providers

1. In your Supabase dashboard, go to "Authentication" > "Providers"
2. Enable the email provider (for user registration/login)
3. Configure any other providers you plan to use

## Step 9: Test the Connection

1. Update your application to use the new Supabase credentials
2. Run your application and test the connection
3. Verify that you can create accounts and interact with the database

## Troubleshooting

If you encounter any issues:

1. Verify all environment variables are correctly set
2. Check that your schema has been properly applied
3. Ensure your Row Level Security policies are configured correctly
4. Confirm that your Instagram OAuth app is properly configured
5. Check the browser console and network tab for specific error messages

## Additional Security Considerations

- Review and adjust the Row Level Security policies based on your specific needs
- Consider setting up database connection pooling if needed
- Implement proper error handling in your application
- Regularly rotate your API keys for security