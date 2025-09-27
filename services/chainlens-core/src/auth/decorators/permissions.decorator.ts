import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const TIERS_KEY = 'tiers';
export const RequireTiers = (...tiers: string[]) =>
  SetMetadata(TIERS_KEY, tiers);
