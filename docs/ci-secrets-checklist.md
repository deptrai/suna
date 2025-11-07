# CI/CD Secrets Checklist

**Pipeline:** Test Pipeline (GitHub Actions)  
**Last Updated:** 2025-11-02

---

## Required Secrets

### None (Currently)

The current pipeline configuration does not require any secrets. All tests run in public environments with test data.

**Note:** Notifications are now optional - workflow will work without Slack webhook configured.

---

## Optional Secrets

### For Future Enhancements

#### 1. `SLACK_WEBHOOK` (Optional)
- **Purpose:** Send notifications to Slack on test failures
- **Where to Configure:** GitHub → Settings → Secrets and variables → Actions
- **How to Get:**
  1. Create Slack App at https://api.slack.com/apps
  2. Add "Incoming Webhooks" feature
  3. Create webhook URL
  4. Copy webhook URL to GitHub secrets

**Security Best Practices:**
- Use repository secrets (not environment secrets) for default notifications
- Use environment secrets for staging/production-specific notifications
- Rotate webhook URLs periodically (every 90 days)

#### 2. `TEST_USER_EMAIL` (Optional - for authentication tests)
- **Purpose:** Test user email for authentication E2E tests
- **Where to Configure:** GitHub → Settings → Secrets and variables → Actions
- **Recommended:** Use a dedicated test account (not production user)

#### 3. `TEST_USER_PASSWORD` (Optional - for authentication tests)
- **Purpose:** Test user password for authentication E2E tests
- **Where to Configure:** GitHub → Settings → Secrets and variables → Actions
- **Security:** Use strong password, rotate periodically

#### 4. `API_URL` (Optional)
- **Purpose:** API endpoint URL for API tests
- **Where to Configure:** GitHub → Settings → Secrets and variables → Actions
- **Default:** Uses `http://localhost:8000/api` if not set

#### 5. `SUPABASE_URL` (Optional - if using Supabase)
- **Purpose:** Supabase project URL for database tests
- **Where to Configure:** GitHub → Settings → Secrets and variables → Actions

#### 6. `SUPABASE_ANON_KEY` (Optional - if using Supabase)
- **Purpose:** Supabase anonymous key for database operations
- **Where to Configure:** GitHub → Settings → Secrets and variables → Actions
- **Security:** This is a public key (safe for repositories)

---

## How to Configure Secrets in GitHub

### Step 1: Navigate to Repository Settings

1. Go to repository on GitHub
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions**

### Step 2: Add New Secret

1. Click **New repository secret**
2. Enter secret name (e.g., `SLACK_WEBHOOK`)
3. Enter secret value
3. Click **Add secret**

### Step 3: Use Secret in Workflow

Secrets are automatically available as environment variables:

```yaml
env:
  SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

Or inline:

```yaml
- name: Send notification
  run: |
    curl -X POST -H 'Content-type: application/json' \
      --data '{"text":"Tests failed!"}' \
      ${{ secrets.SLACK_WEBHOOK }}
```

---

## Security Best Practices

### 1. Principle of Least Privilege

- Only add secrets that are actually needed
- Use environment-specific secrets for different deployment stages
- Limit secret access to specific workflows if possible

### 2. Secret Rotation

- **Webhooks:** Rotate every 90 days
- **API Keys:** Rotate every 180 days
- **Passwords:** Rotate every 90 days
- **Test Credentials:** Rotate every 180 days

### 3. Secret Storage

- ✅ **DO:** Store secrets in GitHub Secrets
- ❌ **DON'T:** Commit secrets to repository
- ❌ **DON'T:** Hardcode secrets in workflow files
- ❌ **DON'T:** Share secrets via chat or email

### 4. Audit Trail

GitHub automatically logs:
- Who added/removed secrets
- When secrets were accessed (in workflow runs)
- Which workflows used secrets

**Review:** Settings → Secrets and variables → Actions → Secret access log

### 5. Environment-Specific Secrets

For multiple environments (dev/staging/prod):

1. Create **Environments** in GitHub Settings
2. Add environment-specific secrets
3. Reference in workflow:

```yaml
jobs:
  test:
    environment: staging  # Uses staging secrets
    steps:
      - run: echo ${{ secrets.STAGING_API_KEY }}
```

---

## Verification

### Check Secret Configuration

After adding secrets:

1. **Verify secret exists:**
   - Settings → Secrets and variables → Actions
   - Confirm secret name and value mask are correct

2. **Test in workflow:**
   - Create a test workflow run
   - Check logs for secret usage (values are masked)
   - Verify workflow succeeds

3. **Monitor access:**
   - Review secret access log
   - Confirm only expected workflows use secrets

---

## Troubleshooting

### "Secret not found" Error

**Cause:** Secret name mismatch or secret not configured

**Fix:**
1. Verify secret name in workflow matches GitHub secret name
2. Check secret exists in Settings → Secrets and variables → Actions
3. Ensure secret is added to correct repository/environment

### "Secret value is empty" Error

**Cause:** Secret was added but value is empty

**Fix:**
1. Edit secret in GitHub Settings
2. Enter correct value
3. Save secret

### Secrets Not Available in PRs

**Cause:** GitHub restricts secrets in PRs from forks

**Fix:**
1. Use repository secrets (not environment secrets) for PRs
2. For forked PRs, consider using public test credentials
3. Require secrets only for main branch runs

---

## Current Status

**Secrets Configured:** 0/0 (None required)

**Recommended Next Steps:**
1. Review workflow for optional secrets needed
2. Configure secrets based on team needs
3. Enable notifications (Slack webhook) for failure alerts

---

**Generated by:** BMAD TEA Agent  
**Workflow:** `bmad/bmm/testarch/ci`  
**Last Updated:** 2025-11-02

