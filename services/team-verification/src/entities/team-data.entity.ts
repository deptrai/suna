export class TeamData {
  id: string;
  projectId: string;
  teamSize?: number;
  totalMembers?: number;
  verifiedMembers?: number;
  credibilityScore?: number;
  experienceScore?: number;
  transparencyScore?: number;
  confidence?: number;
  riskFlags?: any;
  rawData?: any;
  createdAt: Date;
  updatedAt: Date;
}

