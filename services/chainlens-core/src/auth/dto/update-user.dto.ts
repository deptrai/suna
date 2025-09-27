import { IsEmail, IsOptional, IsString, IsIn, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @ApiProperty({
    example: 'newemail@chainlens.com',
    description: 'Updated email address',
    required: false,
    format: 'email'
  })
  email?: string;

  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  @ApiProperty({
    example: 'John',
    description: 'Updated first name',
    required: false
  })
  firstName?: string;

  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  @ApiProperty({
    example: 'Doe',
    description: 'Updated last name',
    required: false
  })
  lastName?: string;

  @IsOptional()
  @IsIn(['free', 'pro', 'enterprise'], {
    message: 'Role must be one of: free, pro, enterprise'
  })
  @ApiProperty({
    example: 'pro',
    description: 'Updated subscription tier',
    enum: ['free', 'pro', 'enterprise'],
    required: false
  })
  role?: 'free' | 'pro' | 'enterprise';

  @IsOptional()
  @IsBoolean({ message: 'Active status must be a boolean' })
  @ApiProperty({
    example: true,
    description: 'User active status',
    required: false
  })
  isActive?: boolean;

  @IsOptional()
  @IsObject({ message: 'Metadata must be an object' })
  @ApiProperty({
    example: {
      preferences: {
        theme: 'dark',
        language: 'en',
        notifications: true
      },
      settings: {
        apiCallsLimit: 100,
        features: ['sentiment-analysis', 'onchain-analysis']
      }
    },
    description: 'User metadata and preferences',
    required: false
  })
  metadata?: any;
}
