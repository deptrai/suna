export class VestingSchedule {
  id: string;
  projectId: string;
  beneficiary?: string;
  vestingPeriod?: string;
  amount?: number;
  totalAmount?: number;
  releaseDate?: Date;
  unlockPercentage?: number;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}

