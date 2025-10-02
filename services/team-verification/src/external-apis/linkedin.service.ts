import { Injectable } from '@nestjs/common';

@Injectable()
export class LinkedInService {
  async getProfile(profileId: string): Promise<any> {
    return { profileId, data: {} };
  }
}

