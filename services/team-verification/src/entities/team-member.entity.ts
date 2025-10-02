export class TeamMember {
  id: string;
  projectId?: string;
  name: string;
  role?: string;
  verified: boolean;
  socialLinks?: any;
  githubProfile?: any;
  linkedinProfile?: any;
  credibilityScore?: number;
  experienceYears?: number;
  verificationSources?: any;
  createdAt: Date;
  updatedAt: Date;
}

