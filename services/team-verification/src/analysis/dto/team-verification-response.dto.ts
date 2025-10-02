export class TeamVerificationResponseDto {
  success: boolean;
  data?: any;
  error?: string;
  projectId?: string;
  totalMembers?: number;
  verifiedMembers?: number;
  credibilityScore?: number;
  experienceScore?: number;
  transparencyScore?: number;
  confidence?: number;
  riskFlags?: string[];
  warnings?: string[];
  teamMembers?: any[];
  lastUpdated?: Date;
  githubActivity?: {
    totalRepositories: number;
    activeRepos: number;
    totalCommits: number;
    contributors: number;
    organization?: string;
  };
}

